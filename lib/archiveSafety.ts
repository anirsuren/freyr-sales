export const MAX_ARCHIVE_ENTRIES = 200;
export const MAX_ARCHIVE_TEXT_BYTES = 50 * 1024 * 1024;
export const MAX_ARCHIVE_DEPTH = 2;
export const MAX_ARCHIVE_PATH_DEPTH = 12;

/**
 * ZIP members are never written to disk, but traversal/absolute names are
 * still rejected: they must not become trusted citation or nested-archive IDs.
 */
export function safeArchiveMemberPath(value: string): string | null {
  if (!value || value.includes("\0")) return null;
  const unix = value.replace(/\\/g, "/");
  if (unix.startsWith("/") || /^[a-z]:\//i.test(unix)) return null;
  const parts = unix.split("/");
  if (
    parts.length > MAX_ARCHIVE_PATH_DEPTH ||
    parts.some((part) => !part || part === "." || part === "..")
  )
    return null;
  return parts.join("/");
}
