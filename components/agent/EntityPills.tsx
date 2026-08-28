"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BarChart3,
  Briefcase,
  FileSignature,
  Layers,
  Paperclip,
  Target,
  UserPlus,
} from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { OfferingIcon } from "@/components/ui/OfferingIcon";

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

export type Entity = { name: string; id: string; kind: EntityKind };

/** Where a pill of each kind goes, and what it wears. */
const KIND: Record<
  EntityKind,
  { href: (id: string) => string; mark: (name: string) => ReactNode }
> = {
  company: {
    href: (id) => `/customers/${id}`,
    mark: (name) => <CompanyLogo name={name} className="w-4 h-4 text-[7px] shrink-0" />,
  },
  contact: {
    href: (id) => `/contacts/${id}`,
    mark: (name) => <Avatar name={name} className="w-4 h-4 text-[7px] shrink-0" />,
  },
  person: {
    href: () => "/team",
    mark: (name) => <Avatar name={name} className="w-4 h-4 text-[7px] shrink-0" />,
  },
  offering: {
    href: (id) => `/offerings/${id}`,
    mark: (name) => <OfferingIcon name={name} className="w-4 h-4 rounded text-[6px] shrink-0" />,
  },
  component: {
    href: (id) => `/components/${id}`,
    mark: () => <Layers size={13} strokeWidth={1.9} className="shrink-0" />,
  },
  report: {
    href: (id) => (id ? `/reports/${id}` : "/reports"),
    mark: () => <BarChart3 size={13} strokeWidth={1.9} className="shrink-0" />,
  },
  /**
   * A FILE OPENS THE FILE. The id is "offeringId:materialId", and `?material=`
   * is the same parameter the viewer's own share link uses, so clicking a
   * named video in an answer lands on it playing rather than on the offering
   * page with a tab to hunt through.
   */
  /* These four list pages do not deep-link to a single row yet, so the pill
     lands on the list — identity first, navigation as far as it goes, the
     same bargain the `person` pill has always struck with /team. */
  deal: {
    href: () => "/opportunities",
    mark: () => <Briefcase size={13} strokeWidth={1.9} className="shrink-0" />,
  },
  contract: {
    href: () => "/contracts",
    mark: () => <FileSignature size={13} strokeWidth={1.9} className="shrink-0" />,
  },
  lead: {
    href: () => "/leads",
    mark: () => <UserPlus size={13} strokeWidth={1.9} className="shrink-0" />,
  },
  goal: {
    href: () => "/goals",
    mark: () => <Target size={13} strokeWidth={1.9} className="shrink-0" />,
  },
  material: {
    href: (id) => {
      const [offeringId, materialId] = id.split(":");
      return materialId
        ? `/offerings/${offeringId}?tab=materials&material=${encodeURIComponent(materialId)}`
        : `/offerings/${offeringId}?tab=materials`;
    },
    mark: () => <Paperclip size={13} strokeWidth={1.9} className="shrink-0" />,
  },
};

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

/**
 * Rewrite a plain string so every known name becomes a pill.
 *
 * Matched longest-first so "Cortexa Biopharma" beats "Cortexa" and
 * "Freya.Register" is not cut down to "Freya". Case-insensitive.
 *
 * The trailing guard excludes word characters and hyphens but NOT the full
 * stop. Excluding "." looked right (it stops "Freya" matching inside
 * "Freya.Register") and was wrong: it also refuses any name that ends a
 * sentence, so "the numbers are in Portfolio Reports." rendered as grey text
 * while every mid-sentence name pilled. Prefix collisions are already handled
 * by sorting longest-first, since alternation is first-match-wins.
 */
export function injectEntities(
  text: string,
  entities: Entity[],
  keyBase: string,
  /** Offerings-only release has no customer or contact pages to link to. */
  linkable = true
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
  const usable = entities;

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
  const re = new RegExp(
    `\\b(${usable.map((e) => escapeRe(e.name)).join("|")})(?![\\w-])`,
    "g"
  );
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const hit = usable.find((e) => e.name === m![1]);
    if (hit) {
      const style = KIND[hit.kind];
      // Offerings-only has no customer or contact pages; those pills stay
      // pills and simply do not navigate.
      const hasPage =
        linkable || hit.kind === "offering" || hit.kind === "component" ||
        hit.kind === "person" || hit.kind === "report" ||
        hit.kind === "material" || hit.kind === "deal" ||
        hit.kind === "contract" || hit.kind === "lead" || hit.kind === "goal";
      out.push(
        hasPage ? (
          <Link key={`${keyBase}-e${k++}`} href={style.href(hit.id)} className={PILL}>
            {style.mark(hit.name)}
            {m[1]}
          </Link>
        ) : (
          <span key={`${keyBase}-e${k++}`} className={`${PILL} cursor-default`}>
            {style.mark(hit.name)}
            {m[1]}
          </span>
        )
      );
    } else {
      out.push(m[1]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * The name index, fetched once per mount.
 *
 * Sorted longest-name-first because `injectEntities` builds one alternation
 * regex and JavaScript alternation is first-match-wins, not longest-match.
 * Names of two characters or fewer are dropped: they turn ordinary words into
 * pills.
 */
export function useEntityIndex(): Entity[] {
  const [entities, setEntities] = useState<Entity[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/agent/entities")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const take = (rows: unknown, kind: EntityKind): Entity[] =>
          ((rows as { name: string; id: string }[]) || []).map((r) => ({
            name: r.name,
            id: r.id,
            kind,
          }));
        const list = [
          ...take(d.companies, "company"),
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
        ].filter((e) => e.name && e.name.length > 2);
        list.sort((a, b) => b.name.length - a.name.length);
        setEntities(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return entities;
}
