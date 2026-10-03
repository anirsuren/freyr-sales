"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BarChart3,
  Briefcase,
  FileSignature,
  Layers,
  Package,
  Newspaper,
  Target,
  UserPlus,
  Presentation,
} from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { readEntityFacts, type EntityFact } from "@/lib/agentEntityVisuals";
import { fileFormatIcon } from "./EntityFacts";
import { teammateHref } from "@/lib/entityHref";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";

/**
 * EVERY NAME THE ASSISTANT SAYS BECOMES A PILL.
 *
 * One implementation for the full chat page and the dock, because they drifted:
 * the dock had pills for customers and people, the chat page had none of its
 * own, and neither knew what an offering was.
 *
 * Anir, Aug 14: "It's like we would have the profile picture and then the name
 * for any person, and then it should do it here too... offerings, FDL
 * components, customers, team members, reports, everything."
 */

export type EntityKind =
  | "marketItem"
  | "trackedPerson"
  | "marketCompany"
  | "solution"
  | "company"
  | "contact"
  | "offering"
  | "component"
  | "person"
  | "report"
  | "material"
  | "deal"
  | "contract"
  | "lead"
  | "goal";

export type Entity = {
  name: string;
  id: string;
  kind: EntityKind;
  logoUrl?: string;
  subtitle?: string;
  details?: string[];
  description?: string;
  fileType?: string;
  subtitleFacts?: EntityFact[];
  facts?: EntityFact[];
};

/** Where a pill of each kind goes, and what it wears. */
const KIND: Record<
  EntityKind,
  {
    href: (id: string, name?: string) => string;
    mark: (name: string, logoUrl?: string) => ReactNode;
  }
> = {
  marketItem: { href: id=>id, mark:()=> <Newspaper size={13} strokeWidth={1.9} className="shrink-0" /> },
  trackedPerson: {
    href: (id) => id,
    mark: (name, photoUrl) => <Avatar name={name} src={photoUrl} className="w-4 h-4 text-[7px] shrink-0" />,
  },
  marketCompany: {
    href: (id) => `/market-intel/${encodeURIComponent(id)}`,
    mark: (name, logoUrl) => (
      <CompanyLogo
        name={name}
        src={logoUrl}
        className="w-4 h-4 text-[7px] shrink-0"
      />
    ),
  },
  solution: {
    href: (id) => `/solutioning/${encodeURIComponent(id)}`,
    mark: () => (
      <Presentation size={13} strokeWidth={1.9} className="shrink-0" />
    ),
  },
  company: {
    href: (id) => `/customers/${encodeURIComponent(id)}`,
    mark: (name, logoUrl) => (
      <CompanyLogo
        name={name}
        src={logoUrl}
        className="w-4 h-4 text-[7px] shrink-0"
      />
    ),
  },
  contact: {
    href: (id) => `/contacts/${encodeURIComponent(id)}`,
    mark: (name, photoUrl) => (
      <Avatar name={name} src={photoUrl} className="w-4 h-4 text-[7px] shrink-0" />
    ),
  },
  person: {
    href: (_id, name) => teammateHref(name) || "/team",
    mark: (name, photoUrl) => (
      <Avatar name={name} src={photoUrl} className="w-4 h-4 text-[7px] shrink-0" />
    ),
  },
  /**
   * A plain glyph, not the offering's own gradient tile (Anir, Sep 2: "can you
   * just remove these icons from all the offering names? They're not really
   * needed"). The pill keeps A mark, because he asked for one on every name
   * the assistant says (Aug 15), and it is now the same outline glyph the
   * component, report and deal pills wear.
   */
  offering: {
    href: (id) => `/offerings/${encodeURIComponent(id)}`,
    mark: () => <Package size={13} strokeWidth={1.9} className="shrink-0" />,
  },
  component: {
    href: (id) => `/components/${encodeURIComponent(id)}`,
    mark: () => <Layers size={13} strokeWidth={1.9} className="shrink-0" />,
  },
  report: {
    href: (id) => (id ? `/reports/${encodeURIComponent(id)}` : "/reports"),
    mark: () => <BarChart3 size={13} strokeWidth={1.9} className="shrink-0" />,
  },
  /**
   * A FILE OPENS THE FILE. The id is "offeringId:materialId", and `?material=`
   * is the same parameter the viewer's own share link uses, so clicking a
   * named video in an answer lands on it playing rather than on the offering
   * page with a tab to hunt through.
   */
  /* Opportunities have record detail pages. Contracts and leads currently
     use list pages; preserve their supported navigation. */
  deal: {
    href: (id) => `/opportunities/${encodeURIComponent(id)}`,
    mark: () => <Briefcase size={13} strokeWidth={1.9} className="shrink-0" />,
  },
  contract: {
    href: () => "/contracts",
    mark: () => (
      <FileSignature size={13} strokeWidth={1.9} className="shrink-0" />
    ),
  },
  lead: {
    href: () => "/leads",
    mark: () => <UserPlus size={13} strokeWidth={1.9} className="shrink-0" />,
  },
  goal: {
    href: (id) => `/performance/goal/${encodeURIComponent(id)}`,
    mark: () => <Target size={13} strokeWidth={1.9} className="shrink-0" />,
  },
  material: {
    href: (id) => {
      const [offeringId, materialId] = id.split(":");
      return materialId
        ? `/offerings/${encodeURIComponent(offeringId)}?tab=materials&material=${encodeURIComponent(materialId)}`
        : `/offerings/${encodeURIComponent(offeringId)}?tab=materials`;
    },
    mark: () => { const Icon = fileFormatIcon(); return <Icon size={13} strokeWidth={1.9} className="shrink-0" />; },
  },
};

