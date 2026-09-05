/**
 * DEV-ONLY LOGIN RESTRICTION.
 *
 * Anir, Sep 5: after the prod split, dev should stop being a second live
 * instance — only a named handful may sign in there, everyone else is pushed
 * to the new prod link. Prod itself stays open (company-domain auto-join).
 *
 * Two independent gates, BOTH required before a login is ever refused, so this
 * can never lock prod out even by misconfiguration:
 *   1. DEV_LOGIN_ALLOWLIST is set and non-empty (only ever set on dev's task
 *      definition — prod's task def does not carry it).
 *   2. the request host is a dev/local host, never freyrsales.freyrapps.com.
 *
 * The allowlist lives in the env var, not in code, so the set of people can be
 * edited on the task definition without a deploy. Entries are globs: `*`
 * matches any run of characters, so `anir.s+*@freyrsolutions.com` lets Anir
 * create and sign in with fresh test accounts (Anir, Sep 5: "leave the ability
 * to create new accounts on dev so I can test it").
 */

/** The prod home users on the retired dev instance are sent to. */
export const PROD_HOME_URL = "https://freyrsales.freyrapps.com";

/** True when this host is a dev or local host — never the prod host. */
export function isDevHost(host: string | null | undefined): boolean {
  const h = (host ?? "").toLowerCase();
  return h.includes(".dev.") || h.startsWith("localhost") || h.startsWith("127.");
}

/**
 * WHO MAY SIGN IN TO DEV, by default. Anir, Sep 5: only this handful, plus
 * Anir's own +test variants so he can make throwaway accounts on dev. Baked in
 * code (not a server env var) on purpose: a task-definition env var is wiped
 * every time the pipeline redeploys dev, which would silently unlock dev on the
 * next push. This list survives deploys. `DEV_LOGIN_ALLOWLIST` still overrides
 * it when set, so the roster can be changed without a deploy if ever needed.
 * Entries are globs; `*` matches any run of characters.
 */
const DEFAULT_DEV_ALLOWLIST = [
  "anir.s@freyrsolutions.com",
  "anir.s+*@freyrsolutions.com",
  "suren@freyrsolutions.com",
  "saras.verma@freyrsolutions.com",
  "manojkumar.odela@freyrsolutions.com",
  "sameer.siddiqui@freyrsolutions.com",
];

function allowlistGlobs(): string[] {
  const override = (process.env.DEV_LOGIN_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return override.length ? override : DEFAULT_DEV_ALLOWLIST;
}

function globToRegExp(glob: string): RegExp {
  // Escape every regex metachar, then turn the escaped `*` back into `.*`.
  const escaped = glob.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * May this email sign in, given the current host? Returns true unless BOTH
 * gates say to restrict AND the email matches no allowlist entry. Fails open:
 * no allowlist, or a non-dev host, always returns true.
 */
export function isLoginAllowedHere(
  email: string,
  host: string | null | undefined
): boolean {
  const globs = allowlistGlobs();
  if (globs.length === 0) return true; // no allowlist configured (e.g. prod)
  if (!isDevHost(host)) return true; // second gate: never restrict prod's host
  const e = email.trim().toLowerCase();
  return globs.some((g) => globToRegExp(g).test(e));
}
