import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables, DimensionKey, EvidenceStatus, EvidenceSourceType, ConfidenceLevel } from "@/types/database";
import { fetchWebsiteEvidence } from "@/lib/evidence/websiteFetcher";

export interface AuditContext {
  audit: Tables<"audits">;
  brand: Tables<"brands">;
  audience: Tables<"brand_audience"> | null;
  objectives: Tables<"brand_objectives"> | null;
  marketing: Tables<"marketing_profiles"> | null;
  competitors: Tables<"competitors">[];
  socialProfiles: Tables<"social_profiles">[];
  responses: Record<string, unknown>;
  websiteSource: Tables<"website_sources"> | null;
  assets: Tables<"audit_assets">[];
}

/**
 * Loads everything the pipeline needs for one audit, using the admin
 * (service role) client — safe here because this only ever runs
 * server-side after the calling route has already verified the caller
 * owns the audit (see app/api/audits/[auditId]/process/route.ts).
 */
export async function gatherAuditContext(auditId: string): Promise<AuditContext> {
  const supabase = createAdminClient();

  const { data: audit, error: auditError } = await supabase.from("audits").select("*").eq("id", auditId).single();
  if (auditError || !audit) throw new Error(`Audit ${auditId} not found.`);

  const [{ data: brand }, { data: audience }, { data: objectives }, { data: marketing }, { data: competitors }, { data: socialProfiles }, { data: responseRows }, { data: assets }] =
    await Promise.all([
      supabase.from("brands").select("*").eq("id", audit.brand_id).single(),
      supabase.from("brand_audience").select("*").eq("brand_id", audit.brand_id).maybeSingle(),
      supabase.from("brand_objectives").select("*").eq("brand_id", audit.brand_id).maybeSingle(),
      supabase.from("marketing_profiles").select("*").eq("brand_id", audit.brand_id).maybeSingle(),
      supabase.from("competitors").select("*").eq("brand_id", audit.brand_id),
      supabase.from("social_profiles").select("*").eq("brand_id", audit.brand_id),
      supabase.from("audit_responses").select("question_key, answer").eq("audit_id", auditId),
      supabase.from("audit_assets").select("*").eq("audit_id", auditId),
    ]);

  if (!brand) throw new Error(`Brand for audit ${auditId} not found.`);

  const responses: Record<string, unknown> = {};
  for (const row of responseRows ?? []) {
    responses[row.question_key] = row.answer;
  }

  // Deep audits (and quick audits where a website happens to be provided)
  // get one, non-crawling fetch of the primary site.
  const websiteUrl = brand.website_url?.trim();
  let websiteSource: Tables<"website_sources"> | null = null;
  if (websiteUrl) {
    const { data: existing } = await supabase
      .from("website_sources")
      .select("*")
      .eq("audit_id", auditId)
      .eq("url", websiteUrl)
      .maybeSingle();

    if (existing) {
      websiteSource = existing;
    } else {
      const result = await fetchWebsiteEvidence(websiteUrl);
      const { data: inserted } = await supabase
        .from("website_sources")
        .insert({
          audit_id: auditId,
          url: websiteUrl,
          status: result.status,
          title: result.title ?? null,
          description: result.description ?? null,
          headings: result.headings,
          body_text: result.bodyText ?? null,
          cta_text: result.ctaText,
          contact_information: result.contactInformation,
          trust_signals: result.trustSignals,
          fetched_at: result.status === "fetched" ? new Date().toISOString() : null,
          error_message: result.errorMessage ?? null,
        })
        .select("*")
        .single();
      websiteSource = inserted ?? null;
    }
  }

  return {
    audit,
    brand,
    audience: audience ?? null,
    objectives: objectives ?? null,
    marketing: marketing ?? null,
    competitors: competitors ?? [],
    socialProfiles: socialProfiles ?? [],
    responses,
    websiteSource,
    assets: assets ?? [],
  };
}

/**
 * Deterministic evidence-row construction (spec's "Stage 2 — Evidence
 * Analysis"). No AI call: the signal here is which sources exist and
 * what shape they're in, which we already know structurally — the AI's
 * job (Stage 3) is to interpret this evidence, not to re-discover it.
 */