/** Reuse the reply-pill destination for picker previews. External assets must
 * remain HTTPS links; opening a preview never changes mention selection. */
export function entityDestination(entity: Pick<Entity, "kind" | "id"> & Partial<Pick<Entity, "name">>): string | null {
  const href = KIND[entity.kind].href(entity.id, entity.name);
  if (entity.kind === "marketItem" || entity.kind === "trackedPerson") {
    try { return new URL(href).protocol === "https:" ? href : null; } catch { return null; }
  }
  return href;
}

/** The same record identity in replies, picker results and composed tags. */
function recordMark(entity: Entity, large = false): ReactNode {
  const size = large ? "w-8 h-8" : "w-4 h-4 text-[7px]";
  if (["person", "contact", "trackedPerson", "lead"].includes(entity.kind))
    return <Avatar name={entity.name} src={entity.logoUrl} className={`${size} shrink-0`} />;
  if (["company", "marketCompany"].includes(entity.kind))
    return <CompanyLogo name={entity.name} src={entity.logoUrl} className={`${size} shrink-0`} />;
  if (entity.kind === "material") {
    const format = entity.fileType || entity.facts?.find((fact) => fact.kind === "format")?.text;
    const Icon = fileFormatIcon(format);
    return <Icon size={large ? 20 : 13} strokeWidth={1.9} data-file-type={format || "FILE"} className="shrink-0" />;
  }
  return KIND[entity.kind].mark(entity.name, entity.logoUrl);
}
export function EntityMark({ entity, large = false }: { entity: Entity; large?: boolean }) {
  return <span className={large ? "w-8 h-8 flex items-center justify-center shrink-0 text-blue-primary [&_svg]:w-5 [&_svg]:h-5" : "inline-flex items-center shrink-0"}>{recordMark(entity, large)}</span>;
}

/**
 * Left margin only. A right margin looks fine in isolation and wrong in a
 * sentence: it pushes the following character away, so "…and Novartis." reads
 * as "…and Novartis ." Separation from the preceding word already comes from
 * the space in the text itself.
 */
const PILL =
  "inline-flex items-center gap-1 align-middle rounded-full bg-blue-light/70 " +
  "border border-blue-subtle/60 pl-1 pr-1.5 py-0.5 ml-0.5 font-semibold " +
  "text-blue-primary no-underline hover:bg-blue-light hover:border-blue-subtle " +
  "transition-colors";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A name alone cannot choose between two records. Keep those names as
 * prose; an explicit link in the answer can still name the intended page. */
export function unambiguousEntities(entities: Entity[]): Entity[] {
  const byName = new Map<string, Map<string, Entity>>();
  for (const entity of entities) {
    if (!entity.name?.trim()) continue;
    const matches = byName.get(entity.name) || new Map<string, Entity>();
    matches.set(`${entity.kind}:${entity.id}`, entity);
    byName.set(entity.name, matches);
  }
  return [...byName.values()]
    .map((matches) => {
      const records = [...matches.values()];
      if (records.length === 1) return records[0];

      // A company commonly appears in more than one index at once: as the
      // customer record, its Market Intel collection, and sometimes a lead.
      // Those are different destinations for the same organization, not an
      // ambiguous identity. Prefer the customer record when it exists so a
      // bare company mention always renders with its company logo and opens
      // the full account. If there is no customer, the Market Intel company
      // is the canonical company identity.
      const company = records.find((entity) => entity.kind === "company");
      if (company) return company;
      const marketCompany = records.find(
        (entity) => entity.kind === "marketCompany"
      );
      if (marketCompany) return marketCompany;
      return null;
    })
    .filter((entity): entity is Entity => entity !== null)
    .sort((a, b) => b.name.length - a.name.length);
}

