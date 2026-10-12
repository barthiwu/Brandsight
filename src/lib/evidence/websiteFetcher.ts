import "server-only";
import net from "node:net";
import * as cheerio from "cheerio";
import { Agent } from "undici";
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
  /**
   * True when the fetch technically succeeded (a 200 HTML response came
   * back) but almost nothing usable could be parsed out of it — the
   * telltale signature of a JS-rendered site (Wix/Squarespace/Shopify
   * themes, a React/Vue SPA shell, etc.) where the real content loads
   * client-side and this fetcher, deliberately a plain HTML parse with no
   * headless browser (spec: never execute fetched JavaScript), only ever
   * sees an near-empty shell. Before this flag existed, that case was
   * indistinguishable from a genuinely thin/simple real page: both came
   * back `status: "fetched"` and got treated as full "observed" evidence,
   * so the AI could confidently assess a website it had effectively never
   * really read, without anything about that being visible anywhere.
   */
  isThin: boolean;
}

// A fetched page is "thin" when essentially none of the structural
// signal a real server-rendered page reliably has (page title,
// meta description, headings, CTA text, trust-signal phrases, and a
// meaningful amount of body text) came through parsing. The threshold is
// deliberately generous — a genuinely minimal real page (a single-page
// portfolio site, say) can still trip it — the label means "treat this
// evidence with real caution," not "this fetch failed."
const THIN_BODY_TEXT_CHARS = 200;

/**
 * Exported so callers that reload a previously-fetched result from
 * storage (website_sources columns are the same shape, just snake_case
 * and possibly null instead of undefined — see
 * pipeline/context.ts's isThinWebsiteEvidence) can recompute "thin"
 * without needing a dedicated DB column or duplicating the heuristic.
 */
export function isThinContent(parsed: {
  title?: string | null;
  description?: string | null;
  headings: string[];
  bodyText?: string | null;
  ctaText: string[];
  trustSignals: string[];
}): boolean {
  const hasStructuralSignal =
    Boolean(parsed.title) ||
    Boolean(parsed.description) ||
    parsed.headings.length > 0 ||
    parsed.ctaText.length > 0 ||
    parsed.trustSignals.length > 0;
  const bodyTextChars = (parsed.bodyText ?? "").length;
  return !hasStructuralSignal && bodyTextChars < THIN_BODY_TEXT_CHARS;
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
    if (!safety.ok || !safety.resolvedIp) {
      // assertSafeExternalUrl() always sets resolvedIp alongside ok: true
      // in practice, but failing closed on the (defensive) case where it
      // didn't is the only safe option — falling through to an unpinned
      // fetch would silently reopen the DNS-rebinding gap this is here to
      // close.
      return emptyFailure(safety.reason ?? "Blocked by SSRF policy.");
    }

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      // SSRF/DNS-rebinding fix: assertSafeExternalUrl() above resolved this
      // hostname and validated the address it got back, but a plain
      // fetch() does its own, independent DNS resolution at connect time.
      // A short-TTL/rebinding DNS server for an attacker-controlled domain
      // can return a public address for the check above and then a
      // private/internal one a moment later for the real request — the
      // classic TOCTOU bypass of a "resolve once and validate" SSRF guard.
      // Pinning this request's connection to the exact address that was
      // just validated (via a disposable per-request dispatcher) closes
      // that gap: the real request can never land anywhere other than the
      // address the guard actually approved. TLS SNI and the Host header
      // still use the original hostname — only the socket's destination
      // address is overridden — so certificate validation against the
      // real hostname is unaffected.
      const dispatcher = pinnedDispatcher(safety.resolvedIp);
      try {
        response = await fetch(currentUrl, {
          redirect: "manual",
          signal: controller.signal,
          headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
          // `dispatcher` is a Node/undici-specific RequestInit extension
          // not present in the lib.dom.d.ts fetch types this project's
          // tsconfig pulls in; it's correctly honored at runtime by
          // Node's native fetch (verified directly against a local
          // server with a custom resolver before relying on it here).
          // @ts-expect-error -- see comment above
          dispatcher,
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

/**
 * Builds a one-off undici Agent whose DNS resolution is hardcoded to the
 * single address assertSafeExternalUrl() already resolved and validated,
 * so the real request can't be redirected (via DNS rebinding between the
 * check and the connect) to anywhere the SSRF guard didn't actually
 * approve. Only the socket's destination address is overridden — the
 * request still uses the original URL's hostname for the Host header and
 * TLS SNI, so certificate validation is unaffected. A fresh Agent per
 * request (rather than one shared instance) keeps each hop pinned to
 * that hop's own validated address, since a redirect can move to a
 * completely different host.
 */
function pinnedDispatcher(resolvedIp: string): Agent {
  const family = net.isIP(resolvedIp);
  return new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        callback(null, [{ address: resolvedIp, family: family === 6 ? 6 : 4 }]);
      },
    },
  });
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
    isThin: isThinContent({ title, description, headings, bodyText, ctaText, trustSignals }),
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
    isThin: false,
  };
}
