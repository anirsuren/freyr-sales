/**
 * A LINK A PERSON TYPED IS NOT AUTOMATICALLY A LINK.
 *
 * `<a href={somethingAUserSaved}>` will happily carry a `javascript:` URL, and
 * React does not stop it — it warns and renders. Any such link clicked by a
 * colleague runs that script on this app's own origin, with their session.
 *
 * The workspace has four ways to save a LinkedIn address and they do not agree:
 * /api/customers/[id]/contacts parses the URL and demands an http(s) protocol
 * on a linkedin.com host, /api/profile/linkedin validates properly too, but
 * /api/auth/register accepts anything merely CONTAINING "linkedin.com/" and
 * /api/auth/session copies that into agent_prefs on first sign-in with the same
 * loose check. So "javascript:alert(1)//linkedin.com/" can reach the database.
 *
 * Rather than trust every writer, the reader refuses: only http and https ever
 * become an href. Anything else renders as no link at all, which is the honest
 * outcome for an address that is not a web address.
 */
export function safeHref(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  try {
    /* A bare "linkedin.com/in/x" is a real thing people paste, and it is safe:
       it cannot carry a scheme. Given one, assume https rather than refuse. */
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * A LINKEDIN ADDRESS, OR NOTHING.
 *
 * Same shape as the check /api/customers/[id]/contacts and /api/profile/linkedin
 * already apply, in a module that imports nothing so the sign-in path can use
 * it too. Returns the normalised `https://host/path`, or null if the value is
 * not an http(s) URL on linkedin.com — which is what
 * "javascript:alert(1)//linkedin.com/" is.
 */
export function linkedInUrl(raw: string | null | undefined): string | null {
  const href = safeHref(raw);
  if (!href) return null;
  try {
    const host = new URL(href).hostname.replace(/^www\./, "").toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com") ? href : null;
  } catch {
    return null;
  }
}
