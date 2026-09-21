// Graph previews are mutually exclusive across the whole app. Pointer events
// can be missed while moving between adjacent HTML/SVG marks, so local
// mouse-leave state alone cannot guarantee that the previous card disappears.
// Claiming ownership synchronously dismisses whichever graph preview owned it
// before, including a preview rendered by a different chart implementation.
let activeGraphHover: { id: string; dismiss: () => void } | null = null;

export function pointerIsOverGraphTooltip() {
  if (typeof document === "undefined") return false;
  return document.querySelector("[data-graph-tooltip]:hover") != null;
}

/**
 * True only while the pointer still belongs to the active graph interaction:
 * the painted mark, the popup, or the narrow bridge between the two while a
 * mark-to-popup handoff timer is running. This is deliberately based on the
 * live pointer event rather than `:hover`; Chromium can retain `:hover` on a
 * portaled tooltip after a missed boundary event, which used to strand the
 * card until another graph mark was entered.
 */
export function pointerIsInGraphHoverRegion(
  event: PointerEvent,
  anchor: Element | null,
  allowBridge: boolean
) {
  if (typeof document === "undefined") return false;
  const target = event.target;
  const tooltip = document.querySelector<HTMLElement>("[data-graph-tooltip]");
  const mark = anchor?.closest("[data-chart-point]") ?? anchor;

  if (target instanceof Node) {
    if (mark?.contains(target)) return true;
    if (tooltip?.contains(target)) return true;
  }
  if (!allowBridge || !mark || !tooltip) return false;

  const markRect = mark.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();
  const pad = 6;
  const betweenVertically =
    (tipRect.bottom <= markRect.top && event.clientY >= tipRect.bottom - pad && event.clientY <= markRect.bottom + pad) ||
    (markRect.bottom <= tipRect.top && event.clientY >= markRect.top - pad && event.clientY <= tipRect.top + pad);
  const betweenHorizontally =
    (tipRect.right <= markRect.left && event.clientX >= tipRect.right - pad && event.clientX <= markRect.right + pad) ||
    (markRect.right <= tipRect.left && event.clientX >= markRect.left - pad && event.clientX <= tipRect.left + pad);

  if (betweenVertically) {
    return event.clientX >= Math.min(markRect.left, tipRect.left) - pad &&
      event.clientX <= Math.max(markRect.right, tipRect.right) + pad;
  }
  if (betweenHorizontally) {
    return event.clientY >= Math.min(markRect.top, tipRect.top) - pad &&
      event.clientY <= Math.max(markRect.bottom, tipRect.bottom) + pad;
  }
  return false;
}

export function claimGraphHover(id: string, dismiss: () => void) {
  if (activeGraphHover?.id !== id) activeGraphHover?.dismiss();
  activeGraphHover = { id, dismiss };
}

export function releaseGraphHover(id: string) {
  if (activeGraphHover?.id === id) activeGraphHover = null;
}
