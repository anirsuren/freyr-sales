/** Capture click-away before a modal stops bubbling. Pointer focus is handled
 * by the pointer event itself: clicking non-focusable menu padding can focus
 * the surrounding dialog, which must not be mistaken for tabbing outside. */
export function listenForOutsideInteraction(onInteraction: (event: Event) => void) {
  let pointerActive = false;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  const reset = () => {
    pointerActive = false;
    clearTimeout(releaseTimer);
  };
  const down = (event: Event) => {
    clearTimeout(releaseTimer);
    pointerActive = true;
    onInteraction(event);
  };
  const click = (event: Event) => {
    onInteraction(event);
    reset();
  };
  const focus = (event: Event) => {
    if (!pointerActive) onInteraction(event);
  };
  const release = () => { releaseTimer = setTimeout(reset, 0); };
  document.addEventListener("pointerdown", down, true);
  document.addEventListener("pointerup", release, true);
  document.addEventListener("pointercancel", reset, true);
  document.addEventListener("click", click, true);
  document.addEventListener("focusin", focus, true);
  window.addEventListener("blur", reset);
  return () => {
    reset();
    document.removeEventListener("pointerdown", down, true);
    document.removeEventListener("pointerup", release, true);
    document.removeEventListener("pointercancel", reset, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("focusin", focus, true);
    window.removeEventListener("blur", reset);
  };
}
