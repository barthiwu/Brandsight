// Verifies that try_lock_audit_processing (migration 0004, granted per
// migration 0007) prevents the AI pipeline from ever being kicked off twice
// concurrently for the same audit — the named "duplicate audit processing"
// security test (hardening pass §57/§58). The route handler
// (src/app/api/audits/[auditId]/process/route.ts) calls this function and
// only proceeds to runAuditPipeline() if it returns true, treating a false
// result as "another request already won the lock".
//
// This is a single atomic `UPDATE ... WHERE status IN (...) RETURNING`,
// which Postgres serializes via the row's own lock — no advisory lock is
// needed here (unlike the rate limiter, which has to coordinate across
// many distinct keys/rows). This script proves that under real concurrent
// callers, exactly one wins regardless of how many duplicate clicks/retries
// race in at once.
import pg from "pg";

const pool = new pg.Pool({
  host: process.env.PGHOST ?? "localhost",
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.PGDATABASE ?? "brandsight_verify",
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
});

let failures = 0;
function check(label, cond) {
  if (cond) {
    console.log(`PASS: ${label}`);
  } else {
    console.error(`FAIL: ${label}`);
    failures++;
  }
}

async function main() {
  const userId = (await pool.query("insert into auth.users (email) values ($1) returning id", [
    `dup-race-${Date.now()}@example.com`,
  ])).rows[0].id;
  const brandId = (
    await pool.query("insert into public.brands (owner_id, name) values ($1, 'Dup Race Co') returning id", [userId])
  ).rows[0].id;

  // --- Scenario 1: many concurrent callers racing to start the SAME ready audit ---
  {
    const auditId = (
      await pool.query(
        "insert into public.audits (brand_id, owner_id, audit_type, status) values ($1, $2, 'quick', 'ready') returning id",
        [brandId, userId]
      )
    ).rows[0].id;

    const concurrency = 25;
    const results = await Promise.all(
      Array.from({ length: concurrency }, () =>
        pool.query("select try_lock_audit_processing($1) as locked", [auditId])
      )
    );
    const wins = results.filter((r) => r.rows[0].locked === true).length;
    const losses = results.filter((r) => r.rows[0].locked === false).length;

    check(`Exactly 1 of ${concurrency} concurrent lock attempts wins`, wins === 1);
    check(`The other ${concurrency - 1} attempts lose (see 'Already in progress' response)`, losses === concurrency - 1);

    const { rows: statusRows } = await pool.query("select status from public.audits where id = $1", [auditId]);
    check("Audit status transitioned to 'processing' exactly once", statusRows[0].status === "processing");
  }

  // --- Scenario 2: an audit that is already processing cannot be locked again
  // (simulates a duplicate request arriving after the first one already won) ---
  {
    const auditId = (
      await pool.query(
        "insert into public.audits (brand_id, owner_id, audit_type, status) values ($1, $2, 'quick', 'processing') returning id",
        [brandId, userId]
      )
    ).rows[0].id;

    const { rows } = await pool.query("select try_lock_audit_processing($1) as locked", [auditId]);
    check("Cannot acquire the lock for an audit already in 'processing'", rows[0].locked === false);
  }

  // --- Scenario 3: 'completed' and 'draft' audits cannot be locked either
  // (only 'ready' or 'failed' are eligible per the route handler's own
  // pre-check, mirrored inside the function's WHERE clause as defense in depth) ---
  for (const status of ["completed", "draft", "cancelled"]) {
    const auditId = (
      await pool.query(
        "insert into public.audits (brand_id, owner_id, audit_type, status) values ($1, $2, 'quick', $3) returning id",
        [brandId, userId, status]
      )
    ).rows[0].id;
    const { rows } = await pool.query("select try_lock_audit_processing($1) as locked", [auditId]);
    check(`Cannot acquire the lock for an audit in '${status}' status`, rows[0].locked === false);
  }

  // --- Scenario 4: a 'failed' audit (retry path) CAN be locked ---
  {
    const auditId = (
      await pool.query(
        "insert into public.audits (brand_id, owner_id, audit_type, status) values ($1, $2, 'quick', 'failed') returning id",
        [brandId, userId]
      )
    ).rows[0].id;
    const { rows } = await pool.query("select try_lock_audit_processing($1) as locked", [auditId]);
    check("A 'failed' audit CAN be locked (retry-after-failure path)", rows[0].locked === true);
  }

  console.log(failures === 0 ? "\nALL DUPLICATE-PROCESSING RACE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  await pool.end();
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
