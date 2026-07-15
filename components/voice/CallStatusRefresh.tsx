"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { VoiceLifecycleStatus } from "@/lib/voiceEvents";

export function CallStatusRefresh({ status }: { status: VoiceLifecycleStatus }) {
  const router = useRouter();
  useEffect(() => {
    if (!["initiated", "in_progress", "analyzing"].includes(status)) return;
    const timer = window.setInterval(async () => {
      await fetch("/api/voice/conversations?refresh=1", { cache: "no-store" }).catch(() => {});
      router.refresh();
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [router, status]);
  return null;
}
