"use client";

import { useMemo, useState } from "react";
import { Building2, CalendarDays, ChevronDown, Crosshair, DollarSign, Plus, UserRound, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { countryOptions } from "@/lib/countries";
import { PersonSelect } from "@/components/performance/bits";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { PrioritySearchInput } from "@/components/ui/SearchPriority";
import { cn } from "@/lib/utils";
import {
  TARGET_DOMAIN_META,
  TARGET_DOMAINS,
  tierColor,
  type TargetAccount,
} from "@/lib/targetsShared";

/**
 * THE TARGET LIST — companies to go win, one step before Opportunities.
 *
 * Suren's three target sheets (MPR / MDV / CON) as one worked list: who we
 * are hunting, which domain, how big, who owns the pursuit, what it could be
 * worth and when. Struck-off sheet rows (dropped targets) never made it in.
 */

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}


/** THE COUNTRY'S FLAG BESIDE ITS NAME (Anir, Aug 18: "put flags too").
 *  Keys cover the sheet's data as written — US states and the sheet's own
 *  "Finalnd" typo resolve to their country; a value with no clear country
 *  ("Oct") gets no flag rather than a guess. */
const HQ_FLAGS: Record<string, string> = {
  bangladesh: "🇧🇩", belgium: "🇧🇪", brazil: "🇧🇷", canada: "🇨🇦",
  china: "🇨🇳", denmark: "🇩🇰", finland: "🇫🇮", finalnd: "🇫🇮",
  france: "🇫🇷", germany: "🇩🇪", greece: "🇬🇷", india: "🇮🇳",
  ireland: "🇮🇪", italy: "🇮🇹", japan: "🇯🇵", luxembourg: "🇱🇺",
  mexico: "🇲🇽", netherlands: "🇳🇱", "south korea": "🇰🇷", spain: "🇪🇸",
  sweden: "🇸🇪", switzerland: "🇨🇭", turkey: "🇹🇷", uae: "🇦🇪",
  uk: "🇬🇧", usa: "🇺🇸", "united states": "🇺🇸", "united kingdom": "🇬🇧",
  california: "🇺🇸", minnesota: "🇺🇸", "new jersey": "🇺🇸",
};

function hqFlag(hq: string | undefined): string | null {
  if (!hq) return null;
  return HQ_FLAGS[hq.trim().toLowerCase().replace(/\s+/g, " ")] ?? null;
}

