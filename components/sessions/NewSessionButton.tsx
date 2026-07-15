"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Sparkles, FileText, Phone, MessageSquareText, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

// The "New session" button on a customer account. Suren: a new rep shouldn't
// have to guess what "a session" means — clicking it first explains, in plain
// English, what Freyr is about to do, then starts it. One extra click, zero
// confusion.
export function NewSessionButton({
  company,
  intakeHref,
}: {
  company: string;
  intakeHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const steps = [
    {
      icon: Sparkles,
      title: "We read the account",
      body: `Everything Freyr knows about ${company} — who they are, what they buy, where they're going.`,
    },
    {
      icon: FileText,
      title: "We match your offerings",
      body: "The services most relevant to this account, with the angle to lead with.",
    },
    {
      icon: MessageSquareText,
      title: "We draft the outreach",
      body: "A ready-to-send email, a 5-minute call script, and the talking points — in about a minute.",
    },
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-all active:scale-[0.98] shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
      >
        <Plus size={15} strokeWidth={2} />
        New session
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Start a session">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
              <Phone size={19} strokeWidth={1.9} />
            </span>
            <p className="text-[14px] text-text-secondary leading-relaxed">
              A <span className="font-semibold text-text-primary">session</span> is
              how Freyr builds your pitch for{" "}
              <span className="font-semibold text-text-primary">{company}</span>.
              Here&apos;s what happens when you start one:
            </p>
          </div>

          <ol className="space-y-2.5">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-xl border border-border-light bg-surface/40 p-3"
                >
                  <span className="w-8 h-8 rounded-lg bg-white border border-border-light text-blue-primary flex items-center justify-center shrink-0">
                    <Icon size={16} strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-text-primary">
                      {s.title}
                    </p>
                    <p className="text-[12.5px] text-text-secondary leading-relaxed mt-0.5">
                      {s.body}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setOpen(false)}
              className="text-[13px] font-medium px-3.5 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
            >
              Not now
            </button>
            <Link
              href={intakeHref}
              onClick={() => setStarting(true)}
              aria-disabled={starting}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
            >
              {starting ? "Starting…" : "Start the session"}
              {!starting && <ArrowRight size={15} strokeWidth={2} />}
            </Link>
          </div>
        </div>
      </Modal>
    </>
  );
}
