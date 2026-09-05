# The audit engine

This document covers the eight dimensions, their subcriteria and weights,
how a dimension score becomes the overall BrandSight score, confidence,
evidence, priority ranking, and the 9-stage AI pipeline that produces all
of it. The architectural rationale for keeping scoring deterministic lives
in `docs/architecture.md`; this document is the reference for the actual
numbers and stage-by-stage behavior.

## The eight dimensions

```
positioning   Brand Positioning
audience      Target Audience
messaging     Brand Messaging
content       Content Strategy
social        Social Media Presence
visual        Visual Brand
digital       Digital Presence
competition   Competitive Position
```

Defined in `src/lib/scoring/dimensions.ts` (`ALL_DIMENSION_KEYS`,
`DIMENSION_LABELS`). Every audit — Quick or Deep — produces a score for
all eight; what differs between audit types is how much real evidence
feeds each one (see "Quick vs. Deep" below), not which dimensions exist.

## Subcriteria and weights

Each dimension is scored from a fixed set of weighted subcriteria
(`DIMENSION_SUBCRITERIA`), transcribed from the specification and
verified to sum to 1.00 per dimension:

| Dimension | Subcriteria (weight) |
|---|---|
| Positioning | Value proposition clarity (25%), Audience specificity (20%), Problem clarity (20%), Differentiation (25%), Offer clarity (10%) |
| Audience | Customer definition (30%), Customer problem understanding (25%), Audience specificity (20%), Customer motivation (15%), Segment alignment (10%) |
| Messaging | Clarity (25%), Value communication (25%), Differentiation (20%), Consistency (15%), CTA quality (15%) |
| Content | Strategic relevance (25%), Audience alignment (20%), Content variety (15%), Value/education (15%), Promotional balance (10%), Consistency (15%) |
| Social | Profile optimization (20%), Content quality (25%), Consistency (15%), Engagement signals (15%), Brand consistency (15%), CTA/conversion path (10%) |
| Visual | Visual consistency (25%), Professionalism (20%), Typography (15%), Color usage (15%), Imagery (15%), Brand recognizability (10%) |
| Digital | Website clarity (20%), Value proposition (20%), Conversion path (20%), Trust signals (15%), Contact accessibility (10%), User experience (15%) |
| Competition | Differentiation (30%), Competitor clarity (20%), Positioning strength (25%), Competitive opportunity (25%) |

The AI (Stage 3) scores each subcriterion 0-100, or marks it `null` when
the evidence genuinely doesn't support a rating — it is explicitly
instructed never to guess a number to fill a gap.

## From subcriteria to a dimension score

`computeDimensionScore()` (`src/lib/scoring/engine.ts`) is a
weighted average, **renormalized over only the subcriteria that have a
score**: if two of five subcriteria are `null`, the score is the weighted
average of the remaining three, using their relative weights, not their
weights divided by 5. If every subcriterion for a dimension is `null`, the
dimension itself is `null` ("unscorable") — never coerced to zero, since
zero would be indistinguishable from "we looked and it's terrible" rather
than "we have no evidence." Scores are clamped to [0, 100] and rounded to
the nearest integer.

## From dimension scores to the overall score

```
positioning 15%   audience 10%   messaging 15%   content 15%
social      10%   visual   10%   digital    15%   competition 10%
```

(`DIMENSION_WEIGHTS`, sums to 1.00.) `computeOverallScore()` applies the
same renormalization rule one level up: a dimension that came back `null`
is excluded from both the weighted sum and the total weight it's divided
by, so a genuinely unscorable dimension (e.g. a Quick audit with no
competitor data at all) reduces the *coverage* of the overall score rather
than dragging it toward zero. `coveredWeight` and `dimensionsUsed` are
returned alongside the score specifically so this reduced coverage can be
surfaced rather than hidden — it's also exactly why confidence is
calculated from evidence mix rather than just being "high" whenever a
number comes out.

## Score bands

```
90-100  Exceptional
80-89   Strong
70-79   Good Foundation
60-69   Needs Improvement
40-59   Weak
0-39    Critical
```

`getScoreBand()` (`src/lib/scoring/dimensions.ts`). Every boundary value —
39, 40, 59, 60, 69, 70, 79, 80, 89, 90, 100 — is exercised by an
`it.each` table in `tests/unit/scoring-engine.test.ts`.

## Confidence

Each dimension gets a confidence level (`calculateConfidence()`) from the
mix of evidence behind it, not from the score itself:

- **High** — at least one piece of independently `observed` evidence
  (a scraped website, an OpenAI vision read of an uploaded asset) *and*
  fewer than 25% of evidence items are `unavailable`.
- **Medium** — no `observed` evidence, but the business owner `provided`
  at least one relevant answer.
- **Low** — little or no evidence of any kind, or `unavailable` items make
  up 60% or more of the total.

