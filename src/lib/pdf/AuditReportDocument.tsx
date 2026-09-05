import "server-only";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { DIMENSION_LABELS, ALL_DIMENSION_KEYS, getScoreBand } from "@/lib/scoring/dimensions";
import type { ConfidenceLevel, DimensionKey } from "@/types/database";

// Brand colors from spec §8, expressed as static hex (react-pdf has no
// CSS custom property support).
const COLORS = {
  navy: "#0B1220",
  blue: "#2563EB",
  cyan: "#06B6D4",
  bg: "#F8FAFC",
  text: "#0F172A",
  textSecondary: "#64748B",
  border: "#E2E8F0",
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: COLORS.text },
  coverPage: { padding: 60, backgroundColor: COLORS.navy, color: "#ffffff", justifyContent: "center" },
  coverTitle: { fontSize: 32, fontWeight: 700, marginBottom: 12 },
  coverSubtitle: { fontSize: 14, color: "#CBD5E1", marginBottom: 40 },
  coverMeta: { fontSize: 11, color: "#94A3B8" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${COLORS.border}` },
  headerBrand: { fontSize: 10, fontWeight: 700, color: COLORS.navy },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: COLORS.textSecondary },
  h1: { fontSize: 18, fontWeight: 700, marginBottom: 10, color: COLORS.navy },
  h2: { fontSize: 13, fontWeight: 700, marginTop: 14, marginBottom: 6, color: COLORS.navy },
  paragraph: { fontSize: 10, lineHeight: 1.5, marginBottom: 8, color: COLORS.text },
  scoreBlock: { alignItems: "center", marginVertical: 16 },
  scoreNumber: { fontSize: 40, fontWeight: 700, color: COLORS.navy },
  scoreBand: { fontSize: 12, color: COLORS.blue, marginTop: 4 },
  dimensionRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottom: `1px solid ${COLORS.border}` },
  dimensionLabel: { fontSize: 10, color: COLORS.text },
  dimensionScore: { fontSize: 10, fontWeight: 700, color: COLORS.navy },
  findingItem: { marginBottom: 8 },
  findingTitle: { fontSize: 10, fontWeight: 700, color: COLORS.text },
  findingDesc: { fontSize: 9, color: COLORS.textSecondary, marginTop: 2 },
  badge: { fontSize: 8, color: COLORS.textSecondary, marginBottom: 2 },
  disclaimer: { fontSize: 8, color: COLORS.textSecondary, lineHeight: 1.4, marginTop: 20, paddingTop: 10, borderTop: `1px solid ${COLORS.border}` },
});

export interface PdfFinding {
  dimension_key: DimensionKey;
  type: "strength" | "weakness" | "opportunity";
  title: string;
  description: string;
}

export interface PdfRecommendation {
  title: string;
  description: string;
  why_it_matters: string | null;
  action_steps: string[];
}

export interface AuditReportDocumentProps {
  brandName: string;
  auditType: "quick" | "deep";
  completedAt: string | null;
  overallScore: number | null;
  overallConfidence: ConfidenceLevel | null;
  executiveSummary: string | null;
  dimensions: { dimension_key: DimensionKey; score: number | null; confidence: ConfidenceLevel; summary: string | null }[];
  findings: PdfFinding[];
  recommendations: PdfRecommendation[];
  actionPlan30Day: { fixFirst?: { title: string; whyItMatters: string; actionSteps: string[] }[] } | null;
}

function Header() {
  return (
    <View style={styles.header} fixed>
      <Text style={styles.headerBrand}>BrandSight</Text>
      <Text style={{ fontSize: 8, color: COLORS.textSecondary }}>Confidential marketing audit</Text>
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>BrandSight — See Your Brand Clearly</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

export function AuditReportDocument(props: AuditReportDocumentProps) {
  const {
    brandName,
    auditType,
    completedAt,
    overallScore,
    overallConfidence,
    executiveSummary,
    dimensions,
    findings,
    recommendations,
    actionPlan30Day,
  } = props;

  const strengths = findings.filter((f) => f.type === "strength").slice(0, 5);
  const weaknesses = findings.filter((f) => f.type === "weakness").slice(0, 5);
  const dimensionByKey = new Map(dimensions.map((d) => [d.dimension_key, d]));

  return (
    <Document title={`BrandSight Audit — ${brandName}`} author="BrandSight">
      {/* Cover */}
      <Page size="A4" style={styles.coverPage}>
        <Text style={styles.coverTitle}>BrandSight</Text>
        <Text style={styles.coverSubtitle}>Marketing Audit Report</Text>
        <Text style={{ fontSize: 20, marginBottom: 8 }}>{brandName}</Text>
        <Text style={styles.coverMeta}>{auditType === "deep" ? "Deep Audit" : "Quick Audit"}</Text>
        <Text style={styles.coverMeta}>{completedAt ? new Date(completedAt).toLocaleDateString() : ""}</Text>
      </Page>

      {/* Executive summary + score */}
      <Page size="A4" style={styles.page}>
        <Header />
        <Text style={styles.h1}>Executive Summary</Text>
        {executiveSummary && <Text style={styles.paragraph}>{executiveSummary}</Text>}

        <View style={styles.scoreBlock}>
          <Text style={styles.scoreNumber}>{overallScore ?? "—"}/100</Text>
          <Text style={styles.scoreBand}>{overallScore != null ? getScoreBand(overallScore) : "Not fully scorable"}</Text>
          {overallConfidence && <Text style={{ fontSize: 9, color: COLORS.textSecondary, marginTop: 4 }}>Confidence: {overallConfidence}</Text>}
        </View>

        <Text style={styles.h2}>Dimension Scores</Text>
        {ALL_DIMENSION_KEYS.map((key) => {
          const d = dimensionByKey.get(key);
          return (
            <View key={key} style={styles.dimensionRow}>
              <Text style={styles.dimensionLabel}>{DIMENSION_LABELS[key]}</Text>
              <Text style={styles.dimensionScore}>{d?.score != null ? `${d.score}/100` : "N/A"}</Text>
            </View>
          );
        })}
        <Footer />
      </Page>

      {/* Strengths & weaknesses */}
      <Page size="A4" style={styles.page}>
        <Header />
        <Text style={styles.h1}>What&apos;s Working</Text>
        {strengths.length > 0 ? (
          strengths.map((f, i) => (
            <View key={i} style={styles.findingItem}>
              <Text style={styles.findingTitle}>{f.title}</Text>
              <Text style={styles.findingDesc}>{f.description}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.paragraph}>No clear strengths identified from the evidence available.</Text>
        )}

        <Text style={styles.h1}>What Needs Attention</Text>
        {weaknesses.length > 0 ? (
          weaknesses.map((f, i) => (
            <View key={i} style={styles.findingItem}>
              <Text style={styles.findingTitle}>{f.title}</Text>
              <Text style={styles.findingDesc}>{f.description}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.paragraph}>No significant weaknesses identified.</Text>
        )}
        <Footer />
      </Page>

      {/* Recommendations */}
      <Page size="A4" style={styles.page}>
        <Header />
        <Text style={styles.h1}>Priority Recommendations</Text>
        {recommendations.slice(0, 8).map((r, i) => (
          <View key={i} style={styles.findingItem}>
            <Text style={styles.findingTitle}>
              {i + 1}. {r.title}
            </Text>
            <Text style={styles.findingDesc}>{r.description}</Text>
            {r.why_it_matters && <Text style={styles.findingDesc}>Why it matters: {r.why_it_matters}</Text>}
          </View>
        ))}

        {actionPlan30Day?.fixFirst && actionPlan30Day.fixFirst.length > 0 && (
          <>
            <Text style={styles.h1}>30-Day Action Plan — Fix First</Text>
            {actionPlan30Day.fixFirst.map((item, i) => (
              <View key={i} style={styles.findingItem}>
                <Text style={styles.findingTitle}>{item.title}</Text>
                <Text style={styles.findingDesc}>{item.whyItMatters}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.disclaimer}>
          This report was generated by an AI-assisted analysis of information you provided and evidence that was
          accessible at the time of the audit (spec: BrandSight distinguishes observed, user-provided, inferred, and
          unavailable evidence throughout). It is intended as a directional marketing health-check, not a substitute
          for professional marketing, legal, or financial advice. Scores reflect the evidence available at the time
          of the audit and may change as your brand or public presence changes.
        </Text>
        <Footer />
      </Page>
    </Document>
  );
}
