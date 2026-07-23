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