/**
 * Rewrite a plain string so every known name becomes a pill.
 *
 * Matched longest-first so "Cortexa Biopharma" beats "Cortexa" and
 * "Freya.Register" is not cut down to "Freya". Case-sensitive.
 *
 * The trailing guard excludes word characters and hyphens but NOT the full
 * stop. Excluding "." looked right (it stops "Freya" matching inside
 * "Freya.Register") and was wrong: it also refuses any name that ends a
 * sentence, so "the numbers are in Portfolio Reports." rendered as grey text
 * while every mid-sentence name pilled. Prefix collisions are already handled
 * by sorting longest-first, since alternation is first-match-wins.
 */
/** A verified explicit destination in this answer can disambiguate its earlier plain mentions. */
export function entitiesForAnswer(text: string, entities: Entity[], context: string[] = []): Entity[] {
  const urls = new Set([...text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)].map(m => m[1]));
  const groups = new Map<string, Entity[]>();
  for (const entity of entities) {
    const name = entity.name.trim().toLocaleLowerCase();
    groups.set(name, [...(groups.get(name) || []), entity]);
  }
  return [...groups.values()].flatMap(group => {
    const explicit = group.filter(e => urls.has(KIND[e.kind].href(e.id, e.name)));
    // `/leads` identifies a list, not the organization named by the link.
    // Preserve a same-named company candidate so entityLink can render the
    // company logo and canonical account destination.
    if (explicit.some((entity) => entity.kind === "lead")) {
      const company =
        group.find((entity) => entity.kind === "company") ||
        group.find((entity) => entity.kind === "marketCompany");
      if (company) return [company, ...explicit];
    }
    const linked = explicit.length ? explicit : group.filter(e => context.includes(KIND[e.kind].href(e.id, e.name)));
    const destinations = new Set(linked.map(e => KIND[e.kind].href(e.id, e.name)));
    return destinations.size === 1 ? linked : group;
  });
}

// One answer uses the same immutable candidate array for every text/emphasis
// span. Build its name matcher once, rather than sorting the entire workspace
// and compiling a large regex for each span on every streamed update. Weak
// keys let old answers/indexes disappear when their React render is released.
const nameMatchers = new WeakMap<Entity[], { re: RegExp; byName: Map<string, Entity> } | null>();
function nameMatcher(entities: Entity[]) {
  if (nameMatchers.has(entities)) return nameMatchers.get(entities)!;
  const usable = unambiguousEntities(entities).filter(e =>
    !["component", "offering", "report", "material"].includes(e.kind) || /[\s.]/.test(e.name)
  );
  const matcher = usable.length ? {
    re: new RegExp(`\\b(${usable.map(e => escapeRe(e.name)).join("|")})(?![\\w-])`, "g"),
    byName: new Map(usable.map(e => [e.name, e])),
  } : null;
  nameMatchers.set(entities, matcher);
  return matcher;
}