The overall audit confidence (`calculateOverallConfidence()`) averages the
eight dimension confidences (high=2, medium=1, low=0) and buckets the
result back into high/medium/low. This is what keeps a report built
entirely from self-reported answers from reading as equally authoritative
to one backed by real website/asset/competitor analysis — the UI surfaces
confidence per dimension and overall, never just the score alone.

## Evidence

Every `audit_evidence` row has a `source_type`, `source_reference`,
`evidence_status`, and `content`, scoped to one `audit_id` and (usually) one
`dimension`. `evidence_status` is one of:

- **`provided`** — the business owner's own self-reported answer.
- **`observed`** — something independently gathered and analyzed: a
  fetched website page, an OpenAI vision/document analysis of an uploaded
  asset, a fetched competitor page.
- **`inferred`** — the model drew a conclusion without direct evidence for
  it (e.g. inferring visual-brand traits from a business description
  alone, with no assets uploaded).
- **`unavailable`** — explicitly recorded as missing rather than silently
  skipped, so the confidence calculation can see how much evidence
  coverage a dimension actually has.

The status is never upgraded past what actually happened — a hardening-pass
fix removed a bug where website-visual evidence was marked `observed`
merely because *unrelated* uploaded assets existed for the audit (an
inference mislabeled as an observation); it's unconditionally `inferred`
now unless the website itself was actually fetched.

**Evidence traceability.** Findings (Stage 4) cite evidence by a
label (`"E1"`, `"E2"`, ...) built from the real rows just inserted for this
audit (`labelEvidenceRows()`/`renderEvidenceIndex()` in
`src/lib/ai/pipeline/evidenceLinking.ts`). `resolveEvidenceRefs()` then
maps the model's cited labels back to real evidence UUIDs, persisted as
`audit_findings.evidence_ids` — any label the model returns that wasn't in
the index it was actually given is dropped rather than persisted as a
plausible-looking but fake reference. The dimension and finding detail
pages resolve `evidence_ids` back to the underlying evidence rows and show
them in a disclosure under each finding; a finding whose citations don't
resolve to anything (rare — only possible if a finding is genuinely a
synthesis across the whole dimension rather than one piece of evidence)
shows an honest "Synthesized from the overall dimension analysis" note
instead of fabricating a citation.

## Priority ranking

`computePriorityScore()` (`src/lib/scoring/priority.ts`):

```
priority = (impact_weight * 2 + severity_weight) - (difficulty_weight * 0.5)
```

where impact/severity/difficulty are mapped low=1, medium=2, high=3,
critical=4 (severity capped at 3), giving a 0.5-8.5 range. The small
difficulty penalty (a subtraction, not a divisor) is deliberate: it keeps
a hard-but-very-important item from being buried under easier, lower-value
ones. `rankByPriority()` sorts descending by this score; ties are broken by
preserving the original (evidence/finding) order, since JavaScript's
`Array.prototype.sort` has been spec-guaranteed stable since ES2019 — this
means the AI's own output order acts as the tiebreaker for equally-ranked
items rather than an arbitrary reshuffle on every render. Both the
formula's monotonicity and the tie-breaking behavior are unit tested in
`tests/unit/priority.test.ts`.

## The 9-stage pipeline

`runAuditPipeline()` (`src/lib/ai/pipeline/runPipeline.ts`) runs once per
audit, invoked only after the caller has already won the
`try_lock_audit_processing` lock (see `docs/security.md`).

1. **Gather** (`context.ts`) — reads the audit's brand, responses, website
   source, competitors, social profiles, and uploaded assets into one
   context object.
2. **Normalize** (Stage 1, `stage1-normalize.ts`, AI call) — condenses the
   raw context into short summaries (business, audience, positioning,
   objectives, marketing, competitive) that later stages read instead of
   re-parsing raw form answers each time.
3. **Evidence** (deterministic, not a numbered AI stage) — three
   sub-steps run in this order, each best-effort so one failure doesn't
   sink the whole pipeline:
   - `analyzeAuditAssets()` — a real OpenAI vision call per image asset
     and a real OpenAI file-input call per PDF (Known Issue #1 fix — see
     "Asset analysis" below).
   - `gatherCompetitorEvidence()` — always records the user-provided
     competitor name/notes; for Deep audits only, also fetches each
     competitor's site (Known Issue #6 — see "Quick vs. Deep" below).
   - `buildEvidenceRows()` — the audited business's own website fetch
     result and self-reported answers, formatted as evidence rows.
   All evidence rows are inserted together, then labeled for citation
   (see "Evidence" above).
4. **Dimension analysis** (Stage 3, `stage3-dimensions.ts`, AI call) — one
   structured call that scores every subcriterion for all eight
   dimensions from the gathered evidence. Validated by
   `DimensionAnalysisBatchSchema`, which requires exactly 8 items, exactly
   the 8 known dimension keys, no duplicates, and no unknown keys — a
   bare `.length(8)` would pass an output with `"positioning"` twice and
   `"content"` missing, so this adds an explicit uniqueness +
   completeness check via `.superRefine()` on top of the per-item enum.
