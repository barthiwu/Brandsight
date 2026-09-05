import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { gatherAuditContext, buildEvidenceRows } from "./context";
import { labelEvidenceRows, resolveEvidenceRefs } from "./evidenceLinking";
import { analyzeAuditAssets } from "./assetPipeline";
import { gatherCompetitorEvidence } from "./competitorPipeline";
import { runNormalizeStage } from "./stage1-normalize";
import { runDimensionAnalysisStage } from "./stage3-dimensions";
import { runFindingsStage } from "./stage4-findings";
import { runRecommendationsStage } from "./stage5-recommendations";
import { runExecutiveSummaryStage } from "./stage7-summary";
import { runActionPlanStage } from "./stage8-actionplan";
import { computeDimensionScore, computeOverallScore, calculateConfidence, calculateOverallConfidence } from "@/lib/scoring/engine";
import { computePriorityScore, rankByPriority } from "@/lib/scoring/priority";
import { ALL_DIMENSION_KEYS } from "@/lib/scoring/dimensions";
import type { DimensionKey, ConfidenceLevel } from "@/types/database";

/**
 * Runs the full 9-stage audit pipeline (spec §51) for one audit and
 * persists every result. Stages 2 (evidence), 6 (prioritization) and 9
 * (report assembly) are implemented deterministically rather than as AI
 * calls — see context.ts and scoring/ — because they're either pure data
 * transformation or exactly the kind of number the spec says the AI must
 * never invent (§38, §47).
 *
 * The caller (the process route handler) is responsible for having
 * already won the idempotency lock via try_lock_audit_processing before
 * calling this.
 */
