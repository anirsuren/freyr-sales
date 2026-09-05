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

/**
 * Is THIS deployment the dev instance? Keyed off the server's own configured
 * origin (AUTH_PUBLIC_ORIGIN / APP_PUBLIC_URL), NOT the request Host header.
 *
 * The load balancer does not pass the public Host through to the container, so
 * a Host-header check silently failed to fire on the deployed dev site (and a
 * Host header is client-spoofable anyway, which on prod could lock everyone
 * out). The origin env var is set per-environment on the task definition —
 * dev carries `...dev.freyrapps.com`, prod carries `freyrsales.freyrapps.com`
 * — so it is reliable behind the proxy and cannot be forged by a caller.
 * A plain `next dev` with no origin set counts as dev (non-production).
 */
export function isDevEnvironment(): boolean {
  const origin = (
    process.env.AUTH_PUBLIC_ORIGIN ||
    process.env.APP_PUBLIC_URL ||
    ""
  ).toLowerCase();
  if (origin) {
    return (
      origin.includes(".dev.") ||
      origin.includes("localhost") ||
      origin.includes("127.0.0.1")
    );
  }
  return process.env.NODE_ENV !== "production";
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
 * May this email sign in on THIS deployment? Fails open: on anything that is
 * not the dev instance (prod, above all) every email is allowed. On dev, only
 * emails matching the allowlist may sign in.
 */
export function isLoginAllowedHere(email: string): boolean {
  if (!isDevEnvironment()) return true; // prod (and any non-dev) is never restricted
  const e = email.trim().toLowerCase();
  return allowlistGlobs().some((g) => globToRegExp(g).test(e));
}
