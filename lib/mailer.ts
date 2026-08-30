import "server-only";

import { SES_FROM, sendViaSes } from "./ses";

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

/**
 * WHO THE APP'S OWN MAIL COMES FROM.
 *
 * `MAIL_FROM` is read first and is set nowhere — not in .env.local, not on the
 * ECS task definition — so until Aug 14 every product email would have gone
 * out from a personal domain. `EMAIL_FROM` is the variable that IS configured
 * and that lib/email.ts already uses, so it is the sensible middle rung: one
 * sender for everything the app sends, set in one place.
 *
 * The last resort stays a domain that is actually verified at Resend, because
 * Resend refuses a message from an unverified sender outright. Point
 * MAIL_FROM (or EMAIL_FROM) at a Freyr no-reply address the moment
 * freyrsolutions.com finishes verifying — that is a task-definition change,
 * not a code change.
 */
/**
 * ONE SENDER, AND IT IS FREYR'S (Anir, Aug 25: "get rid of this anirsuren.com
 * email. This should be completely off. Everywhere it's included, remove it.
 * This is not the email you ever use").
 *
 * The last resort used to be a personal domain, which is what every product
 * email actually went out from — it was the only thing verified anywhere. It
 * is gone, and the fallback is now the SES identity Freyr IT verified on their
 * own domain, so there is nothing left for the app to quietly send as.
 */
const FROM = () => SES_FROM;

/** What the app would actually put in the From line, for the health payload —
 *  a sender nobody has configured is invisible until a person asks why the
 *  email looked odd. */
export function mailerFrom(): string {
  return FROM();
}

export function mailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * THE HEADERS THAT MAKE OUTLOOK DRAW ITS RED EXCLAMATION MARK.
 *
 * Anir, Aug 26: "Is it possible to mark emails as important? You know how that
 * option's there in Outlook? That red exclamation mark comes in if you mark an
 * email as important."
 *
 * There is no single standard for it. Outlook reads `Importance`, older
 * clients read `X-Priority`, and Outlook's own web client historically wanted
 * `X-MSMail-Priority`, so all three go out together. Anything that understands
 * none of them simply shows an ordinary email.
 */
const HIGH_IMPORTANCE_HEADERS = {
  Importance: "high",
  "X-Priority": "1",
  "X-MSMail-Priority": "High",
} as const;

export async function sendMail(message: {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text: string;
  /** Mark it important, the way the Outlook flag does. */
  important?: boolean;
}): Promise<MailResult> {
  if (message.to.length === 0) return { ok: false, error: "No recipients." };

  /* SES first, on the identity Freyr IT verified. Resend has no verified
     domain left and refuses everything with a 403; it stays only for a host
     with no AWS session at all. Same reasoning as lib/email.ts. */
  const headers = message.important ? { ...HIGH_IMPORTANCE_HEADERS } : undefined;
  const viaSes = await sendViaSes({
    to: message.to,
    ...(headers ? { headers } : {}),
    ...(message.cc?.length ? { cc: message.cc } : {}),
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  if (viaSes.ok) return { ok: true, id: viaSes.messageId ?? "ses" };
  if (!viaSes.unavailable) {
    return { ok: false, error: viaSes.error ?? "SES refused the message." };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // CALL it — passing the function serialized to nothing, the `from`
        // field vanished, and Resend refused every message this app ever
        // tried to send (caught by Anir's test send, Aug 18).
        from: FROM(),
        to: message.to,
        ...(message.cc?.length ? { cc: message.cc } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(headers ? { headers } : {}),
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
export { emailShell } from "./emailShell";
import { emailShell } from "./emailShell";

