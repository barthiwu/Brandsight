import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Alert";
import { ScoreBandBadge } from "@/components/ui/Badge";
import { BrandForm } from "@/components/brand/BrandForm";
import { AudienceForm } from "@/components/brand/AudienceForm";
import { MarketingForm } from "@/components/brand/MarketingForm";
import { CompetitorsSection } from "@/components/brand/CompetitorsSection";
import { SocialProfilesSection } from "@/components/brand/SocialProfilesSection";
import { DeleteBrandButton } from "@/components/brand/DeleteBrandButton";
import { getScoreBand } from "@/lib/scoring/dimensions";
import {
  updateBrandAction,
  upsertBrandAudienceAction,
  upsertMarketingProfileAction,
  addCompetitorAction,
  removeCompetitorAction,
  addSocialProfileAction,
  removeSocialProfileAction,
  deleteBrandAction,
} from "@/lib/actions/brands";

export const dynamic = "force-dynamic";

interface BrandPageProps {
  params: Promise<{ brandId: string }>;
}

export default async function BrandDetailPage({ params }: BrandPageProps) {
  const { brandId } = await params;
  const supabase = await createClient();

  const [{ data: brand }, { data: audience }, { data: marketing }, { data: competitors }, { data: socials }, { data: audits }] =
    await Promise.all([
      supabase.from("brands").select("*").eq("id", brandId).maybeSingle(),
      supabase.from("brand_audience").select("*").eq("brand_id", brandId).maybeSingle(),
      supabase.from("marketing_profiles").select("*").eq("brand_id", brandId).maybeSingle(),
      supabase.from("competitors").select("*").eq("brand_id", brandId).order("created_at"),
      supabase.from("social_profiles").select("*").eq("brand_id", brandId).order("created_at"),
      supabase
        .from("audits")
        .select("id, audit_type, status, overall_score, created_at")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false }),
    ]);

  if (!brand) notFound();

  const latestCompleted = audits?.find((a) => a.status === "completed" && a.overall_score != null);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-text)">{brand.name}</h1>
          <p className="mt-1 text-sm text-(--color-text-secondary)">
            {brand.industry} {brand.website_url ? `· ${brand.website_url}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {latestCompleted?.overall_score != null && (
            <div className="text-right">
              <p className="text-xs text-(--color-text-secondary)">Latest score</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-semibold">{latestCompleted.overall_score}/100</span>
                <ScoreBandBadge band={getScoreBand(latestCompleted.overall_score)} />
              </div>
            </div>
          )}
          <Link href={`/audits/new?brandId=${brandId}`}>
            <Button>Start new audit</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
        </CardHeader>
        <CardBody>
          <BrandForm action={updateBrandAction.bind(null, brandId)} brand={brand} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audience</CardTitle>
        </CardHeader>
        <CardBody>
          <AudienceForm action={upsertBrandAudienceAction.bind(null, brandId)} audience={audience ?? undefined} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marketing profile</CardTitle>
        </CardHeader>
        <CardBody>
          <MarketingForm action={upsertMarketingProfileAction.bind(null, brandId)} profile={marketing ?? undefined} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Competitors</CardTitle>
        </CardHeader>
        <CardBody>
          <CompetitorsSection
            competitors={competitors ?? []}
            addAction={addCompetitorAction.bind(null, brandId)}
            removeAction={removeCompetitorAction.bind(null, brandId)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Social profiles</CardTitle>
        </CardHeader>
        <CardBody>
          <SocialProfilesSection
            profiles={socials ?? []}
            addAction={addSocialProfileAction.bind(null, brandId)}
            removeAction={removeSocialProfileAction.bind(null, brandId)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit history</CardTitle>
        </CardHeader>
        <CardBody>
          {audits && audits.length > 0 ? (
            <ul className="divide-y divide-(--color-border)">
              {audits.map((audit) => (
                <li key={audit.id}>
                  <Link href={`/audits/${audit.id}`} className="flex items-center justify-between gap-4 py-3">
                    <span className="text-sm text-(--color-text)">
                      {audit.audit_type === "deep" ? "Deep audit" : "Quick audit"} ·{" "}
                      {new Date(audit.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-sm text-(--color-text-secondary)">
                      {audit.overall_score != null ? `${audit.overall_score}/100` : audit.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No audits for this brand yet" />
          )}
        </CardBody>
      </Card>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-3 text-sm text-(--color-text-secondary)">
            Deleting {brand?.name ?? "this brand"} permanently removes it, every audit run against it, and any
            uploaded brand assets. This cannot be undone.
          </p>
          <DeleteBrandButton brandId={brandId} brandName={brand?.name ?? "this brand"} deleteAction={deleteBrandAction} />
        </CardBody>
      </Card>
    </div>
  );
}