export function injectEntities(
  text: string,
  entities: Entity[],
  keyBase: string,
  /** Offerings-only release has no customer or contact pages to link to. */
  linkable = true,
): ReactNode[] {
  if (!entities.length || !text) return [text];
  /**
   * EVERY NAME IS A PILL. ONLY THE LINK IS CONDITIONAL.
   *
   * This used to DROP every entity whose page the release did not ship, on
   * the grounds that there was nothing to link to. The effect was that in the
   * offerings-only build a person's name was plain grey text everywhere the
   * assistant said it, which is exactly what Anir kept reporting (Aug 15: "I
   * thought I told you... whenever it mentions a person's name or any sort of
   * asset like that, it should always have the icon... It's still not doing
   * what I asked").
   *
   * A pill is identity: the face, the colour, the shape. Navigation is a
   * bonus. So a name with no destination renders as the same pill without the
   * href, instead of not rendering as a pill at all.
   */
  // Single-word catalogue titles can also be ordinary words or another company's product.
  // Require an explicit entity link for those; do not infer identity from capitalization.
  const matcher = nameMatcher(entities);
  if (!matcher) return [text];

  /**
   * CASE-SENSITIVE ON PURPOSE (Anir, Aug 15: "that's not supposed to be
   * tagged, right?").
   *
   * Matching case-insensitively turned every ordinary use of a common word
   * into a product link: an asset named "Registrations" meant the sentence
   * "new sites typically mean new registrations and compliance work" pilled
   * the plain English word and sent the reader to an offering page.
   *
   * Product names are proper nouns and the agent writes them that way, so the
   * capital is the signal that a name is meant. "Freya.Register" still
   * matches; "registrations" in a sentence no longer does.
   */
  const { re, byName } = matcher;
  re.lastIndex = 0;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const hit = byName.get(m[1]);
    if (hit) {
      const style = KIND[hit.kind];
      // Offerings-only has no customer or contact pages; those pills stay
      // pills and simply do not navigate.
      const hasPage =
        linkable ||
        hit.kind === "offering" ||
        hit.kind === "component" ||
        hit.kind === "person" ||
        hit.kind === "report" ||
        hit.kind === "material" ||
        hit.kind === "deal" ||
        hit.kind === "contract" ||
        hit.kind === "lead" ||
        hit.kind === "goal" ||
        hit.kind === "marketCompany" ||
        hit.kind === "solution";
      out.push(
        hasPage ? (
          <Link
            key={`${keyBase}-e${k++}`}
            href={style.href(hit.id, hit.name)}
            {...(hit.kind === "trackedPerson" ? {target:"_blank", rel:"noopener noreferrer"} : {})}
            className={PILL}
          >
            {recordMark(hit)}
            {m[1]}
          </Link>
        ) : (
          <span key={`${keyBase}-e${k++}`} className={`${PILL} cursor-default`}>
            {recordMark(hit)}
            {m[1]}
          </span>
        ),
      );
    } else {
      out.push(m[1]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Explicit model links and automatically detected names share the same badge. */
export function entityLink(href: string, label: string, entities: Entity[], key: string): ReactNode | null {
  const normalizedLabel = label.trim().toLocaleLowerCase();
  // Lead records only have a shared list destination. When the assistant names
  // the company attached to that lead, keep the organization's identity and
  // destination: a company logo that opens the account. Treating the shared
  // `/leads` URL as the entity made every company wear the person-plus icon.
  if (href === "/leads") {
    const companies = entities.filter(
      (entity) =>
        ["company", "marketCompany"].includes(entity.kind) &&
        entity.name.trim().toLocaleLowerCase() === normalizedLabel,
    );
    const company =
      companies.find((entity) => entity.kind === "company") || companies[0];
    if (company) {
      const style = KIND[company.kind];
      return (
        <Link key={key} href={style.href(company.id)} className={PILL}>
          {recordMark(company)}
          {label}
        </Link>
      );
    }
  }
  const candidates = entities.filter(e => KIND[e.kind].href(e.id, e.name) === href || (e.kind === "person" && (href === "/team" || href === `/team?member=${encodeURIComponent(e.id)}`)));
  const named = candidates.filter(e => e.name.trim().toLocaleLowerCase() === normalizedLabel);
  // Shared list destinations do not identify a person or record. A Team link
  // stays a navigation link; a named teammate gets only their own portrait.
  const entity = named.length === 1 ? named[0] :
    candidates.length === 1 && !["person", "lead", "contract"].includes(candidates[0].kind)
      ? candidates[0] : undefined;
  if (!entity) {
    // The answer can arrive before the separate name index has loaded. An
    // explicit record URL still identifies the kind of thing being linked, so
    // show its identity mark immediately instead of flashing a plain blue link
    // in the compact chat (or leaving old saved answers that way indefinitely).
    const fallbackKind: EntityKind | null =
      /^\/customers\/[^/?#]+\/?$/.test(href) ? "company" :
      /^\/contacts\/[^/?#]+\/?$/.test(href) ? "contact" :
      /^\/offerings\/[^/?#]+\/?$/.test(href) ? "offering" :
      /^\/components\/[^/?#]+\/?$/.test(href) ? "component" :
      /^\/opportunities\/[^/?#]+\/?$/.test(href) ? "deal" :
      /^\/solutioning\/[^/?#]+\/?$/.test(href) ? "solution" :
      /^\/market-intel\/[^/?#]+\/?$/.test(href) ? "marketCompany" :
      /^\/reports(?:\/[^?#]*)?(?:\?[^#]*)?$/.test(href) ? "report" :
      // Short metric names stay out of automatic prose matching, but a direct
      // goal URL identifies the record and should still wear its target icon.
      /^\/performance\/goal\/[^/?#]+\/?$/.test(href) ? "goal" :
      (/^\/team\?member=[^&#]+/.test(href) || /^\/analytics\/reps\/[^/?#]+\/?$/.test(href)) ? "person" : null;
    if (!fallbackKind || !label.trim() || label.startsWith("/")) return null;
    return (
      <Link key={key} href={fallbackKind === "person" && href.startsWith("/team?") ? teammateHref(label) || href : href} className={PILL}>
        {KIND[fallbackKind].mark(label)}
        {label}
      </Link>
    );
  }
  const style = KIND[entity.kind];
  return <Link key={key} href={style.href(entity.id, entity.name)} {...((entity.kind === "trackedPerson" || entity.kind === "marketItem") ? {target:"_blank",rel:"noopener noreferrer"} : {})} className={PILL}>{recordMark(entity)}{label.startsWith('/') ? entity.name : label}</Link>;
}

/**
 * The name index, fetched once per mount.
 *
 * Sorted longest-name-first because `injectEntities` builds one alternation
 * regex and JavaScript alternation is first-match-wins, not longest-match.
 * Names of two characters or fewer are dropped: they turn ordinary words into
 * pills.
 */
export function useEntityIndexState(includeShortNames = false): { entities: Entity[]; ready: boolean } {
  const user = useCurrentUser();
  const identity = `${user.id}:${user.role}`;
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  useEffect(() => {
    setLoadedIdentity(null);
    setEntities([]);
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let attempts = 0;
    const load = () => fetch("/api/agent/entities", {signal: controller.signal, cache:"no-store"})
      .then((r) => {
        if (r.status === 401 || r.status === 403) { setLoadedIdentity(identity); alive = false; return null; }
        if (!r.ok) throw new Error("Entity index unavailable");
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        const take = (rows: unknown, kind: EntityKind): Entity[] =>
          (Array.isArray(rows) ? rows : [])
            .filter(
              (r) => typeof r?.name === "string" && typeof r?.id === "string",
            )
            .map((r) => ({
              name: r.name,
              subtitle: typeof r.subtitle === "string" ? r.subtitle : undefined,
              details: Array.isArray(r.details) ? r.details.filter((v: unknown): v is string => typeof v === "string" && Boolean(v.trim())).slice(0, 6) : undefined,
              description: typeof r.description === "string" ? r.description.slice(0, 180) : undefined,
              fileType: typeof r.fileType === "string" ? r.fileType : undefined,
              subtitleFacts: readEntityFacts(r.subtitleFacts),
              facts: readEntityFacts(r.facts),
              id: r.id,
              kind,
              logoUrl: typeof r.logoUrl === "string" ? r.logoUrl : undefined,
            }));
        const list = [
          ...take(d.companies, "company"),
          ...take(d.marketCompanies, "marketCompany"),
          ...take(d.marketItems, "marketItem"),
          ...take(d.trackedPeople, "trackedPerson"),
          ...take(d.solutioning, "solution"),
          ...take(d.contacts, "contact"),
          ...take(d.offerings, "offering"),
          ...take(d.components, "component"),
          ...take(d.materials, "material"),
          ...take(d.deals, "deal"),
          ...take(d.contracts, "contract"),
          ...take(d.leads, "lead"),
          ...take(d.goals, "goal"),
          ...take(d.people, "person"),
          ...take(d.reports, "report"),
        ].filter((e) => e.name && (includeShortNames || e.name.length > 2));
        const unique = [...new Map(list.map(entity=>[`${entity.kind}:${entity.id}`,entity])).values()];
        unique.sort((a, b) => b.name.length - a.name.length);
        setEntities(unique);
        setLoadedIdentity(identity);
      })
      .catch(() => {
        if (alive && attempts++ < 3) retry = setTimeout(load, 1000 * 2 ** attempts);
        else if (alive) setLoadedIdentity(identity);
      });
    void load();
    return () => {
      alive = false;
      controller.abort();
      if (retry) clearTimeout(retry);
    };
  }, [includeShortNames, identity]);
  return { entities: loadedIdentity === identity ? entities : [], ready: loadedIdentity === identity };
}

export function useEntityIndex(includeShortNames = false): Entity[] {
  return useEntityIndexState(includeShortNames).entities;
}
