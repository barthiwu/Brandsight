// Verifies that check_and_record_rate_limit (migration 0008) holds the
// configured limit exactly under real concurrency, i.e. that the fix for
// the original check-then-act race actually closes it. See README.md.
import pg from "pg";

const pool = new pg.Pool({
  host: process.env.PGHOST ?? "localhost",
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.PGDATABASE ?? "brandsight_verify",
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
});

async function main() {
  const bucket = `race-test-${Date.now()}`;
  const limit = 5;
  const concurrency = 30;

  const results = await Promise.all(
    Array.from({ length: concurrency }, () =>
      pool.query("select * from check_and_record_rate_limit($1, $2, $3)", [bucket, limit, 3600])
    )
  );

  const allowedCount = results.filter((r) => r.rows[0].allowed).length;
  const { rows } = await pool.query("select count(*)::int as n from rate_limit_events where bucket_key = $1", [bucket]);

  console.log(`Concurrency: ${concurrency}, limit: ${limit}`);
  console.log(`Calls that were allowed: ${allowedCount}`);
  console.log(`Actual rows inserted for this bucket: ${rows[0].n}`);

  if (allowedCount !== limit || rows[0].n !== limit) {
    console.error(`FAIL: expected exactly ${limit} allowed and ${limit} rows, got allowed=${allowedCount} rows=${rows[0].n}`);
    process.exitCode = 1;
  } else {
    console.log("PASS: rate limit held exactly at the configured limit under concurrency.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
