import { hasEmail } from "./env";
import { getDataMode } from "./dataMode";

export interface EmailResult {
  ok: boolean;
  channel: "resend" | "smtp" | "mock";
  skipped?: boolean;
  error?: string;
}

async function sendWithConfiguredProvider(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return {
      ok: false,
      channel: "mock",
      skipped: true,
      error: "No supported email provider is configured.",
    };
  }

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
  } catch (error: unknown) {
    return {
      ok: false,
      channel: "resend",
      error: error instanceof Error ? error.message : "send failed",
    };
  }
}

// Send workspace outreach only while live data is active. Mock workspaces always
// simulate delivery even if a provider key exists, so demo clicks cannot contact
// real prospects.
export async function sendEmail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<EmailResult> {
  if (getDataMode() !== "live") {
    return { ok: true, channel: "mock", skipped: true };
  }
  if (!hasEmail()) {
    return { ok: true, channel: "mock", skipped: true };
  }

  return sendWithConfiguredProvider(input);
}

/**
 * Security and access-control messages are transactional infrastructure, not
 * mock/live CRM behavior. They must use the configured provider even while the
 * workspace is viewing mock data.
 */
export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<EmailResult> {
  return sendWithConfiguredProvider(input);
}