export async function runAuditPipeline(auditId: string): Promise<void> {
  const supabase = createAdminClient();

  try {
    // --- Gather + Stage 1 (Normalize) + Stage 2 (Evidence, deterministic) ---
    const ctx = await gatherAuditContext(auditId);
    const normalized = await runNormalizeStage(ctx);

    // Real per-asset vision/document analysis (hardening pass Known Issue
    // #1) — a genuine OpenAI call per uploaded asset, run before Stage 3 so
    // the dimension-scoring model sees actual analysis rather than a bare
    // file-name list. Best-effort: a failure on one asset yields honest
    // "unavailable" evidence for that asset alone (see assetPipeline.ts).
    const assetEvidenceRows = await analyzeAuditAssets(ctx.assets);
    const assetAnalysisByFileName = new Map(assetEvidenceRows.map((r) => [r.source_reference ?? "", r.content ?? ""]));

    // Real competitor evidence (fetches each competitor's site for Deep
    // audits; records user-provided name/notes only for Quick — see
    // competitorPipeline.ts for the Known Issue #6 rationale).
    const competitorEvidenceRows = await gatherCompetitorEvidence(ctx.competitors, ctx.audit.audit_type);
    const competitorEvidenceLines = competitorEvidenceRows.map((r) => r.content ?? "").filter(Boolean);

    const evidenceRows = [...buildEvidenceRows(ctx), ...assetEvidenceRows, ...competitorEvidenceRows];
    let insertedEvidence: { id: string; dimension: string; source_type: string; evidence_status: string; content: string | null }[] = [];
    if (evidenceRows.length > 0) {
      const { data: evidenceData } = await supabase
        .from("audit_evidence")
        .insert(evidenceRows.map((r) => ({ ...r, audit_id: auditId })))
        .select("id, dimension, source_type, evidence_status, content");
      insertedEvidence = evidenceData ?? [];
    }
    // Labeled ("E1", "E2", ...) so Stage 4 can cite specific evidence rows
    // by a short, unambiguous handle instead of needing real UUIDs in the
    // prompt (hardening pass Known Issue #2 — evidence traceability).
    const labeledEvidence = labelEvidenceRows(insertedEvidence);

    // --- Stage 3: Dimension analysis ---
    const dimensionAnalyses = await runDimensionAnalysisStage(ctx, normalized, assetAnalysisByFileName, competitorEvidenceLines);

    const dimensionScores: Partial<Record<DimensionKey, number | null>> = {};
    const dimensionConfidences: ConfidenceLevel[] = [];
    const dimensionRows = dimensionAnalyses.map((analysis) => {
      const scored = computeDimensionScore(analysis.dimensionKey, analysis.subcriteria);
      const confidence = calculateConfidence({
        observed: analysis.evidenceObservedCount,
        provided: analysis.evidenceProvidedCount,
        inferred: analysis.evidenceInferredCount,
        unavailable: analysis.evidenceUnavailableCount,
      });
      dimensionScores[analysis.dimensionKey] = scored.score;
      dimensionConfidences.push(confidence);
      return {
        audit_id: auditId,
        dimension_key: analysis.dimensionKey,
        score: scored.score,
        confidence,
        summary: analysis.summary,
        subcriteria: analysis.subcriteria,
      };
    });
    await supabase.from("audit_dimensions").upsert(dimensionRows, { onConflict: "audit_id,dimension_key" });

    // --- Stage 4: Findings ---
    const findings = await runFindingsStage(dimensionAnalyses, labeledEvidence);
    const findingIds = findings.map(() => randomUUID());
    const findingRows = findings.map((f, i) => ({
      id: findingIds[i],
      audit_id: auditId,
      dimension_key: f.dimensionKey,
      type: f.type,
      title: f.title,
      description: f.description,
      severity: f.severity,
      impact: f.impact,
      difficulty: f.difficulty,
      priority_score: computePriorityScore({ impact: f.impact, difficulty: f.difficulty, severity: f.severity }),
      confidence: f.confidence,
      // Only labels that literally exist in the index we gave the model
      // are ever persisted — see resolveEvidenceRefs.
      evidence_ids: resolveEvidenceRefs(labeledEvidence, f.evidenceRefs),
    }));
    if (findingRows.length > 0) {
      await supabase.from("audit_findings").insert(findingRows);
    }

    // --- Stage 5: Recommendations ---
    const recommendations = await runRecommendationsStage(findings);
    const recommendationRows = recommendations.map((r) => {
      const linkedFinding = r.findingIndex !== null ? findings[r.findingIndex] : null;
      return {
        id: randomUUID(),
        audit_id: auditId,
        dimension_key: r.dimensionKey,
        finding_id: r.findingIndex !== null ? (findingIds[r.findingIndex] ?? null) : null,
        title: r.title,
        description: r.description,
        why_it_matters: r.whyItMatters,
        action_steps: r.actionSteps,
        impact: r.impact,
        difficulty: r.difficulty,
        timeframe: r.timeframe,
        priority_score: computePriorityScore({
          impact: r.impact,
          difficulty: r.difficulty,
          severity: linkedFinding?.severity ?? null,
        }),
      };
    });
    if (recommendationRows.length > 0) {
      await supabase.from("audit_recommendations").insert(recommendationRows);
    }

    // --- Stage 6: Prioritization (deterministic ranking, already scored above) ---
    const rankedRecommendations = rankByPriority(
      recommendations.map((r, i) => ({ ...r, priority_score: recommendationRows[i].priority_score }))
    );

    // --- Stage 9 (partial, computed early so Stage 7 can reference it): Overall score ---
    const overall = computeOverallScore(dimensionScores);
    const overallConfidence = calculateOverallConfidence(dimensionConfidences);

    const strengthsAndWeaknesses = rankByPriority(
      findings
        .filter((f) => f.type !== "opportunity")
        .map((f, i) => ({ ...f, priority_score: findingRows[i]?.priority_score ?? 0 }))
    ).slice(0, 5);

    // --- Stage 7: Executive summary ---
    const executiveSummary = await runExecutiveSummaryStage({
      brandName: ctx.brand.name,
      overallScore: overall.overallScore,
      scoreBand: overall.band,
      topFindings: strengthsAndWeaknesses.slice(0, 3),
      topRecommendations: rankedRecommendations.slice(0, 3),
    });

    // --- Stage 8: 30-day action plan ---
    const actionPlan = await runActionPlanStage(rankedRecommendations.slice(0, 12));
    await supabase.from("audit_action_plans").upsert(
      {
        audit_id: auditId,
        plan_30_day: actionPlan,
        plan_60_day: [],
        plan_90_day: [],
      },
      { onConflict: "audit_id" }
    );

    // --- Stage 9: Report assembly — persist the audit's final state ---
    // Sanity check every dimension key was covered; anything the AI
    // dropped stays absent from dimensionScores rather than defaulting to
    // zero, which computeOverallScore already handles via renormalization.
    for (const key of ALL_DIMENSION_KEYS) {
      if (!(key in dimensionScores)) {
        console.warn(`[pipeline] audit ${auditId}: dimension "${key}" missing from AI output, excluded from overall score.`);
      }
    }

    await supabase
      .from("audits")
      .update({
        status: "completed",
        overall_score: overall.overallScore,
        overall_confidence: overallConfidence,
        executive_summary: executiveSummary,
        completed_at: new Date().toISOString(),
        processing_error: null,
      })
      .eq("id", auditId);
  } catch (err) {
    console.error(`[pipeline] audit ${auditId} failed`, err);
    await supabase
      .from("audits")
      .update({
        status: "failed",
        processing_error: err instanceof Error ? err.message : "Unknown processing error.",
      })
      .eq("id", auditId);
  }
}
