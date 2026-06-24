"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, X, ArrowRight, Rocket } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "session", label: "Run your first pitch session", href: "/intake" },
  { key: "invite", label: "Invite your team", href: "/settings" },
  { key: "crm", label: "Connect your CRM", href: "/settings" },
  { key: "approve", label: "Approve & send a pitch", href: "/sessions" },
  { key: "sequence", label: "Enroll an account in a sequence", href: "/sequences" },
];

const DONE_KEY = "freyr.onboarding.done.v1";
const DISMISS_KEY = "freyr.onboarding.dismissed.v1";

export function GettingStarted() {
  const [mounted, setMounted] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const d = localStorage.getItem(DONE_KEY);
      if (d) setDone(JSON.parse(d));
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {}
    setMounted(true);
  }, []);

  function toggle(key: string) {
    const next = { ...done, [key]: !done[key] };
    setDone(next);
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(next));
    } catch {}
  }
  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  // avoid hydration flicker; don't render once dismissed
  if (!mounted || dismissed) return null;

  const completed = STEPS.filter((s) => done[s.key]).length;
  const pct = Math.round((completed / STEPS.length) * 100);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
            <Rocket size={17} strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">
              Get started with Freyr
            </h2>
            <p className="text-[12px] text-text-secondary">
              {completed} of {STEPS.length} complete
            </p>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss getting started"
          className="text-text-tertiary hover:text-text-primary transition-colors"
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>

      <div className="h-1.5 rounded-full bg-surface overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-blue-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-1">
        {STEPS.map((s) => {
          const isDone = !!done[s.key];
          return (
            <li
              key={s.key}
              className="flex items-center gap-3 py-1.5 group"
            >
              <button
                onClick={() => toggle(s.key)}
                aria-label={isDone ? `Mark "${s.label}" not done` : `Mark "${s.label}" done`}
                aria-pressed={isDone}
                className={cn(
                  "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                  isDone
                    ? "bg-blue-primary border-blue-primary text-white"
                    : "border-border hover:border-blue-subtle"
                )}
              >
                {isDone && <Check size={12} strokeWidth={3} />}
              </button>
              <span
                className={cn(
                  "text-[14px] flex-1",
                  isDone ? "text-text-tertiary line-through" : "text-text-primary"
                )}
              >
                {s.label}
              </span>
              <Link
                href={s.href}
                className="text-text-tertiary group-hover:text-blue-primary transition-colors"
                aria-label={`Go: ${s.label}`}
              >
                <ArrowRight size={15} strokeWidth={1.6} />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
