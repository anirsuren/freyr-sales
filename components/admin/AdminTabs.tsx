"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  ListChecks,
  Mail,
  PanelsTopLeft,
  Rows3,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { PageTabs, type PageTab } from "@/components/ui/PageTabs";
import { useStoredView } from "@/lib/useStoredView";
import { ADMIN_TABS } from "@/lib/adminTabs";
import { InfoHint } from "@/components/ui/InfoHint";
import { InviteTeammate } from "@/components/team/InviteTeammate";
import { useCurrentUserOrNull } from "@/components/auth/CurrentUserProvider";
import { AdminTabActions } from "./AdminTabActions";
import { MemberRoles } from "./MemberRoles";
import { PeoplePrivileges } from "./PeoplePrivileges";
import { PeopleSplit } from "./PeopleSplit";
import { UserGroupsAdmin } from "./UserGroupsAdmin";
import { PrivilegesAdmin } from "./PrivilegesAdmin";
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
/**
 * ONE LINE ON THE PAGE, THE REST ON HOVER (Anir, Aug 29: "why so much text,
 * tuck this somewhere, figure it out").
 *
 * Privileges had grown to a four-sentence paragraph explaining View/Edit/Create,
 * record scoping and View all — true, and a wall above the grid it describes.
 * Nothing is printed on the page at all now — `detail` is what you ask for,
 * behind the same InfoHint the rest of the app uses.
 */
const TABS: (PageTab & { detail?: string })[] = [
  {
    key: "members",
    label: "Team members",
    icon: ShieldCheck,
    color: "#0071E3",
    detail:
      "Everyone in the workspace, and what each of them holds. A person can hold several privileges at once. Only an admin can change a role or a privilege, and the server enforces that too, so this page being admin-only is the convenience rather than the security.",
  },
  {
    key: "groups",
    label: "User groups",
    icon: UsersRound,
    color: "#7C3AED",
    detail:
      "The departments people belong to. A group has one owner and the people in it. Open a group to set the goals it carries and each person's target. A group's TYPE decides which module can hand it work: a business development group takes customers, contracts and opportunities; a solutioning group takes solution requests, submissions, presentations and meetings.",
  },
  // Configuration lives with the other admin controls (Suren, Aug 18: "I
  // think you should have admin module where all these are configured").
  /* PRIVILEGES SIT NEXT TO GROUPS, because a group is where a person picks one
     up (Suren, Aug 29: "the person belongs to a particular group… when that
     group or that person is added, a privilege is given"). */
  {
    key: "privileges",
    label: "Privileges",
    icon: KeyRound,
    color: "#B45309",
    detail:
      "In which module each role may do what. View looks. Edit changes what is already there. Create makes new ones and is the only one that can delete.\n\nAll of it applies only to records a person created or was assigned to. View all is the one privilege that shows them everybody else's, and it never lets them change one.\n\nEvery change takes effect straight away, asks first, and emails the admins. Who holds which role is on Team members.",
  },
  {
    key: "activity",
    label: "Activity master",
    icon: ListChecks,
    color: "#0F766E",
    detail:
      "What an activity is worth, and which goal it counts toward. When someone logs an activity — a pilot, a contract — these rules decide what it is worth and which goal it can count toward. Set them once; every log in the app follows them.",
  },
  // Sending mail out of the workspace is an admin job, so it lives with the
  // other admin controls (Anir, Aug 25: "build the email stuff out for
  // admins").
  {
    key: "email",
    label: "Email",
    icon: Mail,
    color: "#B45309",
    detail:
      "Write and send an email from the app. Recipients do not need an account here, so customers and colleagues who never sign in receive it the same way, CC included. Everything sent is kept below.",
  },
];



