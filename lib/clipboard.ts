/**
 * Copies text in both secure deployments and the current HTTP demo.
 * Clipboard.writeText is intentionally unavailable on non-secure origins, so
 * keep a selection-based fallback until the load balancer has HTTPS enabled.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text || typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through for browsers that expose the API but deny the write.
    }
  }

  const textarea = document.createElement("textarea");
  const activeElement = document.activeElement as HTMLElement | null;
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  Object.assign(textarea.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });

  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  const handleCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    copied = true;
  };

  document.addEventListener("copy", handleCopy, { once: true });
  try {
    copied = document.execCommand("copy") || copied;
  } catch {
    copied = false;
  } finally {
    document.removeEventListener("copy", handleCopy);
    textarea.remove();
    activeElement?.focus?.({ preventScroll: true });
  }

  return copied;
}
