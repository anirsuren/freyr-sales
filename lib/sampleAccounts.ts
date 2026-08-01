/**
 * Accounts created specifically for demonstrations or QA must never be shown
 * as real colleagues in Real mode. They stay in Supabase so Mock mode can use
 * them; this predicate only controls presentation.
 *
 * Keep this deliberately conservative. A normal address is never hidden just
 * because somebody's name contains "test". We only recognise explicit test
 * aliases/domains that are unambiguous account markers.
 */
export function isSampleAccountEmail(email: string | null | undefined): boolean {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    /\+(?:test|demo|sample)(?:[._-]?\d+)?@/.test(normalized) ||
    /@(?:example|examplecorp|test)\.(?:com|org|net)$/.test(normalized)
  );
}
