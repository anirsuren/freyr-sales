export const MOCK_MODE_PREFIX = "/mock-mode";

/** Mock mode is one data view of the same route, so comparisons use the bare
 * route while navigation can add the visible address label back. */
export function isMockModePath(value: string): boolean {
  return (
    value === MOCK_MODE_PREFIX ||
    value.startsWith(`${MOCK_MODE_PREFIX}/`) ||
    value.startsWith(`${MOCK_MODE_PREFIX}?`) ||
    value.startsWith(`${MOCK_MODE_PREFIX}#`)
  );
}

export function stripMockModePrefix(value: string): string {
  if (!isMockModePath(value)) return value;
  const suffix = value.slice(MOCK_MODE_PREFIX.length);
  if (!suffix) return "/";
  return suffix.startsWith("?") || suffix.startsWith("#")
    ? `/${suffix}`
    : suffix;
}

export function addMockModePrefix(value: string): string {
  if (isMockModePath(value) || !value.startsWith("/")) return value;
  const bare = stripMockModePrefix(value);
  return bare === "/" ? MOCK_MODE_PREFIX : `${MOCK_MODE_PREFIX}${bare}`;
}

/** Replace the current app URL without discarding Next's history metadata or
 * silently leaving Mock-mode. This is for query/tab cleanup that intentionally
 * should not create a new browser-history entry. */
export function replaceAppBrowserUrl(value: string | URL): void {
  const destination = new URL(value.toString(), window.location.href);
  if (
    destination.origin === window.location.origin &&
    isMockModePath(window.location.pathname)
  ) {
    destination.pathname = addMockModePrefix(destination.pathname);
  }
  window.history.replaceState(window.history.state, "", destination.toString());
  /* Native replaceState does not notify Next's pathname/search hooks in every
   * browser/runtime combination. The app's own back trail still needs to know
   * that a tab or filter changed before the next record link is opened. */
  window.dispatchEvent(new Event("freyr:location-replaced"));
}