export function buildEvidenceRows(ctx: AuditContext): {
  dimension: DimensionKey;
  source_type: EvidenceSourceType;
  source_reference: string | null;
  content: string | null;
  evidence_status: EvidenceStatus;
  confidence: ConfidenceLevel;
}[] {
  const rows: ReturnType<typeof buildEvidenceRows> = [];

  const add = (
    dimension: DimensionKey,
    source_type: EvidenceSourceType,
    evidence_status: EvidenceStatus,
    content: string | null,
    source_reference: string | null = null
  ) => {
    rows.push({
      dimension,
      source_type,
      source_reference,
      content,
      evidence_status,
      confidence: evidence_status === "observed" ? "high" : evidence_status === "provided" ? "medium" : "low",
    });
  };

  // User-provided narrative always counts as "provided" evidence for the
  // dimensions it speaks to.
  if (ctx.responses.business_description || ctx.brand.description) {
    add("positioning", "user_input", "provided", String(ctx.responses.business_description ?? ctx.brand.description));
  }
  if (ctx.audience?.ideal_customer || ctx.responses.ideal_customer) {
    add("audience", "user_input", "provided", String(ctx.audience?.ideal_customer ?? ctx.responses.ideal_customer));
  }
  if (ctx.marketing?.content_creation_process || ctx.responses.content_creation_process) {
    add(
      "content",
      "user_input",
      "provided",
      String(ctx.marketing?.content_creation_process ?? ctx.responses.content_creation_process)
    );
  }

  // Website observed evidence, when the fetch succeeded.
  if (ctx.websiteSource) {
    if (ctx.websiteSource.status === "fetched") {
      const summary = [
        ctx.websiteSource.title && `Title: ${ctx.websiteSource.title}`,
        ctx.websiteSource.description && `Meta description: ${ctx.websiteSource.description}`,
        ctx.websiteSource.headings.length > 0 && `Headings: ${ctx.websiteSource.headings.slice(0, 10).join(" | ")}`,
        ctx.websiteSource.cta_text.length > 0 && `CTAs found: ${ctx.websiteSource.cta_text.join(", ")}`,
        ctx.websiteSource.trust_signals.length > 0 && `Trust signals: ${ctx.websiteSource.trust_signals.join(", ")}`,
      ]
        .filter(Boolean)
        .join("\n");

      add("digital", "website", "observed", summary, ctx.websiteSource.url);
      add("messaging", "website", "observed", ctx.websiteSource.headings.join(" | "), ctx.websiteSource.url);
      // Always "inferred", never "observed": BrandSight does not screenshot
      // or otherwise visually render the website, so any statement about
      // its visual quality is inference from structure/copy alone — this
      // is independent of whether the user separately uploaded brand
      // assets (uploaded assets get their own, real vision analysis; see
      // pipeline/assetPipeline.ts). Evidence status must reflect what was
      // actually observed, not what else exists elsewhere in the audit.
      add(
        "visual",
        "website",
        "inferred",
        "The website's visual quality was not directly observed (no screenshot/rendering analysis) — inferred only from its text structure, headings, and copy.",
        ctx.websiteSource.url
      );
    } else {
      add("digital", "website", "unavailable", ctx.websiteSource.error_message ?? "Website could not be fetched.", ctx.websiteSource.url);
    }
  } else {
    add("digital", "system", "unavailable", "No website URL provided.");
  }

  // Social — never claim we accessed platform APIs; presence of a handle
  // is "provided", everything about content quality is "unavailable".
  if (ctx.socialProfiles.length > 0) {
    add(
      "social",
      "user_input",
      "provided",
      `Profiles listed: ${ctx.socialProfiles.map((s) => `${s.platform}${s.handle ? ` (${s.handle})` : ""}`).join(", ")}`
    );
    add(
      "social",
      "social",
      "unavailable",
      "BrandSight V1 does not authenticate against social platform APIs, so post content, consistency, and engagement cannot be independently observed."
    );
  } else {
    add("social", "system", "unavailable", "No social profiles provided.");
  }

  // NOTE: competitor evidence is intentionally NOT built here. Unlike the
  // rest of this function, a Deep audit's competitor evidence requires an
  // actual network fetch of each competitor's site, which can't happen in
  // this synchronous/deterministic builder. See
  // pipeline/competitorPipeline.ts's gatherCompetitorEvidence(), called
  // separately from runPipeline.ts, which records the user-provided
  // name/notes for every audit type and additionally fetches the site for
  // Deep audits — merged into this same evidence-row shape.
  if (ctx.competitors.length === 0) {
    add("competition", "system", "unavailable", "No competitors provided.");
  }

  // NOTE: uploaded-asset evidence is intentionally NOT built here. Unlike
  // every other row in this function, asset evidence requires an actual
  // network call (downloading the file, sending it to OpenAI vision) and
  // therefore can't be produced by this synchronous/deterministic builder.
  // See pipeline/assetPipeline.ts's analyzeAuditAssets(), called
  // separately from runPipeline.ts, which performs the real analysis and
  // returns evidence rows of this same shape to be merged in.

  return rows;
}

