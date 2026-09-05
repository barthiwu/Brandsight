import { callStructuredStage } from "@/lib/ai/client";
import { BASE_SYSTEM_RULES, wrapExternalData } from "@/lib/ai/prompts";
import { NormalizedContextSchema, type NormalizedContext } from "./schemas";
import type { AuditContext } from "./context";

/** Stage 1 — Normalize: turn raw user input into structured business context. */
export async function runNormalizeStage(ctx: AuditContext): Promise<NormalizedContext> {
  const raw = [
    `Business name: ${ctx.brand.name}`,
    `Industry: ${ctx.brand.industry ?? "(not provided)"}`,
    `Country: ${ctx.brand.country ?? "(not provided)"}`,
    `Business model: ${ctx.brand.business_model ?? "(not provided)"}`,
    `Primary product/service: ${ctx.brand.primary_product_service ?? "(not provided)"}`,
    `Business description: ${ctx.brand.description ?? ctx.responses.business_description ?? "(not provided)"}`,
    `Primary objective: ${ctx.objectives?.primary_objective ?? ctx.responses.primary_objective ?? "(not provided)"}`,
    `Biggest marketing challenge: ${ctx.objectives?.biggest_marketing_challenge ?? ctx.responses.biggest_marketing_challenge ?? "(not provided)"}`,
    `Ideal customer: ${ctx.audience?.ideal_customer ?? ctx.responses.ideal_customer ?? "(not provided)"}`,
    `Customer problem solved: ${ctx.audience?.customer_problem ?? ctx.responses.customer_problem ?? "(not provided)"}`,
    `Reason customers choose them: ${ctx.audience?.customer_reason_to_choose ?? ctx.responses.customer_reason_to_choose ?? "(not provided)"}`,
    `Stated differentiator: ${ctx.audience?.differentiator ?? ctx.responses.differentiator ?? "(not provided)"}`,
    `Channels used: ${ctx.marketing?.channels?.join(", ") ?? "(not provided)"}`,
    `Posting frequency: ${ctx.marketing?.posting_frequency ?? "(not provided)"}`,
    `Currently advertising: ${ctx.marketing?.advertising_active ?? "(not provided)"}`,
    `Content produced: ${ctx.marketing?.content_creation_process ?? "(not provided)"}`,
    `Competitors: ${ctx.competitors.map((c) => c.name).join(", ") || "(none provided)"}`,
  ].join("\n");

  return callStructuredStage({
    stage: "normalize",
    schema: NormalizedContextSchema,
    schemaName: "normalized_context",
    instructions: `${BASE_SYSTEM_RULES}\n\nTask: Read the business-owner-provided information below and produce a clean, structured summary in your own words for each field. Do not add facts that were not stated or reasonably implied. If a field has no information, say so plainly (e.g. "Not specified by the business owner").`,
    input: wrapExternalData("business_owner_input", raw),
  });
}
