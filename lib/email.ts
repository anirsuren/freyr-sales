import { hasEmail } from "./env";
import { getDataMode } from "./dataMode";
import { SES_FROM, sendViaSes } from "./ses";

export interface EmailResult {
  ok: boolean;
  channel: "ses" | "resend" | "smtp" | "mock";
  skipped?: boolean;
  error?: string;
}

export type EmailAttachment = {
  filename: string;
  /** Base64-encoded file contents, without a data-URL prefix. */
  content: string;
};

async function sendWithConfiguredProvider(input: {
  to: string;
  /**
   * COPIED IN, INCLUDING PEOPLE WHO DO NOT USE THE APP (Anir, Aug 25: "if we
   * want to send that email to somebody who's a user of the app and then CC a
   * non-app user also in that email, that's possible, I hope").
   *
   * Nothing here has ever checked whether a recipient has an account — Resend
   * takes any address — but the helper only ever passed a single `to`, so
   * copying somebody was impossible however you asked for it.
   */
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  body: string;
  /**
   * THE FORMATTED VERSION (Saras, Aug 25: "a format bar for the message to be
   * added though — Bold, Italics, Underline, Font, Font Size, Font Colour,
   * Highlights, bullets, indentation"). When present it is sent as the mail's
   * HTML part, with `body` riding along as the plain-text alternative for
   * clients that refuse HTML. Absent, nothing changes.
   */
  html?: string;
  attachments?: EmailAttachment[];
  /** Mark it important, the way Outlook's own flag does. */
  important?: boolean;
}): Promise<EmailResult> {
  /**
   * SES FIRST, ON FREYR'S OWN VERIFIED DOMAIN (Anir, Aug 25: "get rid of this
   * anirsuren.com email... this is not the email you ever use").
   *
   * Resend has no verified domain left — `notifications.freyrsolutions.com`
   * never verified there because Freyr IT set the domain up in SES instead —
   * so every send through it now 403s. SES is verified, out of the sandbox,
   * and the ECS task role is granted send on that one identity. Resend stays
   * behind it only as a fallback for a host with no AWS session at all.
   */
  const viaSes = await sendViaSes({
    to: [input.to],
    ...(input.important
      ? {
          headers: {
            Importance: "high",
            "X-Priority": "1",
            "X-MSMail-Priority": "High",
          },
        }
      : {}),
    ...(input.cc?.length ? { cc: input.cc } : {}),
    ...(input.bcc?.length ? { bcc: input.bcc } : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    subject: input.subject,
    text: input.body,
    ...(input.html ? { html: input.html } : {}),
  });
  if (viaSes.ok) return { ok: true, channel: "ses" };
  // A real refusal from SES is the answer; only "no credentials here" falls on.
  if (!viaSes.unavailable) {
    return { ok: false, channel: "ses", error: viaSes.error };
  }

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
        from: SES_FROM,
        to: [input.to],
        ...(input.cc?.length ? { cc: input.cc } : {}),
        ...(input.bcc?.length ? { bcc: input.bcc } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        subject: input.subject,
        text: input.body,
        ...(input.html ? { html: input.html } : {}),
        /* The importance flag must survive the fallback. SES carries it as
           message headers; Resend accepts the same headers object — without
           this, a host with no AWS session sent the mail fine and silently
           dropped the one thing the sender clicked. */
        ...(input.important
          ? {
              headers: {
                Importance: "high",
                "X-Priority": "1",
                "X-MSMail-Priority": "High",
              },
            }
          : {}),
        ...(input.attachments?.length
          ? { attachments: input.attachments }
          : {}),
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
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  body: string;
  html?: string;
  attachments?: EmailAttachment[];
  important?: boolean;
}): Promise<EmailResult> {
  return sendWithConfiguredProvider(input);
}

/** The from-address every app email carries, for the composer to show. */
export function emailFromAddress(): string {
  return SES_FROM;
}