/** Renders the gathered context into the text block shared across Stage 3/4/5/7/8 prompts. */
export function renderContextForPrompt(
  ctx: AuditContext,
  normalized?: { businessSummary: string; audienceSummary: string; positioningSummary: string; objectivesSummary: string; marketingSummary: string; competitiveContext: string },
  /**
   * Real per-asset vision/document analysis text (from
   * pipeline/assetPipeline.ts's analyzeAuditAssets), keyed by file name.
   * Optional because this function runs before that analysis exists in
   * some call sites; when omitted, assets are described by name only.
   */
  assetAnalysisByFileName?: Map<string, string>,
  /**
   * Real competitor evidence text (from
   * pipeline/competitorPipeline.ts's gatherCompetitorEvidence) — includes
   * fetched-site summaries for Deep audits and honest "unavailable" notes
   * for a failed fetch. Optional for the same reason as
   * assetAnalysisByFileName above.
   */
  competitorEvidenceLines?: string[]
): string {
  const lines: string[] = [];
  lines.push(`Business: ${ctx.brand.name} (${ctx.brand.industry ?? "industry not specified"}, ${ctx.brand.country ?? "country not specified"})`);
  lines.push(`Audit type: ${ctx.audit.audit_type}`);

  if (normalized) {
    lines.push(`\n--- Normalized context ---`);
    lines.push(`Business: ${normalized.businessSummary}`);
    lines.push(`Audience: ${normalized.audienceSummary}`);
    lines.push(`Positioning: ${normalized.positioningSummary}`);
    lines.push(`Objectives: ${normalized.objectivesSummary}`);
    lines.push(`Marketing: ${normalized.marketingSummary}`);
    lines.push(`Competitive context: ${normalized.competitiveContext}`);
  }

  if (ctx.websiteSource?.status === "fetched") {
    lines.push(`\n--- Website evidence (${ctx.websiteSource.url}) ---`);
    lines.push(`Title: ${ctx.websiteSource.title ?? "(none)"}`);
    lines.push(`Description: ${ctx.websiteSource.description ?? "(none)"}`);
    lines.push(`Headings: ${ctx.websiteSource.headings.join(" | ") || "(none)"}`);
    lines.push(`CTAs: ${ctx.websiteSource.cta_text.join(", ") || "(none found)"}`);
    lines.push(`Trust signals: ${ctx.websiteSource.trust_signals.join(", ") || "(none found)"}`);
    lines.push(`Body excerpt: ${(ctx.websiteSource.body_text ?? "").slice(0, 3000)}`);
  } else if (ctx.websiteSource) {
    lines.push(`\n--- Website evidence ---\nCould not be fetched: ${ctx.websiteSource.error_message}`);
  } else {
    lines.push(`\n--- Website evidence ---\nNo website provided.`);
  }

  lines.push(`\n--- Social profiles ---`);
  lines.push(
    ctx.socialProfiles.length > 0
      ? ctx.socialProfiles.map((s) => `${s.platform}: ${s.handle ?? s.profile_url ?? "(no handle/url)"}`).join("\n")
      : "None provided."
  );

  lines.push(`\n--- Competitors ---`);
  if (ctx.competitors.length === 0) {
    lines.push("None provided.");
  } else if (competitorEvidenceLines && competitorEvidenceLines.length > 0) {
    lines.push(competitorEvidenceLines.join("\n\n"));
  } else {
    // Real evidence hasn't been gathered for this call site — list only
    // what the business owner typed, without implying any site was
    // visited.
    lines.push(ctx.competitors.map((c) => `${c.name}${c.url ? ` — ${c.url}` : ""}${c.notes ? ` (${c.notes})` : ""} (not fetched)`).join("\n"));
  }

  lines.push(`\n--- Uploaded brand assets ---`);
  if (ctx.assets.length === 0) {
    lines.push("None uploaded.");
  } else if (assetAnalysisByFileName) {
    lines.push(
      ctx.assets
        .map((a) => assetAnalysisByFileName.get(a.file_name) ?? `"${a.file_name}": analysis unavailable.`)
        .join("\n\n")
    );
  } else {
    // Analysis hasn't been run for this call site — name the files
    // honestly without implying they were inspected.
    lines.push(`${ctx.assets.map((a) => a.file_name).join(", ")} (not yet analyzed)`);
  }

  return lines.join("\n");
}
