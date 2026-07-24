const LOCAL_PART = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/**
 * Normalize and validate an ordinary, deliverable-looking email address.
 *
 * Authentication remains invitation-only; this function deliberately does not
 * restrict which company or domain an administrator may invite.
 */
export function normalizeAuthEmail(
  value: string | null | undefined
): string | null {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();
  if (
    !email ||
    email.length > 254 ||
    /[\s\u0000-\u001f\u007f]/.test(email)
  ) {
    return null;
  }

  const separator = email.indexOf("@");
  if (
    separator <= 0 ||
    separator !== email.lastIndexOf("@") ||
    separator === email.length - 1
  ) {
    return null;
  }

  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  if (
    local.length > 64 ||
    !LOCAL_PART.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    domain.length > 253
  ) {
    return null;
  }

  const labels = domain.split(".");
  if (
    labels.length < 2 ||
    labels.some((label) => !DOMAIN_LABEL.test(label))
  ) {
    return null;
  }

  return email;
}

export function isValidAuthEmail(
  value: string | null | undefined
): boolean {
  return normalizeAuthEmail(value) !== null;
}
