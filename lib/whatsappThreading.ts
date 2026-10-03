/** Keep a WhatsApp chat's recent context across nights without carrying it forever. */
const CONTINUE_WITHIN_MS = 7 * 24 * 60 * 60_000;

export function shouldContinueWhatsAppConversation(
  latest: { updated: number } | null,
  now = Date.now()
): boolean {
  if (!latest || !Number.isFinite(latest.updated)) return false;
  const elapsed = now - latest.updated;
  return elapsed >= 0 && elapsed < CONTINUE_WITHIN_MS;
}
