// Graph previews are mutually exclusive across the whole app. Pointer events
// can be missed while moving between adjacent HTML/SVG marks, so local
// mouse-leave state alone cannot guarantee that the previous card disappears.
// Claiming ownership synchronously dismisses whichever graph preview owned it
// before, including a preview rendered by a different chart implementation.
let activeGraphHover: { id: string; dismiss: () => void } | null = null;

export function claimGraphHover(id: string, dismiss: () => void) {
  if (activeGraphHover?.id !== id) activeGraphHover?.dismiss();
  activeGraphHover = { id, dismiss };
}

export function releaseGraphHover(id: string) {
  if (activeGraphHover?.id === id) activeGraphHover = null;
}
