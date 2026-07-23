function normalizeDomain(value: string): string | null {
  const domain = value.trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "");
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain)
    ? domain
    : null;
}

export function allowedAuthEmailDomains(
  value = process.env.AUTH_ALLOWED_EMAIL_DOMAINS
): string[] {
  return Array.from(
    new Set(
      (value || "")
        .split(",")
        .map(normalizeDomain)
        .filter((domain): domain is string => !!domain)
    )
  );
}

export function authEmailDomain(
  value: string | null | undefined
): string | null {
  const email = value?.trim().toLowerCase();
  if (!email) return null;
  const separator = email.indexOf("@");
  if (
    separator <= 0 ||
    separator !== email.lastIndexOf("@") ||
    separator === email.length - 1 ||
    /\s/.test(email.slice(0, separator))
  ) {
    return null;
  }
  const domain = email.slice(separator + 1);
  if (domain.endsWith(".")) return null;
  return normalizeDomain(domain);
}

export function isAllowedAuthEmail(
  value: string | null | undefined,
  domains = allowedAuthEmailDomains()
): boolean {
  const domain = authEmailDomain(value);
  return !!domain && domains.includes(domain);
}
