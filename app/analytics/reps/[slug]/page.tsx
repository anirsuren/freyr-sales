import Link from "next/link";
import {
  SearchX,
  DollarSign,
  Mail,
  PhoneCall,
  Layers,
  Target,
  TrendingUp,
  ArrowRight,
  Trophy,
  ArrowLeft,
  Briefcase,
  CalendarCheck,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { repEmail, repPhone, teamsChatUrl } from "@/lib/team";
import { TeamsIcon } from "@/components/ui/TeamsIcon";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { StatTile } from "@/components/ui/StatTile";
import { SizeBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackButton, SmartBack } from "@/components/ui/BackButton";
import { DonutChart, DonutLegend, BarChart, AreaChart, VIZ, VIZ_SERIES } from "@/components/charts/Charts";
import { ChartInspector, type ChartRecord } from "@/components/charts/ChartInspector";
import { ExpandableChartCard } from "@/components/charts/ExpandableChartCard";
import {
  buildDeals,
  buildRepStats,
  isCurrentRep,
  repOwnsDeal,
  STAGE_COLOR,
  STAGE_ICON,
  STAGE_PROBABILITY,
  salesTeamFor,
  formatMoney,
} from "@/lib/pipeline";
import { repTitle, repRegion, repQuota, repWonFY } from "@/lib/team";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { readWorkspaceMemberProfiles } from "@/lib/memberProfile";
import { readOpportunities } from "@/lib/opportunities";
import { buildPerson360 } from "@/lib/person360";
import { Customer360 } from "@/components/customers/Customer360";
import { opportunityValue, weightedValue } from "@/lib/opportunitiesShared";

/**
 * The teammate's own name in the tab. A static "Rep" made every open profile
 * identical in the tab strip, and it is the same slug-to-name mapping the page
 * itself uses below (found Aug 14 walking the flows). Derived from the slug so
 * this costs no extra lookup: the slug IS the name, lowercased and hyphenated.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const name = slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return { title: name ? `${name} · Team` : "Rep" };
}

export const dynamic = "force-dynamic";

const ago = (days: number) =>
  days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export default async function RepPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const slug = (await params).slug;

  // Real mode: the rep is a REAL workspace member, reached from the Team
  // page. Their profile renders with honest zeros until deals exist — no
  // synthetic pipeline, no invented charts (Anir, Aug 6: "I should be able
  // to click on each rep").
  if (getDataMode() === "live") {
    const workspace = process.env.FREYR_WORKSPACE_ID;
    const [directory, memberProfiles] = workspace
      ? await Promise.all([
          listWorkspaceAccess(workspace).catch(() => null),
          readWorkspaceMemberProfiles(workspace).catch(() => new Map()),
        ])
      : [null, new Map()];
    const member = (directory?.members ?? []).find(
      (m) =>
        m.active &&
        m.accountType === "real" &&
        m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") === slug
    );
    if (!member) {
      return (
        <EmptyState
          icon={SearchX}
          title="Rep not found"
          description="That teammate isn't on the roster. Head back to the team."
          className="py-24"
          action={
            <SmartBack
              fallback="/team"
              className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
            >
              <ArrowLeft size={15} strokeWidth={2} />
              Back to team
            </SmartBack>
          }
        />
      );
    }
    const memberTitle = memberProfiles.get(member.id)?.title.trim();
    /**
     * THEIR OWN DEALS, NOT FOUR ZEROS (the Team page told the same lie until
     * today: tiles hardcoded to 0 while the workspace held a $10.6M pipeline).
     *
     * The roster now shows what each person is carrying, so clicking their
     * name had to stop contradicting the row it was opened from. Same
     * arithmetic as Team and Opportunities: total is the sum of the offering
     * rows, weighted applies each row's own confidence. Meetings has no live
     * source yet, so it stays an honest zero.
     */
    const myOpen = (await readOpportunities()).opportunities.filter(
      (deal) =>
        (deal.owner ?? "").trim().toLowerCase() === member.name.trim().toLowerCase() &&
        deal.level !== "Future" &&
        deal.status !== "Won" &&
        deal.status !== "Lost"
    );
    const myValue = myOpen.reduce((sum, deal) => sum + opportunityValue(deal), 0);
    const myWeighted = Math.round(
      myOpen.reduce((sum, deal) => sum + weightedValue(deal), 0)
    );
    const zeroTiles = [
      {
        label: "Open pipeline",
        value: formatMoney(myValue),
        sub: `${myOpen.length} live ${myOpen.length === 1 ? "deal" : "deals"}`,
        icon: DollarSign,
      },
      { label: "Weighted forecast", value: formatMoney(myWeighted), sub: "probability-adjusted", icon: TrendingUp },
      { label: "Open deals", value: String(myOpen.length), sub: "in the pipeline", icon: Briefcase },
      { label: "Meetings", value: "0", sub: "booked", icon: CalendarCheck },
    ];
    const person360 = await buildPerson360(
      member.name,
      (await getCurrentUser()).role
    ).catch(() => []);
    return (
      <div className="space-y-5">
        <BackButton fallback="/team" label="Back to team" />
        <Card className="flex flex-wrap items-center gap-4 p-5">
          <Avatar name={member.name} className="h-16 w-16 text-[20px]" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[19px] font-bold leading-tight text-text-primary">
              {member.name}
            </h1>
            <p className="mt-0.5 text-[13px] text-text-secondary">
              {memberTitle || "Title not set"}
            </p>
            {/* WHEN DID THEY JOIN (Anir, Aug 12: "I would like to see when
                they join when I click on them") — the workspace account's own
                creation date, so it is a fact about this person and not a
                guess. Absent on accounts created before the column existed. */}
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-text-tertiary">
              {/* THE SAME EMAIL TREATMENT AS THE ROSTER: envelope, then a
                  mailto. Here it was a bare span — no icon and not even
                  clickable — while the joined date beside it carried a
                  calendar, so the one line held two conventions and the
                  address you actually want to use was the dead one (Anir,
                  Aug 14: "you need the email icon there, just like you show
                  it on the overall team's page"). */}
              {member.email && (
                <a
                  href={`mailto:${member.email}`}
                  title={`Email ${member.name}`}
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-blue-primary"
                >
                  <Mail size={12} strokeWidth={2} className="shrink-0" />
                  {member.email}
                </a>
              )}
              {member.joinedAt && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarCheck size={12} strokeWidth={2} />
                  Joined{" "}
                  {new Date(member.joinedAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
            </p>
          </div>
          {member.email && (
            <a
              href={teamsChatUrl(member.email)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border-light bg-white px-3.5 py-2 text-[12.5px] font-semibold text-text-primary transition-colors hover:border-blue-subtle hover:text-blue-primary"
            >
              <TeamsIcon size={15} />
              Message on Teams
            </a>
          )}
        </Card>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {zeroTiles.map((tile) => (
            <StatTile key={tile.label} icon={tile.icon} label={tile.label} value={tile.value} sub={tile.sub} />
          ))}
        </div>
        {/* EVERYTHING WITH THIS PERSON'S NAME ON IT (Suren, Aug 25: "I click
            on the person's name… wherever he's been called an owner, those
            will come… I want one short understanding of what is this guy
            doing"). Not filtered by job title — his explicit instruction was
            that a person plays whatever roles the records say they play. */}
        {person360.length > 0 && (
          <Customer360
            company={member.name}
            heading={`Everything ${member.name.split(" ")[0]} owns`}
            emptyLine={`Nothing across the app carries ${member.name.split(" ")[0]}'s name yet.`}
            bands={person360}
          />
        )}
        {myOpen.length === 0 ? (
          <p className="text-[12.5px] text-text-tertiary">
            Deals, meetings and activity charts fill in here as {member.name.split(" ")[0]} logs real work.
          </p>
        ) : (
          /* A profile opened from the roster has to show the deals behind the
             tile, or the drill-down says less than the row it came from. */
          <Card className="overflow-hidden p-0">
            <div className="border-b border-border-light px-4 py-3">
              <h2 className="text-[13px] font-bold text-text-primary">Open deals</h2>
              <p className="mt-0.5 text-[12px] text-text-secondary">
                Every current deal with {member.name.split(" ")[0]}&rsquo;s name on it.
              </p>
            </div>
            {/* THE MONEY RIDES THE NAME (Anir, Aug 27: "I hate when you
                have something on the left and then I have to look like a
                hundred thousand pixels to the right just to see it"). Value
                on the title line, weighted beside the customer — nothing
                flushed across the card. */}
            <ul className="divide-y divide-border-light">
              {myOpen.map((deal) => (
                <li key={deal.id} className="flex items-center gap-3 px-4 py-3">
                  <CompanyLogo
                    name={deal.customer}
                    className="h-8 w-8 shrink-0 text-[9px]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-[13px] font-semibold text-text-primary">
                        {deal.name}
                      </span>
                      <b className="text-[13px] font-bold text-text-primary tnum">
                        {formatMoney(opportunityValue(deal))}
                      </b>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12px]">
                      <span className="truncate text-text-secondary">{deal.customer}</span>
                      <span className="font-semibold text-blue-primary tnum">
                        {formatMoney(Math.round(weightedValue(deal)))} weighted
                      </span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    );
  }

  const currentUser = await getCurrentUser();
  const db = getDb();
  const [sessions, customers, contacts, interactions] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
  ]);
  const allDeals = buildDeals(sessions, customers, contacts, interactions);
  const ranked = buildRepStats(allDeals, {
    roster: salesTeamFor(currentUser),
  }); // sorted by open pipeline desc
  const me = ranked.find((rep) => rep.slug === slug);
  if (!me) {
    return (
      <EmptyState
        icon={SearchX}
        title="Rep not found"
        description="That teammate isn't on the roster. Head back to the team."
        className="py-24"
        action={
          <SmartBack
            fallback="/team"
            className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            Back to team
          </SmartBack>
        }
      />
    );
  }
  const name = me.name;
  const rank = ranked.findIndex((rep) => rep.key === me.key) + 1;
  const myDeals = allDeals.filter((deal) => repOwnsDeal(me, deal));
  const isYou = isCurrentRep(me, currentUser.memberId);

  // Name pools so every chart point can name the WHO/WHICH behind it (Suren:
  // "you can't just say 7 — which deals?"). Real deals name themselves; the rest
  // attribute believable accounts/contacts deterministically.
  const companyPool = customers.map((c) => c.company_name).filter(Boolean);
  const contactPool = contacts.map((c) => c.full_name).filter(Boolean);
  const custById = new Map(customers.map((c) => [c.id, c.company_name] as const));
  const contactCompany = new Map(
    contacts.map((c) => [c.full_name, custById.get(c.customer_id) || "-"] as const)
  );
  function pick(pool: string[], seed: string, count: number): string[] {
    if (pool.length === 0 || count <= 0) return [];
    let h = hash(seed);
    const used = new Set<number>();
    const out: string[] = [];
    for (let k = 0; k < count && used.size < pool.length; k++) {
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      let idx = h % pool.length;
      while (used.has(idx)) idx = (idx + 1) % pool.length;
      used.add(idx);
      out.push(pool[idx]);
    }
    return out;
  }
  // Rich breakdown for a stage — real deals name themselves (logo + contact +
  // value); synthetic stages attribute a company, contact and value share so a
  // rep sees who's in the stage and what it's worth, not just a name (Suren).
  const stageTip = (stage: string, count: number, stageValue: number) => {
    const real = myDeals.filter((d) => d.stage === stage && d.stage !== "Closed Lost");
    if (real.length)
      return real.map((d) => ({
        logo: d.company,
        avatar: d.contactName,
        name: d.company,
        sub: `${d.contactName} · ${d.stage}`,
        value: formatMoney(d.value),
      }));
    const cos = pick(companyPool, `${name}-co-${stage}`, count);
    const cts = pick(contactPool, `${name}-ct-${stage}`, count);
    const avg = stageValue / Math.max(count, 1);
    return cos.map((co, i) => {
      const jitter = 0.7 + ((hash(`${name}${stage}${i}`) >>> 5) % 60) / 100;
      return {
        logo: co,
        name: co,
        avatar: cts[i] ?? undefined,
        sub: `${cts[i] ?? "Decision-maker"} · ${stage}`,
        value: formatMoney(Math.round((avg * jitter) / 5000) * 5000),
      };
    });
  };

  // Identity facts are never invented for the real signed-in person — the
  // hashed demo region/phone belong to the synthetic roster only (Anir: "Why
  // is it saying I'm from China?").
  const region = isYou ? "" : repRegion(name);
  const email = isYou && currentUser.email ? currentUser.email : repEmail(name);
  const phone = isYou ? "" : repPhone(name);
  const title = isYou ? currentUser.title : repTitle(name);
  const quota = repQuota(name);
  const wonFY = repWonFY(name);
  const attain = Math.round((wonFY / quota) * 100);
  // Painted on a 34px attainment number — amber text was barely visible on
  // white. Burnt orange keeps "mid tier" warm and legible.
  const attainColor = attain >= 50 ? "#1A7A35" : attain >= 35 ? "#C2410C" : "#B02020";

  const tiles = [
    { label: "Open pipeline", value: formatMoney(me.openValue), sub: `${me.openCount} live deal${me.openCount === 1 ? "" : "s"}`, icon: DollarSign },
    { label: "Weighted", value: formatMoney(me.weighted), sub: "probability-adjusted", icon: TrendingUp },
    { label: "Qualified+", value: String(me.qualifiedPlus), sub: `${me.meetings} meeting${me.meetings === 1 ? "" : "s"} booked`, icon: Target },
    { label: "Avg deal", value: formatMoney(me.avgDeal), sub: `${me.deals} total owned`, icon: Layers },
  ];

  // Value + count per open stage (drives the bar + donut + funnel).
  const valueByStage = me.stageValues
    .filter((s) => s.value > 0)
    .map((s) => ({
      label: s.stage.replace("Meeting Booked", "Meeting"),
      value: s.value,
      color: s.color,
      tip: stageTip(s.stage, s.count, s.value),
    }));
  const dealsByStage = me.stageValues
    .filter((s) => s.count > 0)
    .map((s) => ({
      label: s.stage,
      value: s.count,
      color: s.color,
      tip: stageTip(s.stage, s.count, s.value),
    }));

  // Outcome mix of this rep's logged touches — deterministic + believable.
  const outcomes = [
    { label: "Interested", value: Math.max(1, Math.round(me.qualifiedPlus * 1.3)), color: "#34C759" },
    { label: "Meeting booked", value: me.meetings, color: "#0071E3" },
    // DonutLegend draws each label as colour-on-tint text, so this is a text
    // colour too — amber was illegible there.
    { label: "Follow-up", value: Math.max(1, Math.round(me.openCount * 0.4)), color: "#C2410C" },
    { label: "No response", value: Math.max(1, Math.round(me.openCount * 0.28)), color: "#A855F7" },
  ]
    .filter((o) => o.value > 0)
    // Who's behind each outcome — the actual contacts, with headshot + company.
    .map((o) => ({
      ...o,
      tip: pick(contactPool, `${name}-out-${o.label}`, o.value).map((c) => ({
        avatar: c,
        name: c,
        sub: contactCompany.get(c) || "-",
      })),
    }));
  const totalTouches = outcomes.reduce((s, o) => s + o.value, 0);

  // Deals worked, last 12 weeks — activity + which accounts/contacts each week.
  const activity = Array.from({ length: 12 }, (_, i) => {
    const h = hash(`${name}#${i}`);
    return 1 + (h % 7);
  });
  const activityTips = activity.map((n, i) => {
    const cos = pick(companyPool, `${name}-wk-${i}`, n);
    const cts = pick(contactPool, `${name}-wkc-${i}`, n);
    return cos.map((co, j) => ({ logo: co, avatar: cts[j] || undefined, name: co, sub: cts[j] || "Touchpoint" }));
  });

  // Biggest open accounts (real reps have real deals).
  const byAccount = new Map<string, number>();
  for (const d of myDeals.filter((d) => d.stage !== "Closed Lost"))
    byAccount.set(d.company, (byAccount.get(d.company) || 0) + d.value);
  const rankedAccounts = Array.from(byAccount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([company, value], i) => ({
      label: company,
      value,
      // Each account its own colour (Suren: "why is it all blue?").
      color: VIZ_SERIES[i % VIZ_SERIES.length],
      tip: myDeals
        .filter((d) => d.company === company && d.stage !== "Closed Lost")
        .map((d) => ({
          avatar: d.contactName,
          name: d.contactName,
          sub: d.stage,
          value: formatMoney(d.value),
        })),
    }));
  const topAccounts = rankedAccounts.slice(0, 5);
  const accountRecords: ChartRecord[] = rankedAccounts.map((account) => {
    const deal = myDeals.find(
      (candidate) =>
        candidate.company === account.label && candidate.stage !== "Closed Lost"
    );
    return {
      id: deal?.customerId || account.label,
      label: account.label,
      meta: deal ? `${deal.contactName} · ${deal.stage}` : "Open account",
      value: formatMoney(account.value),
      href: deal ? `/customers/${deal.customerId}` : undefined,
      logo: account.label,
    };
  });

  // Going quiet — the rep's open deals ranked by days since the last touch,
  // coloured by stage. The agent-lens partner to "biggest accounts": the left
  // chart says where the money is, this one says what needs a touch TODAY.
  const quietDeals = [...myDeals]
    .filter((d) => d.stage !== "Closed Lost")
    .sort((a, b) => b.staleDays - a.staleDays)
    .map((d) => ({
      label: d.company,
      value: d.staleDays,
      color: STAGE_COLOR[d.stage] || VIZ.blue,
      tip: [
        {
          avatar: d.contactName,
          name: d.contactName,
          sub: `${d.stage} · ${formatMoney(d.value)}`,
          value: ago(d.staleDays),
        },
      ],
    }));
  const goingQuiet = quietDeals.slice(0, 5);
  const quietRecords: ChartRecord[] = [...myDeals]
    .filter((deal) => deal.stage !== "Closed Lost")
    .sort((a, b) => b.staleDays - a.staleDays)
    .map((deal) => ({
      id: deal.sessionId,
      label: deal.company,
      meta: `${deal.contactName} · ${deal.stage}`,
      value: ago(deal.staleDays),
      href: `/customers/${deal.customerId}`,
      avatar: deal.contactName,
    }));

  const sortedDeals = [...myDeals].sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6 stagger">
      <BackButton fallback="/team" label="Back" />

      {/* Identity */}
      <div className="flex items-center gap-4">
        <Avatar name={name} className="w-16 h-16 text-[20px] shrink-0" />
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary flex items-center gap-2">
            {name}
            {isYou && (
              <span className="text-[11px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded bg-blue-light text-blue-primary">
                You
              </span>
            )}
          </h1>
          <p className="text-[13px] text-text-secondary mt-0.5">
            {title}{region ? ` · ${region}` : ""} · {me.deals} deal{me.deals === 1 ? "" : "s"} owned
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
            <a
              href={`mailto:${email}`}
              className="inline-flex items-center gap-1.5 text-text-secondary hover:text-blue-primary transition-colors"
            >
              <Mail size={13} strokeWidth={1.9} className="shrink-0" />
              {email}
            </a>
            {phone && (
              <a
                href={`tel:${phone.replace(/[^+\d]/g, "")}`}
                className="inline-flex items-center gap-1.5 text-text-secondary hover:text-blue-primary transition-colors tnum"
              >
                <PhoneCall size={13} strokeWidth={1.9} className="shrink-0" />
                {phone}
              </a>
            )}
            <a
              href={teamsChatUrl(name)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Message ${name.split(" ")[0]} on Teams`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-light px-2.5 py-1 text-[12px] font-semibold text-text-secondary hover:border-blue-subtle hover:bg-blue-light/40 transition-colors"
            >
              <TeamsIcon size={14} />
              Teams
            </a>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <StatTile key={t.label} icon={t.icon} label={t.label} value={t.value} sub={t.sub} />
        ))}
      </section>

      {/* Quota attainment + ranking */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-[15px] font-semibold text-text-primary">Quota attainment · FY26</h2>
            <span className="text-[12px] text-text-tertiary tnum">
              {formatMoney(wonFY)} won of {formatMoney(quota)}
            </span>
          </div>
          <div className="flex items-end gap-3 mb-2">
            <span className="text-[34px] font-bold leading-none tnum" style={{ color: attainColor }}>
              {attain}%
            </span>
            <span className="text-[12.5px] text-text-secondary mb-1">to quota</span>
          </div>
          <div className="h-2.5 rounded-full bg-surface overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(attain, 100)}%`, background: attainColor }} />
          </div>
          <p className="text-[12px] text-text-tertiary mt-3">
            {formatMoney(me.weighted)} weighted pipeline could add another{" "}
            {Math.round((me.weighted / quota) * 100)}% toward the number.
          </p>
        </Card>
        <Card className="flex flex-col justify-center">
          <span className="w-9 h-9 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center mb-3">
            <Trophy size={18} strokeWidth={1.9} />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            Floor ranking
          </p>
          <p className="text-[28px] font-bold text-text-primary leading-none tnum mt-1.5">
            #{rank}{" "}
            <span className="text-[15px] font-medium text-text-tertiary">of {ranked.length}</span>
          </p>
          <p className="text-[12px] text-text-tertiary mt-1.5">by open pipeline</p>
        </Card>
      </section>

      {/* Pipeline value by stage + deals by stage. Every chart card opens
          full-size on click with the complete breakdown listed, a card chart
          plus per-slice hovers was never enough to read the whole picture
          (Anir, Jul 25: "I need the ability to open all these graphs"). */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <ExpandableChartCard
          className="h-full flex flex-col"
          title="Pipeline value by stage"
          subtitle={`Where ${name.split(" ")[0]}'s open dollars sit.`}
          kind="bar"
          bar={{ data: valueByStage, format: "money" }}
          emptyText="No open pipeline."
          rows={valueByStage.map((s) => ({
            label: s.label,
            value: formatMoney(s.value),
            color: s.color,
            percent: me.openValue > 0 ? (s.value / me.openValue) * 100 : 0,
          }))}
        />
        <ExpandableChartCard
          className="h-full flex flex-col"
          title="Deals by stage"
          subtitle="How the book breaks down by count."
          kind="donut"
          donut={{
            segments: dealsByStage,
            centerLabel: String(me.openCount),
            centerSub: "open",
          }}
          legend={{ items: dealsByStage, total: me.openCount }}
          rows={dealsByStage.map((s) => ({
            label: s.label,
            value: `${s.value} deal${s.value === 1 ? "" : "s"}`,
            color: s.color,
            percent: me.openCount > 0 ? (s.value / me.openCount) * 100 : 0,
          }))}
        />
      </section>

      {/* Outcome mix + activity trend */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <ExpandableChartCard
          className="h-full flex flex-col"
          title="Outcome mix"
          subtitle={`How ${name.split(" ")[0]}'s logged touches have landed.`}
          kind="donut"
          donut={{
            segments: outcomes,
            centerLabel: String(totalTouches),
            centerSub: "touches",
          }}
          legend={{ items: outcomes, total: totalTouches }}
          rows={outcomes.map((o) => ({
            label: o.label,
            value: `${o.value} touch${o.value === 1 ? "" : "es"}`,
            color: o.color,
            percent: totalTouches > 0 ? (o.value / totalTouches) * 100 : 0,
            sub: o.tip?.map((t) => t.name).join(", "),
          }))}
        />
        <ExpandableChartCard
          className="h-full flex flex-col"
          title="Deals worked"
          subtitle="Weekly activity over the last 12 weeks."
          kind="area"
          area={{
            data: activity,
            format: "number",
            unit: "deals",
            xLabels: activity.map((_, i) =>
              i === activity.length - 1 ? "now" : `${activity.length - 1 - i}w ago`
            ),
            pointTips: activityTips,
          }}
          rows={activity
            .map((n, i) => ({
              label: i === activity.length - 1 ? "This week" : `${activity.length - 1 - i} weeks ago`,
              value: `${n} deal${n === 1 ? "" : "s"}`,
              percent: (n / Math.max(...activity)) * 100,
              sub: activityTips[i]?.map((t) => t.name).join(", "),
            }))
            .reverse()}
        />
      </section>

      {/* Biggest accounts + what's going cold — two agent questions side by
          side: where's the money, and what needs a touch today (Suren: "if you
          were a Freyr sales agent, what would you need to see?"). */}
      {topAccounts.length > 0 && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartInspector
            title="Biggest accounts"
            description="Where the open value is concentrated."
            records={accountRecords}
            searchPlaceholder="Find an account..."
            className="h-full"
            expandedChildren={
              <BarChart
                data={rankedAccounts.slice(0, 12)}
                height={390}
                format="money"
              />
            }
          >
            <BarChart data={topAccounts} height={150} format="money" />
          </ChartInspector>
          <ChartInspector
            title="Days since last touch"
            description="Days since the last touch. Tallest bar needs a call first."
            records={quietRecords}
            searchPlaceholder="Find an account or contact..."
            className="h-full"
            expandedChildren={
              <BarChart data={quietDeals.slice(0, 12)} height={390} unit="days" />
            }
          >
            <BarChart data={goingQuiet} height={150} unit="days" />
          </ChartInspector>
        </section>
      )}

      {/* Deals table — real reps only */}
      {sortedDeals.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 pt-4 pb-2.5">
            <h2 className="text-[15px] font-semibold text-text-primary">
              {name.split(" ")[0]}&apos;s deals
            </h2>
            <p className="text-[12px] text-text-tertiary">
              Every account they own, stage, likelihood, value and how fresh it is.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface border-b border-border-light">
                  {["Account", "Contact", "Stage", "Win %", "Value", "Weighted", "Last activity"].map((h) => (
                    <th key={h} className="px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {sortedDeals.map((d) => {
                  const prob = STAGE_PROBABILITY[d.stage] ?? 0;
                  const StageIcon = STAGE_ICON[d.stage];
                  return (
                    <tr key={d.sessionId} className="hover:bg-surface transition-colors group">
                      <td className="px-5 py-3">
                        <Link href={`/customers/${d.customerId}`} className="group/account flex items-center gap-2.5">
                          <CompanyLogo name={d.company} className="w-7 h-7 text-[10px]" />
                          <span className="text-[13px] font-semibold text-text-primary group-hover/account:text-blue-primary">
                            {d.company}
                          </span>
                          <SizeBadge tier={d.sizeTier} />
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-[13px] whitespace-nowrap">
                        {/* The account above already wears its logo; the person
                            in this cell was the one bare name in the row. */}
                        <Link
                          href={`/contacts/${d.contactId}`}
                          className="inline-flex items-center gap-2 whitespace-nowrap text-text-secondary hover:text-blue-primary"
                        >
                          <Avatar name={d.contactName} className="w-6 h-6 text-[9px]" />
                          {d.contactName}
                        </Link>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {/* Stage is a category: colour AND icon, never a bare dot. */}
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12.5px] font-semibold"
                          style={{ background: `${STAGE_COLOR[d.stage]}1F`, color: STAGE_COLOR[d.stage] }}
                        >
                          <StageIcon size={13} strokeWidth={2.1} className="shrink-0" />
                          {d.stage}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-text-secondary tnum whitespace-nowrap">{Math.round(prob * 100)}%</td>
                      <td className="px-5 py-3 text-[13px] font-semibold text-text-primary tnum whitespace-nowrap">{formatMoney(d.value)}</td>
                      <td className="px-5 py-3 text-[13px] text-text-secondary tnum whitespace-nowrap">{formatMoney(Math.round(d.value * prob))}</td>
                      <td className="px-5 py-3 text-[13px] text-text-tertiary tnum whitespace-nowrap">{ago(d.staleDays)}</td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/deals/${d.sessionId}`} className="inline-flex text-text-tertiary group-hover:text-blue-primary transition-colors" aria-label="Open deal">
                          <ArrowRight size={16} strokeWidth={1.5} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
