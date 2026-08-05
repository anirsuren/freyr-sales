"use client";

import { roleLabel } from "@/components/ui/RoleTag";
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
import {
  getProductTourSteps,
  localTourIndexForCatalogStep,
} from "@/lib/productTourCatalog";

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

const OFFERINGS_ONLY_CHAPTERS = [
  {
    title: "Find and create quickly",
    description:
      "Use global search and quick-create without leaving the offering work in front of you.",
  },
  {
    title: "Master the offering repository",
    description:
      "Review approved services, customer fit, markets, owners, availability, and supporting material.",
  },
  {
    title: "Configure your workspace",
    description:
      "Set your profile and preferences; admins also learn the access and team controls.",
  },
];

function statusCopy(status: OnboardingStatus) {
  if (status === "completed") return "Completed";
  if (status === "skipped") return "Available anytime";
  if (status === "in_progress") return "In progress";
  return "Ready to begin";
}

export function OnboardingHub({
  offeringsOnly,
}: {
  offeringsOnly: boolean;
}) {
  const [status, setStatus] = useState<OnboardingStatus>("not_started");
  const [currentStep, setCurrentStep] = useState(0);
  const [role, setRole] = useState<OnboardingResponse["role"]>();
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

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
  const chapters = offeringsOnly ? OFFERINGS_ONLY_CHAPTERS : CHAPTERS;
  const tourSteps = getProductTourSteps({ offeringsOnly, role });
  const totalSteps = tourSteps.length;
  const localStep = localTourIndexForCatalogStep(tourSteps, currentStep);
  const progress =
    status === "completed"
      ? 100
      : status === "not_started"
        ? 0
        : Math.min(
            95,
            Math.max(
              1,
              Math.round(
                ((Math.min(localStep, totalSteps - 1) + 1) / totalSteps) * 100
              )
            )
          );
  const label =
    status === "in_progress"
      ? "Continue tour"
      : replay
        ? "Take tour again"
        : "Start guided tour";

  async function patchOnboarding(action: {
    action: "progress" | "reset";
    currentStep?: number;
  }): Promise<void> {
    const response = await fetch("/api/onboarding", {
      method: "PATCH",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(action),
    });
    if (response.ok) return;

    let message = "We could not start the product tour. Please try again.";
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim()) {
        message = body.error;
      }
    } catch {
      // Keep the useful fallback for empty and non-JSON responses.
    }
    throw new Error(message);
  }

  async function startTour() {
    if (loading || launching || tourSteps.length === 0) return;
    const nextLocalStep =
      !replay && status === "in_progress" ? localStep : 0;
    const nextStep = tourSteps[nextLocalStep] || tourSteps[0];

    setLaunching(true);
    setLaunchError(null);
    try {
      if (replay) await patchOnboarding({ action: "reset" });
      await patchOnboarding({
        action: "progress",
        currentStep: nextStep.catalogIndex,
      });
      // A full navigation gives the provider a clean post-login mount and
      // makes the hub a reliable recovery path even after a transient load
      // failure or a missed client event.
      window.location.assign(nextStep.route);
    } catch (cause) {
      setLaunchError(
        cause instanceof Error
          ? cause.message
          : "We could not start the product tour. Please try again."
      );
      setLaunching(false);
    }
  }

  return (
    <div className="max-w-[1080px]" data-tour="onboarding-hub">
      {/* Solid bg-white (which dark mode remaps) + a translucent blue glow
          overlay. The old white GRADIENT STOPS (via-white/to-white) are not
          remapped by .dark, so in dark mode the card stayed light while its
          text flipped to near-white — an unreadable white slab (Anir, Aug 6:
          "I'm on dark mode, but it shows up like this"). */}
      <Card className="relative overflow-hidden border-blue-subtle bg-white p-0">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[rgba(0,113,227,0.14)] via-transparent to-transparent"
        />
        <div className="relative grid gap-8 p-7 lg:grid-cols-[1.25fr_0.75fr] lg:p-9">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-subtle bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-blue-primary">
              <Compass size={14} />
              Interactive product tour
            </span>
            <h2 className="mt-5 max-w-[650px] text-[30px] font-semibold leading-tight tracking-[-0.03em] text-text-primary">
              Learn the {offeringsOnly ? "released Freyr experience" : "whole Freyr workspace"} by using it.
            </h2>
            <p className="mt-3 max-w-[660px] text-[14px] leading-relaxed text-text-secondary">
              Freyr will open each {offeringsOnly ? "available" : ""} feature,
              highlight the controls that matter, and explain what to do next.
              Your place is saved to your account, so you can stop and continue
              on another visit.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => void startTour()}
                aria-label={label}
                disabled={loading || launching}
              >
                {replay ? <RotateCcw size={17} /> : <Play size={17} />}
                {loading
                  ? "Loading tour…"
                  : launching
                    ? "Starting tour…"
                    : label}
              </Button>
              <Link
                href={offeringsOnly ? "/offerings" : "/dashboard"}
                className="inline-flex items-center gap-1.5 px-2 py-2.5 text-[13px] font-semibold text-blue-primary hover:underline"
              >
                Go to {offeringsOnly ? "offerings" : "dashboard"}{" "}
                <ArrowRight size={15} />
              </Link>
            </div>
            {launchError && (
              <p
                role="alert"
                className="mt-3 text-[12px] font-medium text-error"
              >
                {launchError}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border-light bg-[var(--white)] p-5 shadow-sm">
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
                      : `${progress}%`}
                </p>
                <p className="mt-1 text-[11px] text-text-tertiary">
                  {role ? `${roleLabel(role)} path` : "Personalized path"}
                </p>
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-blue-primary transition-[width] duration-300"
                style={{
                  width:
                    `${progress}%`,
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
        {chapters.map((chapter, index) => (
          <Card
            key={chapter.title}
            className={index === chapters.length - 1 ? "md:col-span-2" : ""}
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
