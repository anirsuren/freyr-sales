"use client";

import { useMemo, useState } from "react";
import { Crosshair, DollarSign, UserRound, DoorOpen } from "lucide-react";
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

export function TargetsTab({
  targets,
  memberNames = [],
  live,
}: {
  targets: TargetAccount[];
  memberNames?: string[];
  live: boolean;
}) {
  const [query, setQuery] = useState("");
  // MULTISELECT (Anir, Aug 18: "multiselect. wherever this applies") — pick
  // MPR and MDV together; an empty pick means everything.
  const [domains, setDomains] = useState<string[]>([]);
  const [tierPick, setTierPick] = useState<string[]>([]);

  const tiers = useMemo(
    () =>
      [...new Set(targets.map((t) => t.tier).filter(Boolean))].sort() as string[],
    [targets]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return targets.filter(
      (t) =>
        (domains.length === 0 || domains.includes(t.domain)) &&
        (tierPick.length === 0 || (t.tier != null && tierPick.includes(t.tier))) &&
        (!q ||
          t.name.toLowerCase().includes(q) ||
          (t.owner ?? "").toLowerCase().includes(q) ||
          (t.hq ?? "").toLowerCase().includes(q))
    );
  }, [targets, query, domains, tierPick]);

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
          sub="Connection of 1 or 2 — an intro exists"
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
                  <th className="w-[11%] px-2 py-2.5 text-right">Potential</th>
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
                          <span className="text-[11px] text-text-tertiary">—</span>
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
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right text-[12.5px] font-semibold text-text-primary tnum">
                        {t.potential ? (
                          money(t.potential)
                        ) : (
                          <span className="font-normal text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {t.quarter ? (
                          <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0058B0]">
                            {t.quarter}
                          </span>
                        ) : (
                          <span className="text-[11px] text-text-tertiary">—</span>
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
                              title="Degree of connection — 1 is a warm intro, 3 is cold"
                            >
                              {t.degreeOfConnection}
                            </span>
                          ) : (
                            <span className="text-[11px] text-text-tertiary">—</span>
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
    </div>
  );
}
