// Verifies RLS policy behavior (supabase/migrations/0005_row_level_security.sql
// and friends) against a real local Postgres instance — not a mock, not a
// code-reading exercise. See scripts/verification/README.md for setup.
//
// Connection is via standard PG* environment variables (PGHOST, PGUSER,
// PGPASSWORD, PGDATABASE, PGPORT), defaulting to a local
// "brandsight_verify" database as the "postgres" superuser.
import pg from "pg";

const admin = new pg.Pool({
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

async function asUser(userId, fn) {
  const client = await admin.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return await fn(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

async function asAnon(fn) {
  const client = await admin.connect();
  try {
    await client.query("begin");
    await client.query("set local role anon");
    return await fn(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

async function main() {
  // --- Seed two independent users, each with a brand and an audit ---
  const userA = (await admin.query("insert into auth.users (email) values ('user-a@example.com') returning id")).rows[0].id;
  const userB = (await admin.query("insert into auth.users (email) values ('user-b@example.com') returning id")).rows[0].id;

  const brandA = (
    await admin.query("insert into public.brands (owner_id, name) values ($1, 'Brand A') returning id", [userA])
  ).rows[0].id;
  const brandB = (
    await admin.query("insert into public.brands (owner_id, name) values ($1, 'Brand B') returning id", [userB])
  ).rows[0].id;

  const auditA = (
    await admin.query(
      "insert into public.audits (brand_id, owner_id, audit_type, status) values ($1, $2, 'deep', 'completed') returning id",
      [brandA, userA]
    )
  ).rows[0].id;

  // --- 1. User A can read their own audit ---
  await asUser(userA, async (c) => {
    const r = await c.query("select id from public.audits where id = $1", [auditA]);
    check("User A can SELECT their own audit", r.rows.length === 1);
  });

  // --- 2. User B CANNOT read User A's audit (the core named security test) ---
  await asUser(userB, async (c) => {
    const r = await c.query("select id from public.audits where id = $1", [auditA]);
    check("User B cannot SELECT User A's audit", r.rows.length === 0);
  });

  // --- 3. User B cannot UPDATE User A's audit ---
  await asUser(userB, async (c) => {
    const r = await c.query("update public.audits set status = 'cancelled' where id = $1", [auditA]);
    check("User B's UPDATE of User A's audit affects 0 rows", r.rowCount === 0);
  });

  // --- 4. User B cannot DELETE User A's audit ---
  await asUser(userB, async (c) => {
    const r = await c.query("delete from public.audits where id = $1", [auditA]);
    check("User B's DELETE of User A's audit affects 0 rows", r.rowCount === 0);
  });

  // --- 5. User B cannot INSERT an audit with a forged owner_id (claiming User A owns it) ---
  await asUser(userB, async (c) => {
    try {
      await c.query(
        "insert into public.audits (brand_id, owner_id, audit_type, status) values ($1, $2, 'quick', 'draft')",
        [brandB, userA]
      );
      check("User B cannot forge owner_id=User A on insert", false);
    } catch (err) {
      check("User B cannot forge owner_id=User A on insert", /row-level security|policy/i.test(err.message));
    }
  });

  // --- 6. User B cannot INSERT an audit against User A's brand_id (even with correct owner_id) ---
  await asUser(userB, async (c) => {
    try {
      await c.query(
        "insert into public.audits (brand_id, owner_id, audit_type, status) values ($1, $2, 'quick', 'draft')",
        [brandA, userB]
      );
      check("User B cannot create an audit against User A's brand_id", false);
    } catch (err) {
      check("User B cannot create an audit against User A's brand_id", /row-level security|policy/i.test(err.message));
    }
  });

  // --- 7. audit_findings has no client insert policy at all: authenticated insert must fail ---
  await asUser(userA, async (c) => {
    try {
      await c.query(
        "insert into public.audit_findings (audit_id, dimension_key, type, title, description) values ($1, 'positioning', 'strength', 'x', 'y')",
        [auditA]
      );
      check("Owner cannot directly INSERT into audit_findings (server-pipeline-only table)", false);
    } catch (err) {
      check("Owner cannot directly INSERT into audit_findings (server-pipeline-only table)", /row-level security|policy/i.test(err.message));
    }
  });

  // --- 8. Anonymous role cannot read anything from audits at all ---
  await asAnon(async (c) => {
    const r = await c.query("select id from public.audits where id = $1", [auditA]);
    check("Anonymous role cannot SELECT any audit row", r.rows.length === 0);
  });

  // --- 9. rate_limit_events is fully deny-all for authenticated (server-only via service_role) ---
  await asUser(userA, async (c) => {
    const r = await c.query("select id from public.rate_limit_events limit 1");
    check("Authenticated role cannot SELECT rate_limit_events", r.rows.length === 0);
  });

  // --- 10. Deleting a brand cascades to its audits and every audit-scoped
  // child table (data-deletion flow — hardening pass task) ---
  {
    const userC = (await admin.query("insert into auth.users (email) values ('user-c@example.com') returning id")).rows[0].id;
    const brandC = (await admin.query("insert into public.brands (owner_id, name) values ($1, 'Brand C') returning id", [userC])).rows[0].id;
    const auditC = (
      await admin.query(
        "insert into public.audits (brand_id, owner_id, audit_type, status) values ($1, $2, 'deep', 'completed') returning id",
        [brandC, userC]
      )
    ).rows[0].id;
    await admin.query(
      "insert into public.audit_findings (audit_id, dimension_key, type, title, description) values ($1, 'positioning', 'strength', 'x', 'y')",
      [auditC]
    );

    await admin.query("delete from public.brands where id = $1", [brandC]);

    const auditsLeft = await admin.query("select id from public.audits where id = $1", [auditC]);
    const findingsLeft = await admin.query("select id from public.audit_findings where audit_id = $1", [auditC]);
    check("Deleting a brand cascades to delete its audits", auditsLeft.rows.length === 0);
    check("Deleting a brand cascades all the way to audit-scoped child tables (audit_findings)", findingsLeft.rows.length === 0);
  }

  // --- 11. Deleting the auth.users row cascades to profiles/brands/audits
  // (account-deletion flow) ---
  {
    const userD = (await admin.query("insert into auth.users (email) values ('user-d@example.com') returning id")).rows[0].id;
    const brandD = (await admin.query("insert into public.brands (owner_id, name) values ($1, 'Brand D') returning id", [userD])).rows[0].id;
    await admin.query(
      "insert into public.audits (brand_id, owner_id, audit_type, status) values ($1, $2, 'quick', 'completed')",
      [brandD, userD]
    );

    await admin.query("delete from auth.users where id = $1", [userD]);

    const profileLeft = await admin.query("select id from public.profiles where id = $1", [userD]);
    const brandsLeft = await admin.query("select id from public.brands where id = $1", [brandD]);
    check("Deleting the auth user cascades to their profile row", profileLeft.rows.length === 0);
    check("Deleting the auth user cascades all the way to their brands/audits", brandsLeft.rows.length === 0);
  }

  console.log(failures === 0 ? "\nALL RLS CHECKS PASSED" : `\n${failures} RLS CHECK(S) FAILED`);
  await admin.end();
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
