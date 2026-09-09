// Read-only diagnostic: prints the most recently updated audit row's
// status and processing_error, straight from the live Supabase project via
// the service-role key. Written to investigate a live E2E failure where
// the app correctly showed a "We couldn't finish this audit" failure
// state, but the terminal output alone didn't say *why* the pipeline
// failed (runAuditPipeline's catch handler in
// src/lib/ai/pipeline/runPipeline.ts stores the real error message in
// audits.processing_error). No writes, no OpenAI calls — just one cheap
// Supabase read, so this is safe to run freely while debugging.
//
// Usage:
//   node scripts/debug/check-latest-audit.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envLocalPath = path.resolve(__dirname, "../../.env.local");

function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(envLocalPath, "utf8");
  } catch {
    return;
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (checked process.env and .env.local).");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const { data, error } = await supabase
  .from("audits")
  .select("id, status, audit_type, processing_error, created_at, updated_at, completed_at, brand_id, owner_id")
  .order("updated_at", { ascending: false })
  .limit(5);

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.log("No audit rows found.");
  process.exit(0);
}

console.log(`Most recent ${data.length} audit row(s), newest first:\n`);
for (const row of data) {
  console.log("----------------------------------------");
  console.log(`id:               ${row.id}`);
  console.log(`status:           ${row.status}`);
  console.log(`audit_type:       ${row.audit_type}`);
  console.log(`processing_error: ${row.processing_error ?? "(none)"}`);
  console.log(`created_at:       ${row.created_at}`);
  console.log(`updated_at:       ${row.updated_at}`);
  console.log(`completed_at:     ${row.completed_at ?? "(none)"}`);
}
