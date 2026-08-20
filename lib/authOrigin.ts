const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function configuredAuthOrigin(): string | null {
  const configured = process.env.AUTH_PUBLIC_ORIGIN?.trim();
  if (!configured) return null;

  try {
    const candidate = new URL(configured);
    const isProduction = process.env.NODE_ENV === "production";
    const isLoopback = LOOPBACK_HOSTS.has(candidate.hostname);
    const validProtocol =
      candidate.protocol === "https:" ||
      (!isProduction && isLoopback && candidate.protocol === "http:");

    if (
      !validProtocol ||
      candidate.username ||
      candidate.password ||
      candidate.pathname !== "/" ||
      candidate.search ||
      candidate.hash ||
      (isProduction && candidate.port)
    ) {
      return null;
    }

    return candidate.origin;
  } catch {
    return null;
  }
}

export function authUrl(path: string): URL {
  const origin = configuredAuthOrigin();
  if (!origin) {
    throw new Error("AUTH_PUBLIC_ORIGIN is missing or invalid.");
  }
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("Authentication redirect must be a same-origin path.");
  }

  const candidate = new URL(path, origin);
  if (candidate.origin !== origin) {
    throw new Error("Authentication redirect escaped the configured origin.");
  }
  return candidate;
}

/**
 * WHERE A BROWSER REDIRECT SHOULD LAND, as opposed to an emailed link.
 *
 * AUTH_PUBLIC_ORIGIN pins one host, which is exactly right for anything that
 * leaves the building — a reset link, an invitation, a confirmation — and
 * exactly wrong for a redirect back to the tab you are already in. Running a
 * review server on another port made "Switch account" throw you at
 * localhost:3001 whichever port you were actually on (Anir, Aug 19: "I can't
 * switch my account. It takes me to this link. I think it's a wrong link").
 *
 * So: in development, a request that came from loopback goes back to the
 * origin it came from. In production the configured origin always wins —
 * following the request's own host there is how open redirects and cookie
 * leaks start.
 */
export function browserRedirectOrigin(requestUrl: URL): string | null {
  const configured = configuredAuthOrigin();
  if (process.env.NODE_ENV === "production") return configured;
  const isLoopback = LOOPBACK_HOSTS.has(requestUrl.hostname);
  const isHttp =
    requestUrl.protocol === "http:" || requestUrl.protocol === "https:";
  if (isLoopback && isHttp) return requestUrl.origin;
  return configured;
}
