/**
 * ACCOUNTS THAT EXIST ONLY TO BE TESTED WITH.
 *
 * Anir, Aug 31, after the third "QA Role Check joined the workspace" mail
 * landed in Saras's inbox: "I need you to create test accounts, that's the
 * whole point... just have a set way of creating the account so that if it has
 * this, it won't email... maybe like Claude check one, Claude check two."
 *
 * Any @freyrsolutions.com address joins this workspace with no invitation, and
 * joining emails every admin. That is right for a new hire and wrong for an
 * account that exists for ten minutes so somebody can see what a BD Member
 * sees. The two are indistinguishable unless something marks them apart, so
 * this is the mark: a reserved local-part prefix that no real person will ever
 * be issued.
 *
 *   claude-check-1@freyrsolutions.com
 *   claude-check-2@freyrsolutions.com   ... and so on
 *
 * WHY A PREFIX AND NOT ONLY account_type. The column already has a 'test'
 * value, but it is stamped by the code that PROVISIONS the row — which is the
 * same code that sends the mail, and it hardcodes "real". Something has to say
 * "this one is a test" before that decision is taken, and the address is the
 * only thing present that early.
 *
 * Both are used: the prefix decides, and the row is stamped 'test' so every
 * people-picker that already filters on account_type keeps them out of the
 * places real colleagues belong.
 */
export const TEST_ACCOUNT_PREFIX = "claude-check-";

/** Is this address one of the reserved testing accounts? */
export function isTestAccountEmail(email: string | null | undefined): boolean {
  const at = (email ?? "").trim().toLowerCase();
  if (!at) return false;
  const local = at.split("@")[0] ?? "";
  return local.startsWith(TEST_ACCOUNT_PREFIX);
}

/** The address for the nth testing account. */
export function testAccountEmail(n: number): string {
  return `${TEST_ACCOUNT_PREFIX}${n}@freyrsolutions.com`;
}

/** The display name for the nth testing account: "Claude Check 3". */
export function testAccountName(n: number): string {
  return `Claude Check ${n}`;
}

/**
 * The same judgement made on a NAME rather than an address.
 *
 * Some things only ever see the display name — the privilege-change email
 * lists people as "Priyanka Manchanda: BO Owner", with no address anywhere in
 * the line — so a rule that only knows the address cannot filter them. Both
 * spellings, because the address is hyphenated and the name is spaced.
 */
export function isTestAccountName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  return n.startsWith("claude check") || n.startsWith(TEST_ACCOUNT_PREFIX);
}
