/**
 * ROADMAP VERSIONING (product owner review, Aug 20, relayed over WhatsApp:
 * "we need versions of roadmap"… "Every time there is a change in road map it
 * has to be versioned. Just like how you version a document"… "people should
 * get notified if there are any changes to the roadmap").
 *
 * A roadmap is a promise about what customers get and when, and sales quote it
 * to clients. Until now an owner could quietly move a date or drop a feature
 * and nothing recorded that it ever said something else, so nobody could
 * answer "what did we tell them in June?".
 *
 * Every save that actually changes the roadmap mints a whole version — v1, v2,
 * v3, the number people say out loud — carrying who saved it, when, what
 * changed in plain English, and the full roadmap as it stood after that save.
 * Whole snapshots rather than diffs: the point is being able to open v2 and
 * read exactly what was promised, without replaying history to reconstruct it.
 *
 * A save that touches nothing on the roadmap mints nothing. Renaming the
 * offering is not a roadmap change.
 */
import type {
  Offering,
  OfferingRelease,
  OfferingRoadmapDetails,
} from "./offerings";

export interface RoadmapVersion {
  /** 1, 2, 3 … what people call it out loud. Never reused, never renumbered. */
  version: number;
  /** ISO timestamp of the save that minted it. */
  savedAt: string;
  /** Display name of whoever saved it, stamped from the session, never the body. */
  savedBy: string;
  /** What changed, one plain-English line each. Never empty. */
  changes: string[];
  /**
   * The roadmap AS IT STOOD after this save, so any version reads back whole.
   *
   * Two shapes share this field: an offering's releases carry `features`, an
   * FDL component's carry `current` and no features at all. Typed as the union
   * rather than the offering shape alone, because pretending otherwise is what
   * let a reader crash on `features.length` (Aug 20).
   */
  releases: (OfferingRelease | ComponentRelease)[];
  roadmap_details?: OfferingRoadmapDetails;
}

/**
 * KEY ORDER IS NOT A CHANGE.
 *
 * normalizeRoadmapDetails rebuilds every row on save, so the same module can
 * come back as {module, version, details} where it was stored as {module,
 * details, version}. A plain JSON.stringify comparison called that a change,
 * which would have minted a version on every save and printed "Current modules
 * changed" underneath it — history full of edits nobody made. Compare the
 * VALUES, in a fixed key order, and let real edits be the only thing that
 * shows up.
 */
