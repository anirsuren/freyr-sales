"use client";

import { useEffect, useState } from "react";
import { Mail, CalendarClock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

export function WeeklyDigest({
  kpis,
  period,
  recipient,
}: {
  kpis: { label: string; value: string }[];
  period: string;
  recipient: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    try {
      setSubscribed(localStorage.getItem("freyr.digest.weekly") === "1");
    } catch {}
  }, []);

  const lines = [
    `📊 Freyr weekly digest — ${period}`,
    "",
    ...kpis.map((k) => `• ${k.label}: ${k.value}`),
    "",
    "Open the dashboard for the full picture.",
  ];
  const text = lines.join("\n");

  async function send() {
    setSending(true);
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.ok) toast(`Digest sent via ${data.channel}`);
      else if (data.skipped) toast(data.message || "No delivery channel configured");
      else toast(data.error || "Could not send digest");
    } catch {
      toast("Could not send digest");
    } finally {
      setSending(false);
    }
  }

  function toggleSub() {
    const v = !subscribed;
    setSubscribed(v);
    try {
      localStorage.setItem("freyr.digest.weekly", v ? "1" : "0");
    } catch {}
    toast(v ? "Subscribed — weekly digest every Monday 8am" : "Weekly digest off");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
      >
        <Mail size={15} strokeWidth={1.8} />
        Digest
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Weekly digest">
        <p className="text-[13px] text-text-secondary mb-3">
          A snapshot of this dashboard, delivered to{" "}
          <span className="font-medium text-text-primary">{recipient}</span>.
        </p>
        <div className="rounded-lg border border-border-light bg-surface p-4 mb-4">
          <p className="text-[13px] font-semibold text-text-primary mb-2">
            Freyr weekly digest · {period}
          </p>
          <ul className="space-y-1.5">
            {kpis.map((k) => (
              <li
                key={k.label}
                className="flex items-center justify-between text-[13px]"
              >
                <span className="text-text-secondary">{k.label}</span>
                <span className="font-semibold text-text-primary tnum">
                  {k.value}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={toggleSub}
          aria-pressed={subscribed}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-[13px] mb-4 transition-colors",
            subscribed
              ? "border-blue-primary bg-blue-light text-blue-primary"
              : "border-border text-text-secondary hover:bg-surface"
          )}
        >
          <CalendarClock size={16} strokeWidth={1.8} />
          <span className="text-left flex-1">
            Email me this digest every Monday at 8am
          </span>
          <span
            className={cn(
              "w-9 h-5 rounded-full relative transition-colors shrink-0",
              subscribed ? "bg-blue-primary" : "bg-border"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
                subscribed ? "left-[18px]" : "left-0.5"
              )}
            />
          </span>
        </button>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={send} loading={sending}>
            Send now
          </Button>
        </div>
      </Modal>
    </>
  );
}