export function AdminTabs({
  routeTab,
  memberNames,
  activityGoals,
  live,
}: {
  /**
   * WHICH ROOM, FROM THE URL — not from remembered state.
   *
   * This used to be a useStoredView, so clicking a tab changed the screen and
   * left the address bar saying /admin. Nothing was linkable and Back left the
   * page. Each room has its own address now and this is simply which one you
   * are on.
   */
  routeTab: (typeof ADMIN_TABS)[number];
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
  const me = useCurrentUserOrNull();
  /* Table or split on Team members, remembered like every other view choice
     in this app (Anir, Aug 9: "you have to save my preferences and apply this
     everywhere"). */
  const [peopleView, pickPeopleView] = useStoredView<"table" | "split">(
    "freyr.teamMembers.view",
    "table",
    ["table", "split"] as const
  );
  const router = useRouter();
  const tab = routeTab;
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];

  return (
    <div>
      <div className="rise-in relative z-40 mb-6">
        {/* The pills carry the page name; a heading above them would say it
            twice. Kept for screen readers and the document outline. */}
        <h1 className="sr-only">Admin: {current.label}</h1>
        {/* NO SUBTEXT LINE (Anir, Aug 29: "you don't need to say the subtext
            underneath, you really never need to say"). The tab already names
            the screen; a sentence restating it was a band of text above every
            page in Admin. What the sentence explained lives on the hint beside
            the tabs, which is one hover away and takes no vertical space.

            THE PAGE'S OWN CONTROLS RIDE UP HERE (Anir, same message: "the new
            group and the table and the split should go up to the top right, so
            you can clear the space"). Each tab's panel portals its buttons into
            this slot — the same mechanic the Performance header uses for its
            export control — so the row is the tabs on the left and whatever
            this screen can do on the right. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <PageTabs
              tabs={TABS}
              active={current.key}
              onSelect={(key) => router.push(`/admin/${key}`)}
            />
            {current.detail && <InfoHint text={current.detail} />}
          </span>
          <span id="admin-tab-actions" className="flex items-center gap-2" />
        </div>
      </div>

      <div key={current.key} className="tab-panel">
        {current.key === "members" ? (
          /* USERS AND THEIR PRIVILEGES, ON ONE TAB (Suren, Aug 29: "Team
             members, that's where all the username and their privilege — but
             the table should come for them"). The directory says who joined
             and as what; the table under it says what each of them holds. The
             Privileges tab is the other question entirely, module privileges,
             and keeping them apart is what he was untangling. */
          <>
            {/* SAME TWO VIEWS AS USER GROUPS (Anir, Aug 29: "here also, as I
                said, I would like the same concept"). Table answers "who can do
                what" across everybody; Split answers "what can THIS person do"
                without forty rows of other people's ticks in the way. */}
            <AdminTabActions active="members">
              <div
                role="group"
                aria-label="How to show people"
                className="flex items-center gap-0.5 rounded-full bg-surface p-0.5"
              >
                {(
                  [
                    { key: "table", label: "Table", icon: Rows3 },
                    { key: "split", label: "Split", icon: PanelsTopLeft },
                  ] as const
                ).map((o) => {
                  const Icon = o.icon;
                  const on = peopleView === o.key;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => pickPeopleView(o.key)}
                      aria-pressed={on}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold transition-all ${
                        on
                          ? "bg-white text-text-primary shadow-sm"
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
                      {o.label}
                    </button>
                  );
                })}
              </div>
              {/* INVITING SOMEBODY BELONGS ON THE PAGE THAT LISTS EVERYBODY
                  (Anir, Aug 29: "also add an invite button, I don't know why
                  that's not there here"). It only existed on /team, which is
                  the roster people read — not the screen an admin opens to add
                  someone. Same component, so the invitation email and the
                  domain rule stay identical wherever it is pressed. */}
              <InviteTeammate
                canInvite
                workspaceDomain={
                  me?.email?.split("@")[1] || "freyrsolutions.com"
                }
              />
            </AdminTabActions>
            {/* Table and Split are two different screens, so each announces
                itself when you land on it. */}
            {peopleView === "split" ? (
              <div key="split" className="tab-panel">
                <PeopleSplit />
              </div>
            ) : (
              <div key="table" className="tab-panel">
                <MemberRoles canEdit />
                <div className="mt-8">
                  <h3 className="text-[15px] font-semibold text-text-primary">
                    Who holds which privilege
                  </h3>
                  <p className="mb-3 mt-0.5 text-[12.5px] text-text-tertiary">
                    Ticks, not a dropdown, so one look answers who can do what.
                  </p>
                  <PeoplePrivileges />
                </div>
              </div>
            )}
          </>
        ) : current.key === "groups" ? (
          <UserGroupsAdmin memberNames={memberNames} />
        ) : current.key === "privileges" ? (
          <PrivilegesAdmin />
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
