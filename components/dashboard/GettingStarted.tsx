"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, ArrowRight, Rocket } from "lucide-react";
import { Card } from "@/components/ui/Card";

// Setup steps for a brand-new workspace. Each is a real link to where the
// work actually happens — outcome-worded, no fake "check it off yourself"
// boxes (those lied: the dashboard would show "0 of 5" next to a full book
// of business). The list is honest by construction — once you've actually
// run a pitch session the workspace is "established" and this card is gone.
const STEPS = [
  {
    key: "launch",
    label: "Open the guided setup",
    desc: "Configure the workspace, imports, identity, and first approved pitch in order.",
    href: "/onboarding",
  },
  {
    // Offerings first — Suren's north star is the offering repository, so a new
    // workspace is guided to set that up before anything else.
    key: "offerings",
    label: "Set up your offerings",
    desc: "Build the repository of what Freyr sells — who it's for and where it's available.",
    href: "/offerings",
  },
  {
    key: "session",
    label: "Run your first pitch session",
    desc: "Pick an account and let the agent draft a tailored pitch.",
    href: "/intake",
  },
  {
    key: "approve",
    label: "Review and send a pitch",
    desc: "Approve a drafted pitch — nothing goes out until you say so.",
    href: "/agent/inbox",
  },
  {
    key: "sequence",
    label: "Put an account in a sequence",
    desc: "Queue the follow-ups the agent preps for you to send.",
    href: "/sequences",
  },
  {
    key: "crm",
    label: "Connect your CRM",
    desc: "Sync your accounts and activity both ways.",
    href: "/settings",
  },
  {
    key: "invite",
    label: "Invite your team",
    desc: "Bring your reps in so the whole desk runs on Freyr.",
    href: "/settings",
  },
];

const DISMISS_KEY = "freyr.onboarding.dismissed.v1";

export function GettingStarted({ established }: { established: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {}
    setMounted(true);
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  // Onboarding is for an empty workspace. The moment there's real work in
  // Freyr, a setup checklist on the dashboard is just noise (and looked fake
  // sitting next to live pipeline) — so it steps aside and the agent's
  // recommendations lead. Also hidden once the user dismisses it.
  // avoid hydration flicker before we can read localStorage
  if (!mounted || established || dismissed) return null;

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
              A few steps to set up your workspace.
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

      <ul className="space-y-1">
        {STEPS.map((s) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-surface transition-colors group"
            >
              <span className="w-5 h-5 rounded-full border border-border group-hover:border-blue-subtle flex items-center justify-center shrink-0 transition-colors" />
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] text-text-primary">
                  {s.label}
                </span>
                <span className="block text-[12px] text-text-secondary truncate">
                  {s.desc}
                </span>
              </span>
              <ArrowRight
                size={15}
                strokeWidth={1.6}
                className="text-text-tertiary group-hover:text-blue-primary transition-colors shrink-0"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
