/**
 * Evidence-to-finding traceability (hardening pass Known Issue #2).
 *
 * `audit_findings.evidence_ids` existed in the schema from the original
 * build but was always written as `[]` — findings were never actually
 * linked back to the `audit_evidence` rows that justified them, so a user
 * reading the report had no way to see *why* a conclusion was reached.
 *
 * Approach: after evidence rows are persisted (and therefore have real
 * database IDs), we give the Stage 4 (Findings) model a short-label index
 * of that evidence ("E1", "E2", ...) alongside the dimension analysis it
 * already receives, and ask it to cite which labels support each finding.
 * We never trust the model's citations blindly — `resolveEvidenceRefs`
 * only accepts labels that actually exist in the index we gave it, so a
 * hallucinated or malformed label is silently dropped rather than stored.
 *
 * Kept as pure, side-effect-free functions (no "server-only", no I/O) so
 * the label/resolve logic is directly unit-testable.
 */

export interface EvidenceForLinking {
  id: string;
  dimension: string;
  source_type: string;
  evidence_status: string;
  content: string | null;
}

export interface LabeledEvidence extends EvidenceForLinking {
  label: string;
}

/** Assigns a short, stable "E1", "E2", ... label to each evidence row for prompt-referencing. */
export function labelEvidenceRows(rows: EvidenceForLinking[]): LabeledEvidence[] {
  return rows.map((row, i) => ({ ...row, label: `E${i + 1}` }));
}

/** Renders the labeled evidence index as plain text for inclusion in an AI prompt. */
export function renderEvidenceIndex(labeled: LabeledEvidence[]): string {
  if (labeled.length === 0) return "(no evidence was gathered for this audit)";
  return labeled
    .map((e) => `[${e.label}] dimension=${e.dimension} source=${e.source_type} status=${e.evidence_status}: ${e.content ?? "(no content)"}`)
    .join("\n");
}

/**
 * Resolves model-cited evidence labels back to real evidence row IDs.
 * Unknown labels (hallucinated, mistyped, or referencing a different
 * audit's index) are dropped rather than stored — we never persist an
 * `evidence_ids` entry we can't verify actually exists. Duplicate labels
 * collapse to a single ID.
 */
export function resolveEvidenceRefs(labeled: LabeledEvidence[], refs: string[] | undefined | null): string[] {
  if (!refs || refs.length === 0) return [];
  const byLabel = new Map(labeled.map((e) => [e.label, e.id]));
  const resolved: string[] = [];
  for (const ref of refs) {
    const id = byLabel.get(ref);
    if (id && !resolved.includes(id)) resolved.push(id);
  }
  return resolved;
}