5. **Findings** (Stage 4, `stage4-findings.ts`, AI call) — strengths,
   weaknesses, and opportunities per dimension, each citing evidence
   labels as described above.
6. **Recommendations** (Stage 5, `stage5-recommendations.ts`, AI call) —
   each recommendation is generated from specific findings (never a
   generic "post more" — the prompt requires what/why/how, plus an
   impact/difficulty/timeframe estimate) and, where applicable, linked
   back to the finding that motivated it (`finding_id`).
7. **Prioritization** (deterministic, not an AI stage) — `computePriorityScore()`
   + `rankByPriority()` order both findings and recommendations; the model
   never reorders its own output arbitrarily, only the scoring engine
   ranks it.
8. **Executive summary** (Stage 7, `stage7-summary.ts`, AI call) — written
   from the already-computed overall score/band and the top-ranked
   findings/recommendations, not regenerated independently of them.
9. **30-day action plan** (Stage 8, `stage8-actionplan.ts`, AI call) —
   distributes the top-ranked recommendations across a `fixFirst` list and
   four weeks, explicitly instructed never to invent a recommendation that
   wasn't in the ranked list it was given.
10. **Report assembly** (deterministic) — persists `overall_score`,
    `overall_confidence`, `executive_summary`, `completed_at`, and flips
    the audit to `completed`. Any dimension the model somehow still
    omitted (schema validation above should make this impossible, but the
    check exists anyway) is logged and excluded from the overall score via
    the same renormalization used for a genuinely unscorable dimension,
    rather than silently defaulting it to zero.

Any exception anywhere in the pipeline is caught once at the top level,
recorded into `audits.processing_error`, and the audit is set to `failed`
rather than left stuck in `processing` — a failed audit can be retried
because `try_lock_audit_processing` accepts `failed` as a re-lockable
starting state.

## Asset analysis (Known Issue #1)

`analyzeAuditAssets()` (`src/lib/ai/pipeline/assetPipeline.ts`) downloads
each uploaded asset from Storage and routes it by MIME type:

- **Images** (`analyzeImageAsset()`) — a real OpenAI Responses API call
  with an `input_image` content part (the image as a data URL), asking for
  structured observations across visual hierarchy, typography, color
  usage, composition, imagery, CTA visibility, brand consistency,
  professionalism, and recognizability (`ImageAssetAnalysisSchema`).
- **PDFs** (`analyzeDocumentAsset()`) — a real OpenAI Responses API call
  with an `input_file` content part (the PDF as a data URL), asking for
  extracted textual content and structural observations
  (`DocumentAssetAnalysisSchema`).

Each asset's `analysis_status` is updated (`pending` → `completed` /
`failed`) and the formatted analysis becomes an `observed` evidence row
feeding directly into Stage 4 (dimension analysis) — real per-asset
analysis text is what the model sees for the Visual Brand dimension, not
a bare "3 assets uploaded" placeholder. A failure analyzing one asset
(a corrupt file, a transient API error) is caught per-asset and recorded
as `unavailable` evidence for that asset alone; it never fails the whole
pipeline.

## Competitor analysis (§9)

`gatherCompetitorEvidence()` (`src/lib/ai/pipeline/competitorPipeline.ts`):
every competitor the user listed always gets a `provided` evidence row
(name + whatever notes the user gave). For **Deep** audits only, up to
`MAX_COMPETITORS_TO_FETCH = 5` competitor URLs are also fetched with the
same SSRF-guarded `fetchWebsiteEvidence()` used for the audited business's
own site, and the extracted positioning/value-proposition/CTA/trust-signal
text becomes `observed` evidence for the Competition dimension. A
competitor site that can't be reached is recorded as `unavailable` — never
fabricated. Quick audits never attempt a competitor fetch at all, which is
also what the Quick audit's own UI copy says.

## Quick vs. Deep audits (Known Issue #6)

Both audit types score all eight dimensions and both can accept
user-provided competitor names in the questionnaire. What differs is which
evidence-gathering steps actually run and what the UI claims will happen:

| | Quick | Deep |
|---|---|---|
| Business/audience/objectives/marketing questions | ✓ | ✓ |
| User-provided competitor names/notes | ✓ (as context only) | ✓ |
| Competitor site fetch | ✗ | ✓ (up to 5) |
| Website fetch | ✓ if a URL was given | ✓ if a URL was given |
| Uploaded brand asset analysis | ✗ (upload UI not shown; server also rejects) | ✓ |
| Social media content analysis | ✗ (never) | ✗ (never) |

Brand asset uploads are rejected server-side for a Quick audit even if a
client somehow tried (`requestAssetUploadAction` checks
`audit_type === "deep"`), not just hidden by the wizard UI. **Neither**
audit type analyzes actual social media content — no platform API
integration exists in V1 — and the onboarding copy, the audit-type
selector, and the how-it-works page were all corrected during the
hardening pass to stop implying otherwise; the `social` dimension is
always scored from the business's own self-reported answers about their
social presence, which the confidence calculation reflects (it can never
reach "high" confidence from self-report alone).
