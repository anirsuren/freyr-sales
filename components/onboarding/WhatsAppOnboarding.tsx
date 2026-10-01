"use client";

import { useCallback, useEffect, useState } from "react";
import { PhoneSetupDialog, type PhoneSetupOutcome } from "@/components/onboarding/PhoneSetupDialog";

/**
 * PHONE SETUP AT SIGN-UP. A member who has neither connected a phone nor
 * closed this once sees the connect pop-up before the product tour. Closing
 * it in any way (the X, a click outside, Escape, Skip for now) saves a skip,
 * so it does not come back on the next page; Settings, then Integrations,
 * opens the same pop-up whenever they want it (Anir, Oct 1).
 *
 * Nothing renders until the check answers: the old version drew the whole
 * pop-up while it asked, so people who had already skipped saw it flash on
 * every load. A failed check lets them into the app rather than blocking it.
 */
export function WhatsAppOnboarding({ onResolved, forceShow = false }: { onResolved: () => void; forceShow?: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (forceShow) {
      setShow(true);
      return;
    }
    let alive = true;
    fetch("/api/onboarding/whatsapp", { cache: "no-store", signal: AbortSignal.timeout(15_000) })
      .then((response) => (response.ok ? response.json() : null))
      .then((state: { resolved?: boolean } | null) => {
        if (!alive) return;
        if (!state || state.resolved) onResolved();
        else setShow(true);
      })
      .catch(() => {
        if (alive) onResolved();
      });
    return () => {
      alive = false;
    };
  }, [forceShow, onResolved]);

  const close = useCallback(
    (outcome: PhoneSetupOutcome) => {
      if (outcome !== "connected") {
        void fetch("/api/onboarding/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "skip" }),
          keepalive: true,
        }).catch(() => undefined);
      }
      setShow(false);
      onResolved();
    },
    [onResolved],
  );

  return show ? <PhoneSetupDialog mode="onboarding" onClose={close} /> : null;
}