/** "250000" reads as "250,000" while you type; stored bare. */
function withCommas(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const BLANK_TARGET = {
  name: "",
  domain: "MPR",
  hq: "",
  tier: "",
  owner: "",
  potential: "",
  quarter: "",
  degreeOfConnection: "",
  companyRevenue: "",
  notes: "",
};


/**
 * REVENUE, AS A BAND (Anir, Aug 28: "I would make these two in dropdowns").
 *
 * What a rep knows about a prospect is its order of magnitude, not its filing.
 * Typed free, the same company arrived as "~$3B", "3 billion" and "$3,000M",
 * and none of the three could be sorted or grouped against the others.
 */
const REVENUE_BANDS = [
  "Under $100M",
  "$100M - $500M",
  "$500M - $1B",
  "$1B - $5B",
  "$5B - $20B",
  "Over $20B",
];

export function TargetsTab({
  targets,
  memberNames = [],
  live,
  canEdit = false,
}: {
  targets: TargetAccount[];
  memberNames?: string[];
  live: boolean;
  /** Managers and admins add targets — the same line the server draws. */
  canEdit?: boolean;
}) {
  const { toast } = useToast();
  /** The list is live state: adding a target shows it without a reload. */
  const [list, setList] = useState<TargetAccount[]>(targets);
  const [adding, setAdding] = useState(false);
  /* Both sections of the add form, open on arrival. */
  const [openWho, setOpenWho] = useState(true);
  const [openPursuit, setOpenPursuit] = useState(true);
  const [draft, setDraft] = useState({ ...BLANK_TARGET });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof BLANK_TARGET>) =>
    setDraft((d) => ({ ...d, ...patch }));

  async function saveTarget() {
    setBusy(true);
    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "add",
          name: draft.name.trim(),
          domain: draft.domain,
          hq: draft.hq.trim() || undefined,
          tier: draft.tier || undefined,
          owner: draft.owner.trim() || undefined,
          potential: draft.potential ? Number(draft.potential) : undefined,
          quarter: draft.quarter || undefined,
          degreeOfConnection: draft.degreeOfConnection || undefined,
          companyRevenue: draft.companyRevenue.trim() || undefined,
          notes: draft.notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't save.");
      setList(data.state.targets);
      setAdding(false);
      setDraft({ ...BLANK_TARGET });
      toast(`${draft.name.trim()} is on the target list.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "That didn't save.", "error");
    } finally {
      setBusy(false);
    }
  }

  const [query, setQuery] = useState("");
  // MULTISELECT (Anir, Aug 18: "multiselect. wherever this applies") — pick
  // MPR and MDV together; an empty pick means everything. Quarter, country,
  // connection and owner joined Aug 19 ("you should probably have more
  // filters there").
  const [domains, setDomains] = useState<string[]>([]);
  const [tierPick, setTierPick] = useState<string[]>([]);
  const [quarterPick, setQuarterPick] = useState<string[]>([]);
  const [hqPick, setHqPick] = useState<string[]>([]);
  const [connectionPick, setConnectionPick] = useState<string[]>([]);
  const [ownerPick, setOwnerPick] = useState<string[]>([]);

  const tiers = useMemo(
    () =>
      [...new Set(list.map((t) => t.tier).filter(Boolean))].sort() as string[],
    [list]
  );
  const quarters = useMemo(
    () => [...new Set(list.map((t) => t.quarter).filter(Boolean))].sort() as string[],
    [list]
  );
  const hqs = useMemo(
    () => [...new Set(list.map((t) => t.hq).filter(Boolean))].sort() as string[],
    [list]
  );
  const connections = useMemo(
    () =>
      [...new Set(list.map((t) => t.degreeOfConnection).filter(Boolean))].sort() as string[],
    [list]
  );
  const owners = useMemo(
    () => [...new Set(list.map((t) => t.owner).filter(Boolean))].sort() as string[],
    [list]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter(
      (t) =>
        (domains.length === 0 || domains.includes(t.domain)) &&
        (tierPick.length === 0 || (t.tier != null && tierPick.includes(t.tier))) &&
        (quarterPick.length === 0 ||
          (t.quarter != null && quarterPick.includes(t.quarter))) &&
        (hqPick.length === 0 || (t.hq != null && hqPick.includes(t.hq))) &&
        (connectionPick.length === 0 ||
          (t.degreeOfConnection != null &&
            connectionPick.includes(t.degreeOfConnection))) &&
        (ownerPick.length === 0 || (t.owner != null && ownerPick.includes(t.owner))) &&
        (!q ||
          t.name.toLowerCase().includes(q) ||
          (t.owner ?? "").toLowerCase().includes(q) ||
          (t.hq ?? "").toLowerCase().includes(q))
    );
  }, [list, query, domains, tierPick, quarterPick, hqPick, connectionPick, ownerPick]);

  const potential = shown.reduce((s, t) => s + (t.potential ?? 0), 0);
  const memberSet = new Set(memberNames.map((n) => n.trim().toLowerCase()));
  const inApp = (name: string) => memberSet.has(name.trim().toLowerCase());
  // Only an app member counts as an owner — sheet names wait for their
  // accounts (Anir, Aug 17).
  const owned = shown.filter((t) => t.owner && inApp(t.owner)).length;
  // A CON door at connection 1 or 2 is a warm intro waiting to be used.
  const warm = shown.filter(
    (t) => t.degreeOfConnection && /^[12]/.test(t.degreeOfConnection)
  ).length;

  const showConnection = shown.some((t) => t.degreeOfConnection);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Crosshair}
          label="Target accounts"
          value={String(shown.length)}
          sub="Not customers yet, no deal yet"
        />
        <StatTile
          icon={DollarSign}
          label="Estimated potential"
          value={money(potential)}
          sub="The sheet's own estimates, in USD"
        />
        <StatTile
          icon={UserRound}
          label="With an owner"
          value={`${owned} of ${shown.length}`}
          sub="Someone at Freyr is on it"
        />
        <StatTile
          icon={DoorOpen}
          label="Warm doors"
          value={String(warm)}
          sub="Connection of 1 or 2. An intro exists"
        />
      </div>

      <Card className="mt-4 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border-light px-4 py-3">
          {/* THE SEARCH TAKES THE ROOM THAT IS LEFT (Anir, Aug 20: "why is
              the search bar and filters messed up now"). It sat at a fixed
              stub width, so when the filter pills grew — they each gained an
              icon on Aug 19 — the row wrapped and left a search box you could
              not read your own query in, with Add target stranded on a line of
              its own. Same `grow` + `flex-1` the Customers and Opportunities
              bars already use. */}
          <PrioritySearchInput
            grow
            className="min-w-[200px] flex-1"
            value={query}
            onChange={setQuery}
            placeholder="Search targets, owners, countries…"
            ariaLabel="Search targets"
            iconSize={16}
            iconClassName="left-3"
            inputClassName="h-10 w-full rounded-lg border border-border-light bg-white pl-9 pr-3 text-[13px] text-text-primary transition-shadow focus:border-blue-subtle focus:shadow-input-focus focus:outline-none"
          />
          {/* ONE FILTER BUTTON, LIKE EVERY OTHER LIST PAGE (Anir, Aug 24:
              "I'm assuming you're gonna need the filters here too on the
              customers targets page. Just do the same thing everywhere, keep
              it consistent").

              Six permanently-open dropdowns wrapped onto a second line and
              pushed Add target down with them, and they were on screen whether
              or not anybody was filtering — the exact complaint that produced
              the two-layer Filter menu on Offerings in the first place. Same
              component, same two panes, same footer count. */}
          <FilterMenu
            onClearAll={() => {
              setDomains([]);
              setTierPick([]);
              setQuarterPick([]);
              setConnectionPick([]);
              setHqPick([]);
              setOwnerPick([]);
            }}
            groups={[
              {
                key: "domain",
                label: "Domain",
                values: domains,
                onChange: setDomains,
                options: TARGET_DOMAINS.map((d) => ({
                  value: d,
                  label: TARGET_DOMAIN_META[d].label,
                  color: TARGET_DOMAIN_META[d].color,
                })),
              },
              {
                key: "tier",
                label: "Tier",
                values: tierPick,
                onChange: setTierPick,
                options: tiers.map((t) => ({ value: t, label: t, color: tierColor(t) })),
              },
              ...(quarters.length
                ? [
                    {
                      key: "quarter",
                      label: "Quarter",
                      values: quarterPick,
                      onChange: setQuarterPick,
                      options: quarters.map((q) => ({
                        value: q,
                        label: q,
                        color: "#0071E3",
                      })),
                    },
                  ]
                : []),
              ...(connections.length
                ? [
                    {
                      key: "connection",
                      label: "Connection",
                      values: connectionPick,
                      onChange: setConnectionPick,
                      options: connections.map((c) => ({
                        value: c,
                        label: c,
                        color: "#0F9E8E",
                      })),
                    },
                  ]
                : []),
              ...(hqs.length
                ? [
                    {
                      key: "hq",
                      label: "Country",
                      values: hqPick,
                      onChange: setHqPick,
                      options: hqs.map((h) => ({
                        value: h,
                        label: hqFlag(h) ? `${hqFlag(h)} ${h}` : h,
                        color: "#5E5CE6",
                      })),
                    },
                  ]
                : []),
              ...(owners.length
                ? [
                    {
                      key: "owner",
                      label: "Owner",
                      values: ownerPick,
                      onChange: setOwnerPick,
                      options: owners.map((o) => ({
                        value: o,
                        label: o,
                        avatarName: o,
                      })),
                    },
                  ]
                : []),
            ]}
          />
          {live && canEdit && (
            <Button className="ml-auto shrink-0" onClick={() => setAdding(true)}>
              <Plus size={14} strokeWidth={2.2} /> Add target
            </Button>
          )}
          {!live && (
            <span className="ml-auto rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11px] font-semibold text-blue-primary">
              Sample targets. Switch to Real mode for the live list
            </span>
          )}
        </div>

        {shown.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState
              icon={Crosshair}
              title="No targets match"
              description="Loosen the domain or tier filter, or clear the search."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* WIDER floor than the card, so tight screens scroll sideways
                instead of crushing the right-hand columns (Anir, Aug 19:
                "that connection column is really close… maybe just make it
                scrollable"). Domain gave up width; it never needed it. */}
            <table className="w-full min-w-[1080px] table-fixed border-collapse text-left">
              <thead>
                <tr className="border-b border-border-light text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  <th className="w-[24%] px-4 py-2.5">Company</th>
                  <th className="w-[12%] px-2 py-2.5">Domain</th>
                  <th className="w-[8%] px-2 py-2.5">Tier</th>
                  <th className="w-[15%] px-2 py-2.5">Owner</th>
                  <th className="w-[11%] px-2 py-2.5">HQ</th>
                  <th className="w-[10%] px-2 py-2.5">Potential</th>
                  <th className={cn("px-2 py-2.5", showConnection ? "w-[9%]" : "w-[20%]")}>
                    Quarter
                  </th>
                  {showConnection && (
                    <th className="w-[11%] px-2 py-2.5 pr-4">Connection</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {shown.map((t) => {
                  const d = TARGET_DOMAIN_META[t.domain];
                  return (
                    <tr key={t.id} className="transition-colors hover:bg-surface/60">
                      <td className="px-4 py-2.5">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <CompanyLogo name={t.name} className="h-7 w-7 shrink-0 text-[9px]" />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-text-primary">
                              {t.name}
                            </span>
                            {t.companyRevenue && (
                              <span className="block text-[11px] text-text-tertiary tnum">
                                {t.companyRevenue.includes("$")
                                  ? t.companyRevenue
                                  : t.companyRevenue.replace(/^(~?)\s*/, "$1$$")}{" "}
                                revenue
                              </span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                          style={{ background: `${d.color}14`, color: d.color }}
                        >
                          <d.icon size={10.5} strokeWidth={2.5} aria-hidden="true" />
                          {t.domain}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        {t.tier ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={{
                              background: `${tierColor(t.tier)}14`,
                              color: tierColor(t.tier),
                            }}
                          >
                            {t.tier}
                          </span>
                        ) : (
                          <span className="text-[11px] text-text-tertiary">·</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {t.owner && inApp(t.owner) ? (
                          <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-text-primary">
                            <Avatar name={t.owner} className="h-5 w-5 shrink-0 text-[7px]" />
                            <span className="truncate">{t.owner}</span>
                          </span>
                        ) : (
                          /* Not an app member = no owner, full stop (Anir,
                             Aug 17: "if these people don't exist, just say
                             there's no owner — when they make accounts they
                             will get assigned by one of us"). The sheet's
                             name survives only on hover, for the day they
                             join. */
                          <span
                            className="text-[11.5px] text-text-tertiary"
                            title={t.owner ? `The sheet names ${t.owner}, who is not in the app yet` : undefined}
                          >
                            No owner yet
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-[12.5px] text-text-secondary">
                        {t.hq ? (
                          <span className="inline-flex items-center gap-1.5">
                            {hqFlag(t.hq) && (
                              <span aria-hidden="true">{hqFlag(t.hq)}</span>
                            )}
                            {t.hq}
                          </span>
                        ) : (
                          <span className="text-text-tertiary">·</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-[12.5px] font-semibold text-text-primary tnum">
                        {t.potential ? (
                          money(t.potential)
                        ) : (
                          <span className="font-normal text-text-tertiary">·</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {t.quarter ? (
                          <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0058B0]">
                            {t.quarter}
                          </span>
                        ) : (
                          <span className="text-[11px] text-text-tertiary">·</span>
                        )}
                      </td>
                      {showConnection && (
                        <td className="px-2 py-2.5 pr-4">
                          {t.degreeOfConnection ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                              style={{
                                background: /^[1]/.test(t.degreeOfConnection)
                                  ? "rgba(15,118,110,0.10)"
                                  : /^2/.test(t.degreeOfConnection)
                                    ? "rgba(0,113,227,0.10)"
                                    : "rgba(142,152,168,0.14)",
                                color: /^[1]/.test(t.degreeOfConnection)
                                  ? "#0F766E"
                                  : /^2/.test(t.degreeOfConnection)
                                    ? "#0058B0"
                                    : "#59616E",
                              }}
                              title="Degree of connection. 1 is a warm intro, 3 is cold"
                            >
                              {t.degreeOfConnection}
                            </span>
                          ) : (
                            <span className="text-[11px] text-text-tertiary">·</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* A PROPER POP-UP, NOT A COLUMN (Anir, Aug 28: "can you make this a
          proper pop-up size? I don't know why it's so skinny"). "wide" is
          640px, which is the size for a form that is one stack of fields —
          this one is three sections of two-up fields, so every pair was
          squeezed into 280px each and the whole thing read as a tall ribbon.
          "workflow" is 980px, the size the app already gives a multi-section
          form. */}
      {/* ONE SIZE, ALWAYS — AND THIS IS A HARD RULE (Anir, Aug 20: "the size
          should stay the same, you could literally make it a proper pop-up,
          whatever the normal size is, and it doesn't change"; again Aug 28:
          "why are you fucking moving the dimensions of the pop-up? It has to
          be a hard rule. You keep making this mistake").

          The moment the sections could fold, the dialog sized to its content
          again: shut one and the frame shrank and re-centred under the cursor,
          shut both and it collapsed to a strip. A pinned height is what makes
          folding a section change what is IN the dialog rather than move the
          dialog. Anything taller than the frame scrolls inside it.

          Any new dialog in this app gets this treatment, not just the ones he
          has caught. */}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a target"
        size="workflow"
        tall
        dialogClassName="!h-[min(745px,calc(100vh-3rem))]"
      >
        <div className="space-y-3">
          {/* SECTIONED, NOT STUFFED (Anir, Aug 18: "you can't just do two
              columns and stuff them all in there. Maybe you have a section
              and then another section and then notes"). First who they are,
              then how we chase them, then notes. */}
          {/* BOTH SECTIONS FOLD (Anir, Aug 28: "I literally said who they are
              and the pursuit should both be collapsible drop-downs"). The
              headers were labels; now they are the control, with the same
              .freyr-fold the rest of the app uses so a section rolls up
              instead of vanishing. Open on arrival — this is a form somebody
              came here to fill in — and closing one is how you get the other
              in front of you. */}
          <div className="rounded-xl border border-border-light bg-white px-3.5 py-2">
            {/* THE HEADER IS A ROW, NOT A BAND (Anir, Aug 28: "why are they so
                thick?"). The card kept 14px of padding top and bottom and the
                header kept a 12px bottom margin whether or not anything was
                under it, so a shut section was a 24px title floating in 40px
                of air. The margin moved onto the fold's own content, where it
                only exists while the fold is open. */}
            <button
              type="button"
              aria-expanded={openWho}
              onClick={() => setOpenWho((v) => !v)}
              className="flex w-full cursor-pointer items-center gap-2 text-left"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
                <Building2 size={13} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="text-[12.5px] font-bold text-text-primary">
                Who they are
              </span>
              <span className="h-px min-w-4 flex-1 bg-border-light" aria-hidden />
              <ChevronDown
                size={15}
                strokeWidth={2.2}
                aria-hidden="true"
                className={cn(
                  "shrink-0 text-text-tertiary transition-transform duration-200",
                  !openWho && "-rotate-90"
                )}
              />
            </button>
            <div className="freyr-fold" data-open={openWho ? "true" : "false"}>
            <div className="grid gap-3.5 pt-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label className="mb-1 block text-[12px] font-semibold text-text-primary">
                  Company
                </label>
                <input
                  autoFocus
                  value={draft.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="e.g. Boehringer Ingelheim"
                  className="h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-primary"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-[12px] font-semibold text-text-primary">
                  Domain
                </label>
                <ColorSelect
                  value={draft.domain}
                  ariaLabel="Target domain"
                  collapsible={false}
                  className="w-full"
                  onChange={(v) => set({ domain: v })}
                  options={TARGET_DOMAINS.map((d) => ({
                    value: d,
                    label: TARGET_DOMAIN_META[d].label,
                    color: TARGET_DOMAIN_META[d].color,
                    icon: TARGET_DOMAIN_META[d].icon,
                  }))}
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-[12px] font-semibold text-text-primary">
                  HQ country
                </label>
                {/* THE COUNTRY LIST THE APP ALREADY HAS (Anir, Aug 28: "I
                    would make these two in dropdowns"). Typed free, "Germany",
                    "germany" and "DE" were three countries as far as any
                    filter was concerned. Searchable, because fifty-five
                    countries is a scroll, and a value already on the record
                    that is not on the list is kept rather than silently
                    dropped when somebody opens the form. */}
                <ColorSelect
                  value={draft.hq}
                  ariaLabel="HQ country"
                  collapsible={false}
                  searchable
                  className="w-full"
                  onChange={(v) => set({ hq: v })}
                  options={[
                    { value: "", label: "Not known yet", color: "#C7CDD6" },
                    ...countryOptions(),
                    ...(draft.hq &&
                    !countryOptions().some((c) => c.value === draft.hq)
                      ? [{ value: draft.hq, label: draft.hq, noMark: true as const }]
                      : []),
                  ]}
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-[12px] font-semibold text-text-primary">
                  Company revenue
                </label>
                {/* A BAND, NOT A FIGURE. Nobody knows a prospect's revenue to
                    the dollar, and "~$3B", "3 billion" and "$3,000M" were the
                    same company three ways. Bands sort and group; an existing
                    typed value is kept as its own option so opening this form
                    on an old row cannot erase what somebody wrote. */}
                <ColorSelect
                  value={draft.companyRevenue}
                  ariaLabel="Company revenue"
                  collapsible={false}
                  className="w-full"
                  onChange={(v) => set({ companyRevenue: v })}
                  options={[
                    { value: "", label: "Not known yet", color: "#C7CDD6" },
                    ...REVENUE_BANDS.map((b) => ({
                      value: b,
                      label: b,
                      noMark: true as const,
                    })),
                    ...(draft.companyRevenue &&
                    !REVENUE_BANDS.includes(draft.companyRevenue)
                      ? [
                          {
                            value: draft.companyRevenue,
                            label: draft.companyRevenue,
                            noMark: true as const,
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            </div>
            </div>
          </div>

          {/* NO BLUE BOX, AND NOT THICK (Anir, Aug 30: "fix this dropdown, it
              looks so thick. I don't know why this is blue and that's white,
              it just looks odd").

              Every other section of this form is plain on white; this one sat
              in a tinted, bordered card, so a fold read as a different KIND of
              thing from its neighbours. And the fold's own child carried the
              open-state padding, which a grid-rows fold cannot collapse — 12px
              of blue air under a closed header, which is the thickness he was
              looking at. Same fix as the sent-email log: wrap first, pad
              inside. */}
          <div className="border-t border-border-light pt-3">
            <button
              type="button"
              aria-expanded={openPursuit}
              onClick={() => setOpenPursuit((v) => !v)}
              className="flex w-full cursor-pointer items-center gap-2 text-left"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
                <Crosshair size={13} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="text-[12.5px] font-bold text-text-primary">
                The pursuit
              </span>
              <span className="h-px min-w-4 flex-1 bg-border-light" aria-hidden />
              <ChevronDown
                size={15}
                strokeWidth={2.2}
                aria-hidden="true"
                className={cn(
                  "shrink-0 text-text-tertiary transition-transform duration-200",
                  !openPursuit && "-rotate-90"
                )}
              />
            </button>
            <div className="freyr-fold" data-open={openPursuit ? "true" : "false"}>
            <div>
            <div className="grid gap-3.5 pt-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label className="mb-1 block text-[12px] font-semibold text-text-primary">
                  Owner
                </label>
                <PersonSelect
                  value={draft.owner}
                  onChange={(v) => set({ owner: v })}
                  people={memberNames}
                  placeholder="No owner yet…"
                  allowFree={false}
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-[12px] font-semibold text-text-primary">
                  Tier
                </label>
                <ColorSelect
                  value={draft.tier}
                  ariaLabel="Tier"
                  collapsible={false}
                  className="w-full"
                  onChange={(v) => set({ tier: v })}
                  options={[
                    { value: "", label: "No tier yet", color: "#C7CDD6" },
                    ...[...new Set(["Tier 1", "Tier 2", "Tier 3", ...tiers])].map(
                      (t) => ({ value: t, label: t, color: tierColor(t) })
                    ),
                  ]}
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-[12px] font-semibold text-text-primary">
                  Target quarter
                </label>
                <ColorSelect
                  value={draft.quarter}
                  ariaLabel="Target quarter"
                  collapsible={false}
                  className="w-full"
                  onChange={(v) => set({ quarter: v })}
                  options={[
                    { value: "", label: "Not planned yet", color: "#C7CDD6" },
                    ...["Q1", "Q2", "Q3", "Q4"].map((q) => ({
                      value: q,
                      label: q,
                      color: "#0071E3",
                      icon: CalendarDays,
                    })),
                  ]}
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-[12px] font-semibold text-text-primary">
                  Connection
                </label>
                <ColorSelect
                  value={draft.degreeOfConnection}
                  ariaLabel="Degree of connection"
                  collapsible={false}
                  className="w-full"
                  onChange={(v) => set({ degreeOfConnection: v })}
                  options={[
                    { value: "", label: "No intro yet", color: "#C7CDD6" },
                    { value: "1", label: "1, direct contact", color: "#0F766E" },
                    { value: "2", label: "2, a warm intro exists", color: "#0071E3" },
                    { value: "3", label: "3, cold", color: "#8E98A8" },
                  ]}
                />
              </div>
              {/* IN THE GRID, NOT ACROSS IT. Spanning both columns cost the
                  form a whole extra row for one number — which is height the
                  fixed frame then has to carry (Anir, Aug 28: "it's so
                  height-wise thick"). */}
              <div className="min-w-0">
                <label className="mb-1 block text-[12px] font-semibold text-text-primary">
                  Estimated potential (USD)
                </label>
                <input
                  value={withCommas(draft.potential)}
                  onChange={(e) =>
                    set({ potential: e.target.value.replace(/[^0-9]/g, "") })
                  }
                  inputMode="numeric"
                  placeholder="e.g. 250,000"
                  className="h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-primary tnum"
                />
              </div>
            </div>
            </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-semibold text-text-primary">
              Notes <span className="font-normal text-text-tertiary">optional</span>
            </label>
            <textarea
              value={draft.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={2}
              placeholder="e.g. Met their RA director at DIA; wants a GRI demo in October."
              className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] outline-none focus:border-blue-primary"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!draft.name.trim()}
              onClick={() => void saveTarget()}
            >
              <Plus size={14} strokeWidth={2.2} /> Add target
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
