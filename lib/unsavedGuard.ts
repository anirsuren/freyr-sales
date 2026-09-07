/**
 * THE APP-WIDE "ARE YOU SURE YOU WANT TO LEAVE" REGISTRY.
 *
 * Anything on screen with unsaved work registers an asker. Every control
 * that navigates through the router without a link (SmartBack, the command
 * palette) calls `askBeforeLeaving` first: it returns true when nothing on
 * the page is unsaved, which is the ordinary case, and otherwise hands the
 * navigation to the first asker, which shows its own dialog and runs `go`
 * only if the person confirms.
 *
 * A registry rather than one slot (Sep 7): the deal edit page has TWO
 * savers on it, the deal fields and the accrual schedule. With a single
 * slot whichever registered last won, and the moment one of them saved and
 * cleared it, the other's unsaved edits walked out of the page in silence.
 * Links and tab-close are handled by the hook in lib/useLeaveGuard, which
 * is also what registers here.
 */
type Asker = (go: () => void) => boolean;

const askers = new Map<symbol, Asker>();

export function registerLeaveAsker(asker: Asker): () => void {
  const key = Symbol("leave-asker");
  askers.set(key, asker);
  return () => {
    askers.delete(key);
  };
}

export function askBeforeLeaving(go: () => void): boolean {
  for (const ask of askers.values()) {
    if (!ask(go)) return false;
  }
  return true;
}
