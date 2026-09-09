// Cheap, fast sanity check for OPENAI_MODEL — makes exactly ONE tiny,
// real OpenAI API call and reports whether the model ID resolves, without
// running the full 9-stage AI pipeline or the E2E suite. Written after a
// live E2E run 404'd with "model_not_found" for a stale hardcoded fallback
// (see src/lib/ai/client.ts's getConfiguredModel doc comment and
// HARDENING_REPORT.md) — this script exists so a model-ID change can be
// verified against the real API for pennies/seconds instead of spending a
// full live E2E run (which also costs several real OpenAI calls) just to
// find out the ID itself was wrong.
//
// Usage:
//   node scripts/debug/check-model.mjs
//
// Reads OPENAI_API_KEY / OPENAI_MODEL from the environment, falling back to
// parsing .env.local directly (no dotenv dependency in this project) for
// any var not already set.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envLocalPath = path.resolve(__dirname, "../../.env.local");

function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(envLocalPath, "utf8");
  } catch {
    return; // no .env.local — fine, rely on already-exported env vars
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";

if (!apiKey) {
  console.error("OPENAI_API_KEY is not set (checked process.env and .env.local). Aborting.");
  process.exit(1);
}

console.log(`Checking model "${model}" with a single minimal request...`);

const client = new OpenAI({ apiKey });

try {
  const response = await client.responses.create({
    model,
    input: "Reply with exactly one word: OK",
  });
  const text = response.output_text?.trim();
  console.log(`SUCCESS — model "${model}" is valid and responded: ${JSON.stringify(text)}`);
  process.exit(0);
} catch (err) {
  console.error(`FAILED — model "${model}" did not work:`);
  console.error(err?.message ?? err);
  process.exit(1);
}
