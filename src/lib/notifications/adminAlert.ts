import "server-only";
import { Resend } from "resend";

/**
 * Best-effort proactive alert to the team on a pipeline failure, reusing
 * the same Resend account and RESEND_API_KEY / LEAD_NOTIFICATION_EMAIL
 * env vars already configured for lead notifications
 * (src/lib/notifications/leadNotification.ts) — no new external account
 * required to get this working.
 *
 * Before this existed, a pipeline failure was visible only by someone
 * actively opening /admin/system and checking; nothing pushed the
 * failure to anyone. Never throws — an alerting failure must never
 * affect the caller (the pipeline's own catch handler, which has already
 * done the important part: recording the failure to
 * audits.processing_error). Silent no-op when the env vars aren't set,
 * same as notifyNewLead.
 */
export async function notifyAdminOfPipelineFailure(auditId: string, errorMessage: string): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const toEmail = process.env.LEAD_NOTIFICATION_EMAIL;
    if (!apiKey || !toEmail) return;

    const resend = new Resend(apiKey);
    const fromEmail = process.env.LEAD_NOTIFICATION_FROM_EMAIL ?? "BrandSight <onboarding@resend.dev>";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

    await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `BrandSight: audit pipeline failed (${auditId.slice(0, 8)})`,
      text: [
        `An audit's AI pipeline failed and needs a look.`,
        "",
        `Audit ID: ${auditId}`,
        `Error: ${errorMessage}`,
        "",
        `Full detail: ${appUrl}/admin/system`,
      ].join("\n"),
    });
  } catch {
    // Best-effort only — never let an alerting failure affect the caller.
  }
}

/**
 * Best-effort alert for a sustained capacity problem — an audit had to
 * wait out the full capacity window and still got admitted over the
 * MAX_CONCURRENT_AUDITS soft cap (see the process route's
 * acquireProcessingSlot). One occurrence is normal under a short burst;
 * repeated occurrences mean the instance genuinely needs more headroom.
 * Same reuse-Resend, never-throws, silent-no-op-when-unset pattern as
 * notifyAdminOfPipelineFailure.
 */
export async function notifyAdminOfCapacityOverrun(auditId: string): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const toEmail = process.env.LEAD_NOTIFICATION_EMAIL;
    if (!apiKey || !toEmail) return;

    const resend = new Resend(apiKey);
    const fromEmail = process.env.LEAD_NOTIFICATION_FROM_EMAIL ?? "BrandSight <onboarding@resend.dev>";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

    await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `BrandSight: audit admitted over capacity (${auditId.slice(0, 8)})`,
      text: [
        `An audit had to wait out the full capacity window and was admitted anyway, over the MAX_CONCURRENT_AUDITS soft cap.`,
        `One of these is normal under a short traffic burst — if you're seeing several in a row, the instance likely needs more capacity (a bigger Render plan, or a real background-job architecture).`,
        "",
        `Audit ID: ${auditId}`,
        `See recent occurrences: ${appUrl}/admin/system`,
      ].join("\n"),
    });
  } catch {
    // Best-effort only — never let an alerting failure affect the caller.
  }
}
