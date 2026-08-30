/**
 * THE WRAPPER EVERY EMAIL THIS APP SENDS IS BUILT IN.
 *
 * Pure, and in a module of its own, because the admin's sent-log renders a
 * stored email back EXACTLY as it went out (Anir, Aug 30: "you're not even
 * showing me the emails") — and a client component cannot import lib/mailer,
 * which is server-only and pulls in the SES client.
 */
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