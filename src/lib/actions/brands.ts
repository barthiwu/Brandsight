"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  brandSchema,
  brandAudienceSchema,
  competitorSchema,
  socialProfileSchema,
} from "@/lib/validation/schemas";

export interface ActionState {
  error?: string;
  success?: string;
}

function fieldsFromForm(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, formData.get(k) ?? ""]));
}

const BRAND_FIELDS = [
  "name",
  "industry",
  "country",
  "city",
  "description",
  "website_url",
  "business_model",
  "primary_product_service",
  "years_operating",
];

export async function createBrandAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = brandSchema.safeParse(fieldsFromForm(formData, BRAND_FIELDS));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("brands")
    .insert({ ...normalizeBrand(parsed.data), owner_id: user.id })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not create brand. Please try again." };

  revalidatePath("/brands");
  redirect(`/brands/${data.id}`);
}

export async function updateBrandAction(brandId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = brandSchema.safeParse(fieldsFromForm(formData, BRAND_FIELDS));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.from("brands").update(normalizeBrand(parsed.data)).eq("id", brandId);
  if (error) return { error: "Could not update brand." };

  revalidatePath(`/brands/${brandId}`);
  return { success: "Brand updated." };
}

export async function deleteBrandAction(brandId: string) {
  const supabase = await createClient();
  await supabase.from("brands").delete().eq("id", brandId);
  revalidatePath("/brands");
  redirect("/brands");
}

function normalizeBrand(input: ReturnType<typeof brandSchema.parse>) {
  return {
    name: input.name,
    industry: input.industry || null,
    country: input.country || null,
    city: input.city || null,
    description: input.description || null,
    website_url: input.website_url || null,
    business_model: input.business_model || null,
    primary_product_service: input.primary_product_service || null,
    years_operating: input.years_operating ?? null,
  };
}

const AUDIENCE_FIELDS = [
  "ideal_customer",
  "customer_problem",
  "customer_reason_to_choose",
  "differentiator",
  "market_segment",
  "age_range",
  "gender",
  "location",
  "income_segment",
  "customer_type",
];

export async function upsertBrandAudienceAction(brandId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = brandAudienceSchema.safeParse(fieldsFromForm(formData, AUDIENCE_FIELDS));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const record = Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [k, v || null]));

  const { error } = await supabase.from("brand_audience").upsert(
    { brand_id: brandId, ...record },
    { onConflict: "brand_id" }
  );
  if (error) return { error: "Could not save audience details." };

  revalidatePath(`/brands/${brandId}`);
  return { success: "Audience details saved." };
}

export async function upsertMarketingProfileAction(brandId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const channels = formData.getAll("channels").map(String);
  const supabase = await createClient();
  const { error } = await supabase.from("marketing_profiles").upsert(
    {
      brand_id: brandId,
      channels,
      posting_frequency: String(formData.get("posting_frequency") ?? "") || null,
      advertising_active: formData.get("advertising_active") === "true",
      content_creation_process: String(formData.get("content_creation_process") ?? "") || null,
      marketing_team_size: String(formData.get("marketing_team_size") ?? "") || null,
      marketing_budget_range: String(formData.get("marketing_budget_range") ?? "") || null,
    },
    { onConflict: "brand_id" }
  );
  if (error) return { error: "Could not save marketing profile." };
  revalidatePath(`/brands/${brandId}`);
  return { success: "Marketing profile saved." };
}

export async function addCompetitorAction(brandId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = competitorSchema.safeParse({
    name: formData.get("name"),
    url: formData.get("url") ?? "",
    social_handle: formData.get("social_handle") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid competitor" };

  const supabase = await createClient();
  const { count } = await supabase
    .from("competitors")
    .select("*", { count: "exact", head: true })
    .eq("brand_id", brandId);
  if ((count ?? 0) >= 5) return { error: "You can add up to 5 competitors." };

  const { error } = await supabase.from("competitors").insert({
    brand_id: brandId,
    name: parsed.data.name,
    url: parsed.data.url || null,
    social_handle: parsed.data.social_handle || null,
    notes: parsed.data.notes || null,
  });
  if (error) return { error: "Could not add competitor." };
  revalidatePath(`/brands/${brandId}`);
  return { success: "Competitor added." };
}

export async function removeCompetitorAction(brandId: string, competitorId: string) {
  const supabase = await createClient();
  await supabase.from("competitors").delete().eq("id", competitorId);
  revalidatePath(`/brands/${brandId}`);
}

export async function addSocialProfileAction(brandId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = socialProfileSchema.safeParse({
    platform: formData.get("platform"),
    profile_url: formData.get("profile_url") ?? "",
    handle: formData.get("handle") ?? "",
  });
  if (!parsed.success) return { error: "Invalid social profile" };

  const supabase = await createClient();
  const { error } = await supabase.from("social_profiles").insert({
    brand_id: brandId,
    platform: parsed.data.platform,
    profile_url: parsed.data.profile_url || null,
    handle: parsed.data.handle || null,
  });
  if (error) return { error: "Could not add social profile." };
  revalidatePath(`/brands/${brandId}`);
  return { success: "Social profile added." };
}

export async function updateBrandWebsiteAction(brandId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const url = String(formData.get("website_url") ?? "").trim();
  if (url && !/^https?:\/\/.+/i.test(url)) {
    return { error: "Enter a full URL starting with http(s)://" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("brands").update({ website_url: url || null }).eq("id", brandId);
  if (error) return { error: "Could not save website." };

  revalidatePath(`/brands/${brandId}`);
  return { success: "Website saved." };
}

export async function removeSocialProfileAction(brandId: string, socialProfileId: string) {
  const supabase = await createClient();
  await supabase.from("social_profiles").delete().eq("id", socialProfileId);
  revalidatePath(`/brands/${brandId}`);
}
