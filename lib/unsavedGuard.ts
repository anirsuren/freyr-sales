/**
 * ONE PLACE TO ASK "MAY I NAVIGATE AWAY?"
 *
 * The deal editor stages edits and writes nothing until Save, so anything that
 * takes you off the screen has to ask first. Its own click listener catches
 * ANCHORS — the sidebar, the breadcrumbs — but this app also navigates with
 * BUTTONS: `SmartBack` renders a `<button>` and pushes through the router, so
 * "Back to deal" walked off with the staged work in silence. Found in the loop
 * immediately after fixing the anchor case, by testing the fix's own edges
 * rather than trusting it.
 *
 * A link listener cannot see a button, and the editor cannot know about every
 * control that might navigate. So the navigating control asks, and whichever
 * screen has unsaved work answers.
 *
 * THE ANSWER IS NOT A BOOLEAN, because the honest answer needs a dialog and a
 * dialog is not synchronous. `askBeforeLeaving` hands over the navigation
 * itself: a screen with nothing staged returns true and the caller proceeds
 * immediately; a screen with staged work keeps `go`, returns false, and runs it
 * later if the person says leave.
 */
type Asker = (go: () => void) => boolean;

let asker: Asker | null = null;

/** Registered by a screen that holds unsaved work; cleared when it is clean. */
export function setLeaveAsker(next: Asker | null): void {
  asker = next;
}

/**
 * Call before navigating. Returns true when it is safe to go NOW; false when
 * something has taken responsibility for asking and will run `go` itself.
 */
export function askBeforeLeaving(go: () => void): boolean {
  if (!asker) return true;
  return asker(go);
}
