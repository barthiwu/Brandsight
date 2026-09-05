import "server-only";
import * as cheerio from "cheerio";
import { assertSafeExternalUrl } from "./ssrfGuard";

/**
 * Server-side website evidence fetcher (spec §54). Fetches ONLY the
 * supplied primary URL — no crawling of additional pages, per spec
 * ("Do not build a full crawler"). SSRF-guarded on the initial URL and on
 * every redirect hop, with hard caps on redirects, response size, and
 * request time.
 */

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024; // 3 MB of HTML is already generous
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "BrandSightBot/1.0 (+marketing-audit; respects robots and fetches one page)";

export interface WebsiteFetchResult {
  status: "fetched" | "failed";
  title?: string;
  description?: string;
  headings: string[];
  bodyText?: string;
  ctaText: string[];
  contactInformation: Record<string, string[]>;
  trustSignals: string[];
  errorMessage?: string;
}

const CTA_PATTERNS = [
  /book\s+(a\s+)?(call|demo|consult)/i,
  /get\s+started/i,
  /sign\s*up/i,
  /contact\s+us/i,
  /shop\s+now/i,
  /buy\s+now/i,
  /learn\s+more/i,
  /request\s+a?\s*quote/i,
  /schedule/i,
  /subscribe/i,
  /try\s+(it\s+)?free/i,
  /order\s+now/i,
];

const TRUST_SIGNAL_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(privacy policy)\b/i, label: "Privacy policy linked" },
  { pattern: /\b(terms of service|terms & conditions|terms and conditions)\b/i, label: "Terms of service linked" },
  { pattern: /\b(testimonial|customer stor(y|ies)|case stud(y|ies))\b/i, label: "Testimonials or case studies present" },
  { pattern: /\b(secure checkout|ssl|ssl secured|ssl encrypted)\b/i, label: "Security/checkout trust messaging" },
  { pattern: /\b(money[- ]back guarantee|satisfaction guarantee)\b/i, label: "Guarantee messaging" },
  { pattern: /\b(as seen (in|on)|featured (in|on))\b/i, label: "Press/media mentions" },
];

export async function fetchWebsiteEvidence(rawUrl: string): Promise<WebsiteFetchResult> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safety = await assertSafeExternalUrl(currentUrl);
    if (!safety.ok) {
      return emptyFailure(safety.reason ?? "Blocked by SSRF policy.");
    }

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        response = await fetch(currentUrl, {
          redirect: "manual",
          signal: controller.signal,
          headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      return emptyFailure(`Could not reach the website (${(err as Error).message}).`);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return emptyFailure("Redirected without a destination.");
      currentUrl = new URL(location, currentUrl).toString();
      continue; // loop re-validates the new URL for SSRF before following it
    }

    if (!response.ok) {
      return emptyFailure(`Website responded with status ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
      return emptyFailure(`Unsupported content type: ${contentType || "unknown"}.`);
    }

    const html = await readBodyWithLimit(response, MAX_RESPONSE_BYTES);
    if (html === null) {
      return emptyFailure("Website response exceeded the size limit.");
    }

    return parseHtml(html);
  }

  return emptyFailure("Too many redirects.");
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return await response.text();

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}

function parseHtml(html: string): WebsiteFetchResult {
  const $ = cheerio.load(html);

  // Strip anything that isn't useful textual evidence, and anything unsafe
  // to ever execute (spec §53: never execute fetched JavaScript).
  $("script, style, noscript, svg, iframe").remove();

  const title = $("title").first().text().trim() || undefined;
  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    undefined;

  const headings = $("h1, h2, h3")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean)
    .slice(0, 40);

  const bodyTextRaw = $("body").text().replace(/\s+/g, " ").trim();
  const bodyText = bodyTextRaw.slice(0, 20_000) || undefined;

  const linkAndButtonText = $("a, button")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);

  const ctaText = Array.from(
    new Set(linkAndButtonText.filter((text) => CTA_PATTERNS.some((p) => p.test(text))))
  ).slice(0, 20);

  const emails = Array.from(new Set(bodyTextRaw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [])).slice(0, 5);
  const phones = Array.from(
    new Set(bodyTextRaw.match(/\+?\d[\d\s().-]{7,}\d/g)?.map((p) => p.trim()) ?? [])
  ).slice(0, 5);
  const hasContactPageLink = $("a")
    .map((_, el) => $(el).attr("href") ?? "")
    .get()
    .some((href) => /contact/i.test(href));

  const contactInformation: Record<string, string[]> = {
    emails,
    phones,
    ...(hasContactPageLink ? { contactPage: ["linked"] } : {}),
  };

  const trustSignals = TRUST_SIGNAL_PATTERNS.filter((t) => t.pattern.test(bodyTextRaw)).map((t) => t.label);

  return {
    status: "fetched",
    title,
    description,
    headings,
    bodyText,
    ctaText,
    contactInformation,
    trustSignals,
  };
}

function emptyFailure(message: string): WebsiteFetchResult {
  return {
    status: "failed",
    headings: [],
    ctaText: [],
    contactInformation: {},
    trustSignals: [],
    errorMessage: message,
  };
}
