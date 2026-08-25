"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ListChecks, Mail, ShieldCheck, UsersRound } from "lucide-react";
import { PageTabs, type PageTab } from "@/components/ui/PageTabs";
import { useStoredView } from "@/lib/useStoredView";
import { MemberRoles } from "./MemberRoles";
import { UserGroupsAdmin } from "./UserGroupsAdmin";
import { ActivityMasterCard } from "@/components/performance/ActivityMasterCard";
import { EmailComposer } from "./EmailComposer";

/**
 * ADMIN, ONE SCREEN AT A TIME.
 *
 * Both sections used to be stacked on one page, so reaching the groups meant
 * scrolling past thirty people first (Anir, Aug 15: "make this a dropdown so
 * I can close this and go straight to groups... actually I want separate tabs
 * just like the other pages like Market Intel"). Same segmented selector as
 * Performance and Market Intel, so every module with more than one screen
 * moves the same way.
 *
 * The choice is remembered: an admin who lives in User groups lands there
 * next time instead of scrolling past the directory again.
 */
const TABS: (PageTab & { subtitle: string })[] = [
  {
    key: "members",
    label: "Team members",
    icon: ShieldCheck,
    color: "#0071E3",
    subtitle:
      "Everyone in the workspace and what they are: Rep, Manager or Admin. Only an admin can change a role, and the server enforces that too.",
  },
  {
    key: "groups",
    label: "User groups",
    icon: UsersRound,
    color: "#7C3AED",
    subtitle:
      "The departments people belong to. A group has one head and its members' goals add up to it on Group performance.",
  },
  // Configuration lives with the other admin controls (Suren, Aug 18: "I
  // think you should have admin module where all these are configured").
  {
    key: "activity",
    label: "Activity master",
    icon: ListChecks,
    color: "#0F766E",
    subtitle:
      "When someone logs an activity. A pilot, a contract. These rules decide what it is worth and which goal it can count toward. Set them once; every log in the app follows them.",
  },
  // Sending mail out of the workspace is an admin job, so it lives with the
  // other admin controls (Anir, Aug 25: "build the email stuff out for
  // admins").
  {
    key: "email",
    label: "Email",
    icon: Mail,
    color: "#B45309",
    subtitle:
      "Write and send an email from the app. Recipients do not need an account here, so customers and colleagues who never sign in receive it the same way, CC included. Everything sent is kept below.",
  },
];

const KEYS = ["members", "groups", "activity", "email"] as const;

export function AdminTabs({
  memberNames,
  activityGoals,
  live,
}: {
  memberNames: string[];
  /** Each goal with its overall progress, for the Activity Master's chips. */
  activityGoals: {
    id: string;
    name: string;
    year: number;
    type: string;
    target: number;
    actual: number;
  }[];
  live: boolean;
}) {
  const [tab, setTab] = useStoredView<(typeof KEYS)[number]>(
    "freyr.admin.tab",
    "members",
    KEYS
  );
  // A link can land you on a specific screen (?tab=activity) — the redirect
  // from the old /performance/activity-master address uses this.
  const searchParams = useSearchParams();
  const wanted = searchParams.get("tab");
  useEffect(() => {
    if (wanted && (KEYS as readonly string[]).includes(wanted)) {
      setTab(wanted as (typeof KEYS)[number]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];

  return (
    <div>
      <div className="rise-in relative z-40 mb-6">
        {/* The pills carry the page name; a heading above them would say it
            twice. Kept for screen readers and the document outline. */}
        <h1 className="sr-only">Admin: {current.label}</h1>
        <PageTabs
          tabs={TABS}
          active={current.key}
          onSelect={(key) => setTab(key as (typeof KEYS)[number])}
        />
        <p className="mt-1.5 max-w-[720px] text-[13.5px] leading-relaxed text-text-secondary">
          {current.subtitle}
        </p>
      </div>

      <div key={current.key} className="tab-panel">
        {current.key === "members" ? (
          <MemberRoles canEdit />
        ) : current.key === "groups" ? (
          <UserGroupsAdmin memberNames={memberNames} />
        ) : current.key === "email" ? (
          <EmailComposer />
        ) : (
          <>
            <p className="max-w-[70ch] text-[13px] leading-relaxed text-text-secondary">
              {/* The rulebook points at the scoreboard (Anir, Aug 17). */}
              <Link
                href="/reports/customer-offering-heat-map"
                className="font-semibold text-blue-primary hover:underline"
              >
                The heat map on Reports
              </Link>{" "}
              shows these activities live, per customer and offering.
            </p>
            <ActivityMasterCard goals={activityGoals} live={live} isAdmin />
          </>
        )}
      </div>
    </div>
  );
}
