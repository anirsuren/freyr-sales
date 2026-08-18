/**
 * SUPABASE'S OWN WORDS ARE NOT AN ANSWER (Anir, Aug 13, on seeing "email rate
 * limit exceeded" over the "Check your email" panel: "what the fuck does this
 * mean").
 *
 * That string is Supabase's internal error printed straight to a person trying
 * to sign in. It does not say what happened, whether anything broke, or what to
 * do next — and in that particular case the honest answer is reassuring: the
 * first link was sent and still works; only the SECOND one was refused, because
 * the project's built-in email sender allows a couple of messages an hour and
 * one per address per minute.
 *
 * Every raw auth error a person can see goes through here first. Anything not
 * recognised falls back to the original text rather than a shrug, so a genuine
 * new failure is still readable in a screenshot.
 */
export function friendlyAuthError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const text = raw.trim();
  if (!text) return "Something went wrong. Please try again.";

  // Project-wide cap on the built-in email sender.
  if (/email rate limit exceeded|over_email_send_rate_limit/i.test(text)) {
    return "Too many sign-in emails have gone out in the last hour, so this one was not sent. The link already in the inbox still works. Check spam too.";
  }

  // Per-address cooldown: "For security purposes, you can only request this
  // after 47 seconds."
  const cooldown = text.match(/only request this after (\d+) seconds?/i);
  if (cooldown) {
    return `The last email only just went out. Another can be sent in ${cooldown[1]} seconds. The link already in the inbox still works.`;
  }
  if (/rate limit|too many requests/i.test(text)) {
    return "Too many attempts in a short time. Wait a minute and try again.";
  }

  if (/invalid login credentials/i.test(text)) {
    return "That email and password don't match an account here. Check the password, or use the reset link below.";
  }
  if (/email not confirmed/i.test(text)) {
    return "This account still needs confirming. The sign-in link is in the inbox.";
  }
  if (/user already registered/i.test(text)) {
    return "There is already an account on this address. Sign in with the password instead.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(text)) {
    return "Could not reach the sign-in service. Check the connection and try again.";
  }

  return text;
}
