import "server-only";

/**
 * EMAIL LEAVES THROUGH AWS SES, ON FREYR'S OWN DOMAIN.
 *
 * The history, because it explains why this file exists and Resend still does
 * not:
 *
 * Aug 13, Krishna (Freyr IT) refused DKIM/SPF records on the root domain —
 * "don't allow the entire domain due to security concerns" — because those
 * records authorise a DOMAIN, not a mailbox, and would let the sender send as
 * anybody@freyrsolutions.com. We agreed on a subdomain instead, and he then
 * chose to do it his own way: "can we use direct AWS SMTP details rather than
 * using resend... i will take care of this from the DNS records generated
 * directly in the AWS SES identity validation."
 *
 * He did, and it works. `notifications.freyrsolutions.com` is verified in SES
 * with DKIM SUCCESS and a verified MAIL FROM, out of the sandbox, 50k/day.
 * The Resend copy of that domain still reads "failed" and always will —
 * nobody ever added Resend's records, because SES replaced that plan.
 *
 * What was never finished is THIS side. Only the announcement and digest jobs
 * moved to SES, and they did it by shelling out to the AWS CLI. Everything the
 * product itself sends — invitations above all — still went through the Resend
 * API from `noreply@anirsuren.com`, a personal domain, and the moment that
 * domain was deleted on Aug 25 every invitation started failing with
 * "Resend 403" (Anir: "get rid of this anirsuren.com email... this is not the
 * email you ever use").
 *
 * So: one sender, Freyr's own, for everything the app sends.
 *
 * Credentials come from the ambient chain — the ECS task role in production
 * (granted ses:SendEmail on this one identity and nothing else), a developer's
 * SSO session locally. No keys in the repo, and no key to rotate.
 */

export type SesResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  /** True when SES is simply not reachable here, so a caller can fall back. */
  unavailable?: boolean;
};

/** The verified identity. Overridable, but this is the one that is set up. */
export const SES_FROM =
  process.env.SES_FROM ||
  process.env.MAIL_FROM ||
  "Freyr Sales <noreply@notifications.freyrsolutions.com>";

export const SES_REGION = process.env.SES_REGION || "us-east-1";

/** The address a human reply should reach, since the sender is a no-reply. */
export const SES_REPLY_TO =
  process.env.SES_REPLY_TO || "anir.s@freyrsolutions.com";

export function sesFromAddress(): string {
  return SES_FROM;
}

/**
 * Whether sending can even be attempted here. Credentials are ambient, so this
 * cannot be answered by reading an env var — the honest answer only comes from
 * trying. What it CAN rule out is a build where the SDK is absent.
 */
export function sesConfigured(): boolean {
  return process.env.FREYR_DISABLE_SES !== "1";
}

let cached: unknown = null;

async function client() {
  if (cached) return cached;
  const { SESv2Client } = await import("@aws-sdk/client-sesv2");
  cached = new SESv2Client({ region: SES_REGION });
  return cached;
}

export async function sendViaSes(message: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
  /** Extra MIME headers, e.g. the three that make Outlook draw its red "!". */
  headers?: Record<string, string>;
}): Promise<SesResult> {
  if (!sesConfigured()) {
    return { ok: false, unavailable: true, error: "SES is disabled here." };
  }
  const to = message.to.filter(Boolean);
  if (!to.length) return { ok: false, error: "No recipients." };

  try {
    const { SendEmailCommand } = await import("@aws-sdk/client-sesv2");
    const ses = (await client()) as {
      send: (c: unknown) => Promise<{ MessageId?: string }>;
    };
    const res = await ses.send(
      new SendEmailCommand({
        FromEmailAddress: SES_FROM,
        Destination: {
          ToAddresses: to,
          ...(message.cc?.length ? { CcAddresses: message.cc } : {}),
          ...(message.bcc?.length ? { BccAddresses: message.bcc } : {}),
        },
        ReplyToAddresses: [message.replyTo || SES_REPLY_TO],
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: message.text, Charset: "UTF-8" },
              ...(message.html
                ? { Html: { Data: message.html, Charset: "UTF-8" } }
                : {}),
            },
            /* Custom headers on Simple content, supported since SESv2 gained
               Message.Headers — no need to hand-build a raw MIME message just
               to mark one mail important. */
            ...(message.headers && Object.keys(message.headers).length
              ? {
                  Headers: Object.entries(message.headers).map(
                    ([Name, Value]) => ({ Name, Value })
                  ),
                }
              : {}),
          },
        },
      })
    );
    return { ok: true, messageId: res.MessageId };
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string };
    /**
     * NO CREDENTIALS IS NOT A DELIVERY FAILURE. A developer with no AWS
     * session should see "not configured here", not a red error implying the
     * mail bounced — and the caller may want to fall back rather than fail.
     */
    const unavailable =
      /credential|token|Could not load credentials|region/i.test(
        `${err.name ?? ""} ${err.message ?? ""}`
      );
    return {
      ok: false,
      unavailable,
      error: err.message || err.name || "SES refused the message.",
    };
  }
}
