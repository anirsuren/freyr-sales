import {
  Users,
  Wallet,
  TrendingUp,
  CalendarCheck,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import {
  buildDeals,
  buildRepStats,
  formatMoney,
  isCurrentRep,
  repOwnsDeal,
  salesTeamFor,
  STAGES,
  STAGE_COLOR,
} from "@/lib/pipeline";
import { listWorkspaceAccess } from "@/lib/accessStore";
import {
  repEmail,
  repPhone,
  repLinkedIn,
  teamsChatUrl,
  repTitle,
  repRole,
  repRegion,
  repQuota,
  repWonFY,
  repTrend,
} from "@/lib/team";
import { StatTile } from "@/components/ui/StatTile";
import { TeamRoster, type RosterRep } from "@/components/team/TeamRoster";
import { InviteTeammate } from "@/components/team/InviteTeammate";
import { EmptyState } from "@/components/ui/EmptyState";
import { getDataMode } from "@/lib/dataMode";
import { getCurrentUser } from "@/lib/currentUser";
import { requireServerMemberScope } from "@/lib/memberScope";
import { readWorkspaceMemberProfiles } from "@/lib/memberProfile";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

// Representative open deals for ONE stage of a rep who has no real deals in the
// seed (the synthetic roster) — so hovering any donut slice / rep still shows
// the deals behind the number, not a dead aggregate. Deterministic from the rep
// name + stage so it never shuffles on reload (mirrors forecast's synthDealsForRep).
function synthStageDeals(
  name: string,
  stage: string,
  stageValue: number,
  customers: { id: string; company_name: string }[],
  contacts: { customer_id: string; full_name: string }[]
) {
  if (stageValue <= 0 || customers.length === 0) return [];
  const seed = (name + stage).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const count = 1 + (seed % 3); // 1 … 3 representative deals
  const splits = [0.42, 0.31, 0.27].slice(0, count);
  const sum = splits.reduce((a, b) => a + b, 0);
  return splits.map((frac, k) => {
    const cust = customers[(seed + k * 7) % customers.length];
    const contact = contacts.find((c) => c.customer_id === cust.id);
    return {
      company: cust.company_name,
      contact: contact?.full_name || "Primary contact",
      value: Math.round((stageValue * (frac / sum)) / 1000) * 1000,
    };
  });
}

export default async function TeamPage() {
  if (getDataMode() === "live") {
    // The REAL team: every active workspace member from the directory, in the
    // exact same page as Mock — stat tiles, roster, charts — with honest
    // zeros everywhere until deals and meetings exist (Anir, Aug 6: "same
    // thing as fake mode, but all the data should say 0").
    const workspace = process.env.FREYR_WORKSPACE_ID;
    const [directory, currentUser, memberProfiles] = await Promise.all([
      workspace ? listWorkspaceAccess(workspace).catch(() => null) : null,
      getCurrentUser().catch(() => null),
      workspace
        ? readWorkspaceMemberProfiles(workspace).catch(() => new Map())
        : new Map(),
    ]);
    /**
     * EVERY REAL ACCOUNT SHOWS (Anir, Aug 13: "Just show all the actual
     * accounts people have created… you can't have some stupid logic there").
     *
     * The old filter also demanded accountType === "real", which is a field
     * the app sets, not something a person controls: any account that landed
     * with another value would have been invisible on the one page whose whole
     * job is showing who is in the workspace. Every current row happens to be
     * "real", so nothing was hidden today — but a silently-missing colleague is
     * exactly the failure this page must never have. Deactivated accounts stay
     * out, because that is a deliberate admin decision rather than a guess.
     */
    const members = (directory?.members ?? []).filter((member) => member.active);
    if (members.length === 0) {
      return (
        <div className="space-y-5">
          <PageHeader
            title="Team"
            subtitle="Everyone in the workspace."
            action={
              <InviteTeammate
                canInvite={currentUser?.role === "admin"}
                workspaceDomain={
                  currentUser?.email?.split("@")[1] || "freyrsolutions.com"
                }
              />
            }
          />
          <EmptyState
            icon={Users}
            title="No teammates yet"
            description="Use Invite, up in the corner, to bring in the first person."
          />
        </div>
      );
    }
    const ACCESS_ROLE: Record<string, RosterRep["role"]> = {
      admin: "Admin",
      editor: "Manager",
      sales: "Rep",
    };
    const zeroStages = STAGES.map((stage) => ({
      stage,
      color: STAGE_COLOR[stage],
      value: 0,
      count: 0,
    }));
    const reps: RosterRep[] = members.map((member) => {
      const title = memberProfiles.get(member.id)?.title.trim();
      return {
        identityKey: member.email || member.id,
        name: member.name,
        slug: member.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        title: title || "Title not set",
        role: ACCESS_ROLE[member.role] ?? "Rep",
        you: currentUser?.memberId === member.id,
        region: "Global",
        email: member.email || "",
        phone: "",
        linkedin: "",
        teamsUrl: member.email ? teamsChatUrl(member.email) : "",
        openValue: 0,
        weighted: 0,
        openCount: 0,
        meetings: 0,
        quota: 0,
        wonFY: 0,
        trend: [0, 0, 0, 0, 0, 0],
        stageValues: zeroStages,
        stageDeals: {},
        lastSeenAt: member.lastSeenAt,
      };
    });
    const rollup = [
      { icon: Users, label: "Team members", value: String(reps.length), sub: "in the workspace" },
      { icon: Wallet, label: "Team pipeline", value: formatMoney(0), sub: "across 0 open deals" },
      { icon: TrendingUp, label: "Weighted forecast", value: formatMoney(0), sub: "probability-adjusted" },
      { icon: CalendarCheck, label: "Meetings booked", value: "0", sub: "live across the team" },
    ];
    return (
      <div className="space-y-5">
        <PageHeader
          title="Team"
          subtitle="Everyone in the workspace. Pipeline numbers fill in as deals are logged."
          action={
            <InviteTeammate
              canInvite={currentUser?.role === "admin"}
              workspaceDomain={
                currentUser?.email?.split("@")[1] || "freyrsolutions.com"
              }
            />
          }
        />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {rollup.map((tile) => (
            <StatTile key={tile.label} icon={tile.icon} label={tile.label} value={tile.value} sub={tile.sub} />
          ))}
        </div>
        <TeamRoster reps={reps} />
      </div>
    );
  }
  const [currentUser, scope] = await Promise.all([
    getCurrentUser(),
    requireServerMemberScope(),
  ]);
  const db = getDb();
  const [sessions, customers, contacts, interactions, agentPrefs] =
    await Promise.all([
      db.pitchSessions.list(),
      db.customers.list(),
      db.contacts.list(),
      db.interactions.list(),
      // The signed-in member's own profile prefs — the LinkedIn URL they
      // pasted in Settings › Profile is the ONLY LinkedIn we may show for them.
      db.agentPrefs.get(scope),
    ]);
  const deals = buildDeals(sessions, customers, contacts, interactions);
  const stats = buildRepStats(deals, {
    roster: salesTeamFor(currentUser),
  });

  const totalPipeline = stats.reduce((s, r) => s + r.openValue, 0);
  const totalWeighted = stats.reduce((s, r) => s + r.weighted, 0);
  const totalMeetings = stats.reduce((s, r) => s + r.meetings, 0);
  const totalOpen = stats.reduce((s, r) => s + r.openCount, 0);

  const reps: RosterRep[] = stats.map((r) => {
    const you = isCurrentRep(r, currentUser.memberId);
    // The actual open deals behind each stage — real ones for the four deal-
    // owning reps, deterministic representatives for the synthetic roster — so
    // hovering a donut slice / a rep row shows company + contact + value, not
    // just the aggregate (Suren: "every graph has to tell me who").
    const repRealDeals = deals.filter(
      (d) => repOwnsDeal(r, d) && d.stage !== "Closed Lost"
    );
    const stageDeals: Record<
      string,
      { company: string; contact: string; value: number }[]
    > = {};
    for (const sv of r.stageValues) {
      if (sv.value <= 0) continue;
      const real = repRealDeals
        .filter((d) => d.stage === sv.stage)
        .sort((a, b) => b.value - a.value)
        .map((d) => ({ company: d.company, contact: d.contactName, value: d.value }));
      stageDeals[sv.stage] =
        real.length > 0
          ? real
          : synthStageDeals(r.name, sv.stage, sv.value, customers, contacts);
    }
    return {
      identityKey: r.key,
      name: r.name,
      you,
      slug: r.slug,
      title: you ? currentUser.title : repTitle(r.name),
      role:
        you
          ? currentUser.role === "admin"
            ? "Admin"
            : currentUser.role === "editor"
              ? "Manager"
              : "Rep"
          : repRole(r.name),
      // NEVER invent identity facts for the real signed-in person — the
      // hashed demo region/phone are for the synthetic roster only (Anir:
      // "Why is it saying I'm from China? I didn't even put that."). Until a
      // real profile field exists, show nothing. Same rule for linkedin: the
      // real person gets the URL they pasted in Settings › Profile or NO chip
      // at all — a fabricated profile link is worse than none.
      region: you ? "" : repRegion(r.name),
      email: (you && currentUser.email) || repEmail(r.name),
      phone: you ? "" : repPhone(r.name),
      linkedin: you ? agentPrefs?.linkedin_url ?? "" : repLinkedIn(r.name),
      teamsUrl: teamsChatUrl(
        r.name,
        you ? currentUser.email : null
      ),
      openValue: r.openValue,
      weighted: r.weighted,
      openCount: r.openCount,
      meetings: r.meetings,
      quota: repQuota(r.name),
      wonFY: repWonFY(r.name),
      trend: repTrend(r.name),
      stageValues: r.stageValues.map((s) => ({
        stage: s.stage,
        color: s.color,
        value: s.value,
        count: s.count,
      })),
      stageDeals,
    };
  });

  const rollup = [
    { icon: Users, label: "Team members", value: String(reps.length), sub: "on the sales floor" },
    { icon: Wallet, label: "Team pipeline", value: formatMoney(totalPipeline), sub: `across ${totalOpen} open deals` },
    { icon: TrendingUp, label: "Weighted forecast", value: formatMoney(totalWeighted), sub: "probability-adjusted" },
    { icon: CalendarCheck, label: "Meetings booked", value: String(totalMeetings), sub: "live across the team" },
  ];

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Your Freyr sales floor: message anyone on Teams or call them directly, and see what each rep is working."
        action={
          <InviteTeammate
            canInvite={currentUser.role === "admin"}
            workspaceDomain={
              currentUser.email?.split("@")[1] || "freyrsolutions.com"
            }
          />
        }
      />

      {/* The shared tile, same as Sequences: icon and label on one row, the
          number under it. The old hand-rolled card pinned a fixed 132px height
          and stranded the icon at the top, which is what made these read as
          oddly tall (Anir, Jul 25). */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {rollup.map((k) => (
          <StatTile key={k.label} {...k} />
        ))}
      </section>

      <TeamRoster reps={reps} />
    </div>
  );
}
