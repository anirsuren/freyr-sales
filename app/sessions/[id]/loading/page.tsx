"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import {
  ProgressTracker,
  PIPELINE_STEPS,
  StepStatus,
} from "@/components/sessions/ProgressTracker";

export default function SessionLoadingPage() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({});
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const raw =
      typeof window !== "undefined"
        ? sessionStorage.getItem("freyr_intake_payload")
        : null;

    // Direct visit with no pending pipeline (e.g. deep link) — just show steps.
    if (!raw) return;
    sessionStorage.removeItem("freyr_intake_payload");

    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/sessions/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: raw,
        });

        if (!res.body) throw new Error("No response stream");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            try {
              const evt = JSON.parse(line.slice(5).trim());
              handleEvent(evt);
            } catch {
              /* ignore parse errors on partial frames */
            }
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Pipeline failed");
      }
    }

    function handleEvent(evt: any) {
      if (cancelled) return;
      if (evt.step === "complete") {
        setStatuses((prev) => {
          const next = { ...prev };
          for (const s of PIPELINE_STEPS) next[s.key] = "done";
          return next;
        });
        // Brief dwell so the completed state is visible before navigating.
        setTimeout(() => {
          if (!cancelled) router.push(`/sessions/${evt.sessionId}`);
        }, 1400);
        return;
      }
      if (evt.step === "error") {
        setError(evt.message || "Pipeline failed");
        return;
      }
      setStatuses((prev) => ({
        ...prev,
        [evt.step]: evt.status === "done" ? "done" : "running",
      }));
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="max-w-[560px] mx-auto pt-10">
      <div className="text-center mb-8">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
          Building your pitch
        </h1>
        <p className="text-[15px] text-text-secondary mt-1">
          Researching the customer and contact, then matching Freyr&apos;s
          services.
        </p>
      </div>

      <Card>
        <ProgressTracker statuses={statuses} />
        {error && (
          <div className="mt-6 pt-5 border-t border-border-light">
            <p className="text-[14px] text-error mb-3">{error}</p>
            <button
              onClick={() => router.push("/intake")}
              className="text-[14px] text-blue-primary hover:underline"
            >
              ← Back to intake
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
