import { hasEmail } from "./env";

export interface EmailResult {
  ok: boolean;
  channel: "resend" | "smtp" | "mock";
  skipped?: boolean;
  error?: string;
}

// Send an email through the configured provider. With RESEND_API_KEY set we
// POST to Resend; otherwise we record the intent in mock mode (no key needed).
// Kept dependency-free so the mock-first build never requires extra installs.
export async function sendEmail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<EmailResult> {
  if (!hasEmail()) {
    return { ok: true, channel: "mock", skipped: true };
  }

  const key = process.env.RESEND_API_KEY;
  if (key) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "Freyr <sales@freyrsolutions.com>",
          to: [input.to],
          subject: input.subject,
          text: input.body,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return { ok: false, channel: "resend", error: `Resend ${res.status}` };
      }
      return { ok: true, channel: "resend" };
    } catch (e: any) {
      return { ok: false, channel: "resend", error: e?.message || "send failed" };
    }
  }

  return { ok: false, channel: "mock", skipped: true, error: "No supported email provider is configured." };
}
