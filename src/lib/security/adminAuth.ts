import "server-only";

/**
 * Server-side admin allowlist (spec §73: "Use an allowlist or dedicated
 * admin role... Admin authorization must be server-side... Do not rely
 * solely on hiding admin links"). Every admin page and admin route
 * handler calls this itself — never trust a link being hidden in the nav.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}
