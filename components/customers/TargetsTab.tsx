"use client";

import { useMemo, useState } from "react";
import { Building2, Crosshair, DollarSign, Plus, UserRound, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { PersonSelect } from "@/components/performance/bits";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { MultiColorSelect } from "@/components/ui/ColorSelect";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
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
  // MPR and MDV together; an empty pick means everything.
  const [domains, setDomains] = useState<string[]>([]);
  const [tierPick, setTierPick] = useState<string[]>([]);

  const tiers = useMemo(
    () =>
      [...new Set(list.map((t) => t.tier).filter(Boolean))].sort() as string[],
    [list]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter(
      (t) =>
        (domains.length === 0 || domains.includes(t.domain)) &&
        (tierPick.length === 0 || (t.tier != null && tierPick.includes(t.tier))) &&
        (!q ||
          t.name.toLowerCase().includes(q) ||
          (t.owner ?? "").toLowerCase().includes(q) ||
          (t.hq ?? "").toLowerCase().includes(q))
    );
  }, [list, query, domains, tierPick]);

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
          <PrioritySearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search targets, owners, countries…"
            ariaLabel="Search targets"
          />
          <MultiColorSelect
            values={domains}
            ariaLabel="Domain"
            onChange={setDomains}
            allLabel="All domains"
            options={TARGET_DOMAINS.map((d) => ({
              value: d,
              label: TARGET_DOMAIN_META[d].label,
              color: TARGET_DOMAIN_META[d].color,
              icon: TARGET_DOMAIN_META[d].icon,
            }))}
          />
          <MultiColorSelect
            values={tierPick}
            ariaLabel="Tier"
            onChange={setTierPick}
            allLabel="All tiers"
            options={tiers.map((t) => ({ value: t, label: t, color: tierColor(t) }))}
          />
          {live && canEdit && (
            <Button className="ml-auto shrink-0" onClick={() => setAdding(true)}>
              <Plus size={14} strokeWidth={2.2} /> Add target
            </Button>
          )}
          {!live && (
            <span className="ml-auto rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11px] font-semibold text-blue-primary">
              Sample targets — switch to Real mode for the live list
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
            <table className="w-full min-w-[880px] table-fixed border-collapse text-left">
              <thead>
                <tr className="border-b border-border-light text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  <th className="w-[26%] px-4 py-2.5">Company</th>
                  <th className="w-[15%] px-2 py-2.5">Domain</th>
                  <th className="w-[9%] px-2 py-2.5">Tier</th>
                  <th className="w-[17%] px-2 py-2.5">Owner</th>
                  <th className="w-[11%] px-2 py-2.5">HQ</th>
                  <th className="w-[11%] px-2 py-2.5">Potential</th>
                  <th className={cn("px-2 py-2.5", showConnection ? "w-[7%]" : "w-[11%]")}>
                    Quarter
                  </th>
                  {showConnection && (
                    <th className="w-[8%] px-2 py-2.5 pr-4">Connection</th>
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
                          <span className="text-[11px] text-text-tertiary">, </span>
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
                          <span className="text-text-tertiary">, </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-[12.5px] font-semibold text-text-primary tnum">
                        {t.potential ? (
                          money(t.potential)
                        ) : (
                          <span className="font-normal text-text-tertiary">, </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {t.quarter ? (
                          <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0058B0]">
                            {t.quarter}
                          </span>
                        ) : (
                          <span className="text-[11px] text-text-tertiary">, </span>
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
                            <span className="text-[11px] text-text-tertiary">, </span>
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

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a target"
        size="wide"
      >
        <div className="space-y-4">
          {/* SECTIONED, NOT STUFFED (Anir, Aug 18: "you can't just do two
              columns and stuff them all in there. Maybe you have a section
              and then another section and then notes"). First who they are,
              then how we chase them, then notes. */}
          <div className="rounded-xl border border-border-light bg-white px-3.5 py-3.5">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
                <Building2 size={13} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="text-[12.5px] font-bold text-text-primary">
                Who they are
              </span>
              <span className="h-px min-w-4 flex-1 bg-border-light" aria-hidden />
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
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
                <input
                  value={draft.hq}
                  onChange={(e) => set({ hq: e.target.value })}
                  placeholder="e.g. Germany"
                  className="h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-primary"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-[12px] font-semibold text-text-primary">
                  Company revenue
                </label>
                <input
                  value={draft.companyRevenue}
                  onChange={(e) => set({ companyRevenue: e.target.value })}
                  placeholder={'e.g. ~$3B'}
                  className="h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-primary"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[rgba(0,113,227,0.16)] bg-[rgba(0,113,227,0.03)] px-3.5 py-3.5">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
                <Crosshair size={13} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="text-[12.5px] font-bold text-text-primary">
                The pursuit
              </span>
              <span className="h-px min-w-4 flex-1 bg-[rgba(0,113,227,0.14)]" aria-hidden />
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
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
              <div className="min-w-0 sm:col-span-2">
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