function stable(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = walk((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(walk(value) ?? null);
}

/** The parts of an offering that ARE the roadmap. Everything else is not. */
type RoadmapShape = Pick<Offering, "releases" | "roadmap_details">;

const list = (r: RoadmapShape): OfferingRelease[] => r.releases ?? [];

/** Stable identity for a release across a save: its version string. */
const keyOf = (r: OfferingRelease) => (r.version || "").trim().toLowerCase();

function sameFeatures(a: string[] = [], b: string[] = []): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}

/**
 * WHAT CHANGED, SAID THE WAY A PERSON WOULD SAY IT.
 *
 * These lines are the whole point of the version list: "v3 · Anir moved V2
 * from March to June" answers the question people actually ask. A generic
 * "roadmap updated" would make the history worthless, so every shape of change
 * gets its own sentence, and anything unrecognised still gets counted rather
 * than silently dropped.
 */
export function describeRoadmapChange(
  before: RoadmapShape,
  after: RoadmapShape
): string[] {
  const changes: string[] = [];
  const prev = list(before);
  const next = list(after);
  const prevByKey = new Map(prev.map((r) => [keyOf(r), r]));
  const nextByKey = new Map(next.map((r) => [keyOf(r), r]));

  for (const r of next) {
    if (!prevByKey.has(keyOf(r))) {
      changes.push(
        `Added ${r.version || "a version"}${r.date ? ` (${r.date})` : ""}`
      );
    }
  }
  for (const r of prev) {
    if (!nextByKey.has(keyOf(r))) changes.push(`Removed ${r.version || "a version"}`);
  }
  for (const r of next) {
    const was = prevByKey.get(keyOf(r));
    if (!was) continue;
    const name = r.version || "a version";
    /* Same release (keys match, case-insensitively) wearing a different
       label — without this a rename came out as the useless "Roadmap
       updated", because every other check compares dates and features. */
    if (was.version !== r.version) changes.push(`Renamed ${was.version} to ${r.version}`);
    if ((was.date || "") !== (r.date || "")) {
      changes.push(
        was.date && r.date
          ? `${name} moved from ${was.date} to ${r.date}`
          : r.date
            ? `${name} dated ${r.date}`
            : `${name} lost its date`
      );
    }
    if (was.status !== r.status) {
      changes.push(
        r.status === "released"
          ? `${name} marked as released`
          : `${name} marked as the next release`
      );
    }
    if (!sameFeatures(was.features, r.features)) {
      const added = (r.features ?? []).filter((f) => !(was.features ?? []).includes(f)).length;
      const gone = (was.features ?? []).filter((f) => !(r.features ?? []).includes(f)).length;
      const parts: string[] = [];
      if (added) parts.push(`${added} feature${added === 1 ? "" : "s"} added`);
      if (gone) parts.push(`${gone} removed`);
      changes.push(`${name}: ${parts.length ? parts.join(", ") : "features reordered"}`);
    }
    if ((was.note || "") !== (r.note || "")) changes.push(`${name}: note changed`);
  }

  const d0 = before.roadmap_details;
  const d1 = after.roadmap_details;
  if (stable(d0) !== stable(d1)) {
    if (!d0 && d1) changes.push("Roadmap detail added");
    else if (d0 && !d1) changes.push("Roadmap detail removed");
    else if (d0 && d1) {
      if (d0.currentVersion !== d1.currentVersion)
        changes.push(
          `Current version ${d0.currentVersion || "unset"} → ${d1.currentVersion || "unset"}`
        );
      if (d0.nextExpectedLive !== d1.nextExpectedLive)
        changes.push(
          `Next expected live ${d0.nextExpectedLive || "unset"} → ${d1.nextExpectedLive || "unset"}`
        );
      if (d0.nextVersions !== d1.nextVersions) changes.push("Next versions changed");
      if (d0.releaseWave !== d1.releaseWave) changes.push("Release wave changed");
      if (stable(d0.currentModules) !== stable(d1.currentModules))
        changes.push("Current modules changed");
      if (stable(d0.nextModules) !== stable(d1.nextModules))
        changes.push("Next-release modules changed");
      if (stable(d0.comparisonRows) !== stable(d1.comparisonRows))
        changes.push("Version comparison changed");
      if (stable(d0.history) !== stable(d1.history))
        changes.push("Release history changed");
      if (stable(d0.platformCapabilities) !== stable(d1.platformCapabilities))
        changes.push("Platform capabilities changed");
    }
  }

  /* Something moved but none of the named shapes caught it — say so rather
     than mint a version whose history line is blank. */
  if (!changes.length && roadmapChanged(before, after)) changes.push("Roadmap updated");
  return changes;
}

/**
 * Did the roadmap actually move? Renaming the offering must not mint a version.
 *
 * RELEASE ORDER IS NOT A CHANGE. The tab re-sorts releases every render (next
 * first, then newest date), so the order they happen to sit in the array is
 * invisible to everyone. Dragging rows around was minting versions whose only
 * history line was "Roadmap updated" — an edit nobody made. Compared by key so
 * the same set in a different order reads as the same roadmap.
 *
 * The roadmap_details lists stay order-sensitive on purpose: those tables ARE
 * rendered in stored order, so moving a module up the page is a real edit.
 */
export function roadmapChanged(before: RoadmapShape, after: RoadmapShape): boolean {
  const byKey = (rs: OfferingRelease[]) =>
    stable([...rs].sort((a, b) => keyOf(a).localeCompare(keyOf(b))));
  return (
    byKey(list(before)) !== byKey(list(after)) ||
    stable(before.roadmap_details) !== stable(after.roadmap_details)
  );
}

/**
 * Mint the next version, if this save changed anything.
 *
 * Returns the FULL list to store, so the caller writes one field. Null means
 * nothing changed and the caller should leave the history alone — an
 * unchanged re-save must not pile up identical versions.
 */
export function nextRoadmapVersions(
  before: RoadmapShape & { roadmap_versions?: RoadmapVersion[] },
  after: RoadmapShape,
  savedBy: string
): RoadmapVersion[] | null {
  if (!roadmapChanged(before, after)) return null;
  const history = before.roadmap_versions ?? [];
  /* Highest number wins, not length: a history that was ever trimmed must
     never hand out a number it already used. */
  const last = history.reduce((max, v) => Math.max(max, v.version || 0), 0);
  const minted: RoadmapVersion = {
    version: last + 1,
    savedAt: new Date().toISOString(),
    savedBy: savedBy.trim() || "Someone",
    changes: describeRoadmapChange(before, after),
    releases: JSON.parse(JSON.stringify(list(after))) as OfferingRelease[],
    ...(after.roadmap_details
      ? { roadmap_details: JSON.parse(JSON.stringify(after.roadmap_details)) }
      : {}),
  };
  /* Newest first: the list is read top-down and the current one is the answer
     to "what does it say now". Capped so one offering's history cannot grow
     without bound inside a single catalogue row. */
  return [minted, ...history].slice(0, 60);
}


/* ------------------------------------------------------- FDL components */

/**
 * THE ROADMAP PEOPLE ACTUALLY EDIT.
 *
 * The offering-level roadmap has no editor any more — the form's own comment
 * says it became "an editor for a screen nobody can open". What a human
 * changes today is an FDL COMPONENT's releases, from the component page, and
 * that is the roadmap Suren meant when he said every component has its own.
 * Versioning had to reach it or the request was only half answered.
 *
 * Same contract as the offering side: a save that changes nothing mints
 * nothing, versions never renumber, and the lines say what a person would say.
 */
export interface ComponentRelease {
  id: string;
  version: string;
  date?: string;
  status: "released" | "next";
  current?: boolean;
}

export function describeComponentChange(
  before: ComponentRelease[] = [],
  after: ComponentRelease[] = []
): string[] {
  const changes: string[] = [];
  const key = (r: ComponentRelease) => (r.version || "").trim().toLowerCase();
  const prev = new Map(before.map((r) => [key(r), r]));
  const next = new Map(after.map((r) => [key(r), r]));
  for (const r of after) {
    if (!prev.has(key(r)))
      changes.push(`Added ${r.version || "a version"}${r.date ? ` (${r.date})` : ""}`);
  }
  for (const r of before) {
    if (!next.has(key(r))) changes.push(`Removed ${r.version || "a version"}`);
  }
  for (const r of after) {
    const was = prev.get(key(r));
    if (!was) continue;
    const name = r.version || "a version";
    if (was.version !== r.version) changes.push(`Renamed ${was.version} to ${r.version}`);
    if ((was.date || "") !== (r.date || "")) {
      changes.push(
        was.date && r.date
          ? `${name} moved from ${was.date} to ${r.date}`
          : r.date
            ? `${name} dated ${r.date}`
            : `${name} lost its date`
      );
    }
    if (was.status !== r.status)
      changes.push(
        r.status === "released"
          ? `${name} marked as released`
          : `${name} marked as the next release`
      );
    /* The version sellers quote today. Moving that mark is the single most
       consequential edit on this page, so it gets its own sentence. */
    if (!was.current && r.current) changes.push(`${name} is now the current version`);
    if (was.current && !r.current) changes.push(`${name} is no longer the current version`);
  }
  if (!changes.length && componentRoadmapChanged(before, after))
    changes.push("Roadmap updated");
  return changes;
}

/** Order is not a change: the component page sorts releases before drawing. */
export function componentRoadmapChanged(
  before: ComponentRelease[] = [],
  after: ComponentRelease[] = []
): boolean {
  const norm = (rs: ComponentRelease[]) =>
    stable([...rs].sort((a, b) => (a.version || "").localeCompare(b.version || "")));
  return norm(before) !== norm(after);
}

export function nextComponentVersions(
  before: { releases?: ComponentRelease[]; roadmap_versions?: RoadmapVersion[] },
  after: { releases?: ComponentRelease[] },
  savedBy: string
): RoadmapVersion[] | null {
  const a = before.releases ?? [];
  const b = after.releases ?? [];
  if (!componentRoadmapChanged(a, b)) return null;
  const history = before.roadmap_versions ?? [];
  const last = history.reduce((max, v) => Math.max(max, v.version || 0), 0);
  return [
    {
      version: last + 1,
      savedAt: new Date().toISOString(),
      savedBy: savedBy.trim() || "Someone",
      changes: describeComponentChange(a, b),
      /* Stored in the shared shape so one history component renders both. */
      releases: JSON.parse(JSON.stringify(b)),
    },
    ...history,
  ].slice(0, 60);
}
