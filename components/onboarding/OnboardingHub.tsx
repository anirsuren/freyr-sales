"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Compass,
  Play,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type OnboardingStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "skipped";

type OnboardingResponse = {
  state?: {
    status?: OnboardingStatus;
    currentStep?: number;
  };
  role?: "sales" | "editor" | "admin";
};

const START_EVENT = "freyr:onboarding:start";

const CHAPTERS = [
  {
    title: "Find your way around",
    description:
      "Dashboard, global search, quick-create, notifications, and the AI assistant.",
  },
  {
    title: "Understand the book of business",
    description:
      "Offerings, pipeline, forecast, customers, contacts, and team ownership.",
  },
  {
    title: "Move work forward",
    description:
      "Sessions, compliant agent review, sequences, campaigns, and voice agents.",
  },
  {
    title: "Stay on top of execution",
    description:
      "Tasks, analytics, reports, activity history, and account signals.",
  },
  {
    title: "Make Freyr yours",
    description:
      "Profile, workspace settings, data imports, integrations, and access controls.",
  },
];

function statusCopy(status: OnboardingStatus) {
  if (status === "completed") return "Completed";
  if (status === "skipped") return "Available anytime";
  if (status === "in_progress") return "In progress";
  return "Ready to begin";
}

export function OnboardingHub() {
  const [status, setStatus] = useState<OnboardingStatus>("not_started");
  const [currentStep, setCurrentStep] = useState(0);
  const [role, setRole] = useState<OnboardingResponse["role"]>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/onboarding", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as OnboardingResponse;
      })
      .then((body) => {
        if (!active || !body?.state) return;
        setStatus(body.state.status || "not_started");
        setCurrentStep(Math.max(0, body.state.currentStep || 0));
        setRole(body.role);
      })
      .catch(() => {
        // The provider will surface a retry if persistence is temporarily
        // unavailable. The tour hub itself should remain useful and readable.
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const replay = status === "completed" || status === "skipped";
  const label =
    status === "in_progress"
      ? "Continue tour"
      : replay
        ? "Take tour again"
        : "Start guided tour";

  function startTour() {
    window.dispatchEvent(
      new CustomEvent(START_EVENT, {
        detail: { restart: replay },
      })
    );
  }

  return (
    <div className="max-w-[1080px]" data-tour="onboarding-hub">
      <Card className="overflow-hidden border-blue-subtle bg-gradient-to-br from-blue-light via-white to-white p-0">
        <div className="grid gap-8 p-7 lg:grid-cols-[1.25fr_0.75fr] lg:p-9">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-subtle bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-blue-primary">
              <Compass size={14} />
              Interactive product tour
            </span>
            <h2 className="mt-5 max-w-[650px] text-[30px] font-semibold leading-tight tracking-[-0.03em] text-text-primary">
              Learn Freyr by using the real workspace.
            </h2>
            <p className="mt-3 max-w-[660px] text-[14px] leading-relaxed text-text-secondary">
              Freyr will open each feature, highlight the controls that matter,
              and explain what to do next. Your place is saved to your account,
              so you can stop and continue on another visit.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={startTour}
                aria-label={label}
                disabled={loading}
              >
                {replay ? <RotateCcw size={17} /> : <Play size={17} />}
                {loading ? "Loading tour…" : label}
              </Button>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 px-2 py-2.5 text-[13px] font-semibold text-blue-primary hover:underline"
              >
                Go to dashboard <ArrowRight size={15} />
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border-light bg-white/90 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-semibold text-text-secondary">
                Your tour
              </span>
              <span className="rounded-full bg-blue-light px-2.5 py-1 text-[10px] font-semibold text-blue-primary">
                {statusCopy(status)}
              </span>
            </div>
            <div className="mt-5 flex items-center gap-3">
              {status === "completed" ? (
                <CheckCircle2 size={34} className="text-success" />
              ) : (
                <Clock3 size={34} className="text-blue-primary" />
              )}
              <div>
                <p className="text-[22px] font-bold leading-none text-text-primary tnum">
                  {status === "completed"
                    ? "100%"
                    : status === "not_started"
                      ? "0%"
                      : `${Math.min(95, Math.max(5, currentStep * 5))}%`}
                </p>
                <p className="mt-1 text-[11px] text-text-tertiary">
                  {role ? `${role === "admin" ? "Admin" : role === "editor" ? "Catalog editor" : "Sales rep"} path` : "Personalized path"}
                </p>
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-blue-primary transition-[width] duration-300"
                style={{
                  width:
                    status === "completed"
                      ? "100%"
                      : status === "not_started"
                        ? "0%"
                        : `${Math.min(95, Math.max(5, currentStep * 5))}%`,
                }}
              />
            </div>
            <p className="mt-4 flex items-start gap-2 text-[11.5px] leading-relaxed text-text-secondary">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />
              The tour never sends outreach or changes customer data. Actions
              that affect real work still require your explicit approval.
            </p>
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {CHAPTERS.map((chapter, index) => (
          <Card
            key={chapter.title}
            className={index === CHAPTERS.length - 1 ? "md:col-span-2" : ""}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-light text-[11px] font-bold text-blue-primary tnum">
                {index + 1}
              </span>
              <div>
                <h3 className="text-[14px] font-semibold text-text-primary">
                  {chapter.title}
                </h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
                  {chapter.description}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
