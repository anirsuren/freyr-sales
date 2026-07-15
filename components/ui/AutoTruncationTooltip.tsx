"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useHoverPreference } from "@/lib/hoverPreferences";

type Popup = {
  text: string;
  x: number;
  y: number;
  below: boolean;
};

const TRUNCATED_SELECTOR = ".truncate, [class*='line-clamp-']";

function isClipped(element: HTMLElement) {
  return (
    element.scrollWidth > element.clientWidth + 1 ||
    element.scrollHeight > element.clientHeight + 1
  );
}

// One global disclosure layer for every clipped value in the application.
// It avoids the brittle requirement that each individual table/card remembers
// to duplicate its full text into a tooltip, and it also covers future screens.
export function AutoTruncationTooltip() {
  const preference = useHoverPreference();
  const [popup, setPopup] = useState<Popup | null>(null);

  useEffect(() => {
    if (!preference.enabled) {
      setPopup(null);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let active: HTMLElement | null = null;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      active = null;
      setPopup(null);
    };

    const showFor = (element: HTMLElement) => {
      if (!isClipped(element) || element.closest(".freyr-hover-trigger")) return;
      const text = (element.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) return;
      active = element;
      timer = setTimeout(() => {
        if (active !== element || !document.body.contains(element)) return;
        const rect = element.getBoundingClientRect();
        const below = rect.top < 90;
        setPopup({
          text,
          x: Math.max(190, Math.min(window.innerWidth - 190, rect.left + rect.width / 2)),
          y: below ? rect.bottom + 8 : rect.top - 8,
          below,
        });
      }, preference.delayMs);
    };

    const onHoverIn = (event: Event) => {
      const target = event.target instanceof Element
        ? event.target.closest(TRUNCATED_SELECTOR)
        : null;
      if (!(target instanceof HTMLElement) || target === active) return;
      clear();
      showFor(target);
    };

    const onHoverOut = (event: MouseEvent | PointerEvent) => {
      if (!active) return;
      const next = event.relatedTarget;
      if (next instanceof Node && active.contains(next)) return;
      const from = event.target;
      if (from instanceof Node && active.contains(from)) clear();
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest(TRUNCATED_SELECTOR) ||
          Array.from(event.target.querySelectorAll(TRUNCATED_SELECTOR)).find(
            (element) => element instanceof HTMLElement && isClipped(element)
          ) || null
        : null;
      if (target instanceof HTMLElement) showFor(target);
    };

    const onFocusOut = (event: FocusEvent) => {
      if (!active) return;
      const next = event.relatedTarget;
      if (next instanceof Node && active.contains(next)) return;
      clear();
    };

    // Mouse events keep disclosure working for traditional desktop cursors,
    // while pointer events cover pen and other precision pointing devices.
    document.addEventListener("mouseover", onHoverIn, true);
    document.addEventListener("mouseout", onHoverOut, true);
    document.addEventListener("mousemove", onHoverIn, true);
    document.addEventListener("pointerover", onHoverIn, true);
    document.addEventListener("pointerout", onHoverOut, true);
    document.addEventListener("pointermove", onHoverIn, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    return () => {
      clear();
      document.removeEventListener("mouseover", onHoverIn, true);
      document.removeEventListener("mouseout", onHoverOut, true);
      document.removeEventListener("mousemove", onHoverIn, true);
      document.removeEventListener("pointerover", onHoverIn, true);
      document.removeEventListener("pointerout", onHoverOut, true);
      document.removeEventListener("pointermove", onHoverIn, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
    };
  }, [preference.delayMs, preference.enabled]);

  if (!popup || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[120] max-w-[360px] rounded-lg bg-text-primary px-3 py-2 text-[12px] font-normal leading-snug text-white shadow-lg"
      style={{
        left: popup.x,
        top: popup.y,
        transform: popup.below ? "translateX(-50%)" : "translate(-50%, -100%)",
      }}
    >
      {popup.text}
    </div>,
    document.body
  );
}
