import "server-only";

/**
 * SENDING MAIL FROM THE APP ITSELF.
 *
 * Sign-in mail goes out through Supabase, which was pointed at Resend on Aug 13
 * after its built-in sender ran dry at two messages an hour. Everything the
 * PRODUCT sends — the monthly notes Suren asked for — comes from here instead,
 * because Supabase only ever sends auth mail.
 *
 * Same Resend account, so there is one place to change the sender when
 * freyrsolutions.com finishes verifying. Until it does, MAIL_FROM should stay
 * on a domain that is verified, or Resend refuses the message.
 */

export type MailResult = { ok: true; id: string } | { ok: false; error: string };

const FROM =
  process.env.MAIL_FROM || "Freyr Sales <noreply@anirsuren.com>";

export function mailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendMail(message: {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set." };
  if (message.to.length === 0) return { ok: false, error: "No recipients." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: message.to,
        ...(message.cc?.length ? { cc: message.cc } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!res.ok || !body.id) {
      return { ok: false, error: body.message || `Send failed (${res.status}).` };
    }
    return { ok: true, id: body.id };
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : "Send failed.",
    };
  }
}

/** The shell every app email shares: plain, legible, no images to block. */
export function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f7fa;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#16202e;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3e9f2;border-radius:12px;overflow:hidden;">
  <div style="padding:18px 22px;border-bottom:2px solid #0071e3;">
    <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#0071e3;">Freyr Sales Intelligence</div>
    <div style="margin-top:4px;font-size:18px;font-weight:600;">${title}</div>
  </div>
  <div style="padding:20px 22px;font-size:14px;line-height:1.55;">${bodyHtml}</div>
  <div style="padding:14px 22px;border-top:1px solid #e3e9f2;font-size:12px;color:#55637a;">
    Sent automatically by the Freyr Sales platform.
  </div>
</div></body></html>`;
}
