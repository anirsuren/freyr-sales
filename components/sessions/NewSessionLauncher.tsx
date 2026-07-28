"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import {
  ProgressTracker,
  PIPELINE_STEPS,
  type StepStatus,
} from "@/components/sessions/ProgressTracker";
import { SessionForm, type SessionFormValues } from "@/components/sessions/SessionForm";

// Starting a session is an action, not a place. It used to be a button pinned
// to the sidebar on every page, which threw you out of whatever you were doing
// (Suren, Jul 27: "if I'm on the Teams page and I press New Session, that's
// kind of a problem… it should just stay on the sessions page"). Now it lives
// on Sessions, opens a dialog over the list, and reports back with a toast.
//
// The run itself is owned HERE, not inside the dialog, so closing the dialog
// mid-build doesn't abandon it — the pipeline keeps going and the toast still
// arrives when the pitch is ready.
export function NewSessionLauncher() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({});
  // The pipeline's own words for what it's doing right now — never invented
  // here, only echoed from the stream.
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [company, setCompany] = useState("");
  const [prefill, setPrefill] = useState<{
    values: Partial<SessionFormValues>;
    token: number;
  } | null>(null);
  // Read inside the async run, where React state would be stale.
  const openRef = useRef(false);
  const progressRef = useRef<HTMLDivElement>(null);

  // The form (and the button that had focus) is replaced by the progress view,
  // so hand focus to it rather than dropping it on the document.
  useEffect(() => {
    if (running) progressRef.current?.focus();
  }, [running]);

  const setOpenState = useCallback((next: boolean) => {
    openRef.current = next;
    setOpen(next);
  }, []);

  const fail = useCallback(
    (message: string, values: SessionFormValues) => {
      setRunning(false);
      setError(message);
      setNote("");
      // Hand the answers back so a retry never means re-typing them.
      setPrefill({ values, token: Date.now() });
      if (!openRef.current) toast(message, "error");
    },
    [toast]
  );

  const run = useCallback(
    async (values: SessionFormValues) => {
      setRunning(true);
      setError("");
      setStatuses({});
      setCompany(values.companyName);
      setNote("Starting — this usually takes about 30 seconds.");

      let settled = false;
      const handleEvent = (evt: any) => {
        if (evt.step === "complete") {
          settled = true;
          setStatuses(
            Object.fromEntries(
              PIPELINE_STEPS.map((s) => [s.key, "done" as StepStatus])
            )
          );
          setRunning(false);
          setNote("");
          setPrefill(null);
          setOpenState(false);
          toast(`Session created for ${values.companyName}`, "success", {
            label: "Open session",
            href: `/sessions/${evt.sessionId}`,
          });
          // The sessions table is server-rendered — pull the new row in.
          router.refresh();
          return;
        }
        if (evt.step === "error") {
          settled = true;
          fail(evt.message || "Pipeline failed", values);
          return;
        }
        if (evt.message) setNote(String(evt.message));
        setStatuses((prev) => ({
          ...prev,
          [evt.step]: evt.status === "done" ? "done" : "running",
        }));
      };

      try {
        const res = await fetch("/api/sessions/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(
            data?.error || `Could not start the session (${res.status}).`
          );
        }
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
              handleEvent(JSON.parse(line.slice(5).trim()));
            } catch {
              /* ignore parse errors on partial frames */
            }
          }
        }
        if (!settled) throw new Error("The pipeline stopped before finishing.");
      } catch (e: any) {
        if (!settled) fail(e?.message || "Pipeline failed", values);
      }
    },
    [fail, router, setOpenState, toast]
  );

  return (
    <>
      <button
        data-tour="new-session"
        onClick={() => setOpenState(true)}
        className="inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-full bg-blue-primary text-white text-[13px] font-semibold hover:bg-blue-hover transition-all active:scale-[0.98] shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40 focus-visible:ring-offset-1"
      >
        {running ? (
          // bg-current, not bg-white: globals.css re-skins a bare bg-white
          // under .dark and would turn this dot dark on a blue button.
          <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
        ) : (
          <Plus size={15} strokeWidth={2.2} />
        )}
        {running ? "Building your pitch…" : "New Session"}
      </button>

      <Modal
        open={open}
        onClose={() => setOpenState(false)}
        title={running ? "Building your pitch" : "New Sales Session"}
        size="wide"
      >
        {running ? (
          <div ref={progressRef} tabIndex={-1} className="space-y-5 outline-none">
            <div className="flex items-center gap-3">
              <CompanyLogo name={company} className="w-10 h-10 text-[13px]" />
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-text-primary">
                  {company}
                </p>
                <p className="text-[13px] text-text-secondary">
                  Researching the customer and contact, then matching
                  Freyr&apos;s services.
                </p>
              </div>
            </div>

            <ProgressTracker statuses={statuses} />

            {note && (
              <p
                className="text-[13px] text-text-secondary"
                aria-live="polite"
              >
                {note}
              </p>
            )}

            <p className="text-[12px] text-text-tertiary pt-4 border-t border-border-light leading-relaxed">
              You can close this and keep working — we&apos;ll drop a note in
              the corner the moment the pitch is ready.
            </p>
          </div>
        ) : (
          <SessionForm
            prefill={prefill}
            autoFocus
            error={error}
            onSubmit={run}
            onCancel={() => setOpenState(false)}
          />
        )}
      </Modal>
    </>
  );
}
