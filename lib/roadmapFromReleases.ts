import type { OfferingRelease, OfferingRoadmapDetails } from "@/lib/offerings";

/**
 * AN OFFERING'S VERSION HISTORY LIVES IN TWO PLACES.
 *
 * `roadmap_details` is the structured record an owner fills in. `releases` is
 * the simpler version list the app has always had, and it is what nearly every
 * offering actually carries — including every sample offering in Mock. Reading
 * only `roadmap_details` meant the editor opened with empty lists on exactly
 * the offerings that had history to show, so there was nothing to reorder and
 * nothing to correct (Anir, Aug 7: "on mock mode you have to be able to do all
 * of that").
 *
 * This fills the structured shape from the release list when no structured
 * record exists yet. Nothing is invented: a release with no date contributes no
 * period, and an offering with no releases still gets a blank roadmap.
 */
export function roadmapFromReleases(
  details: OfferingRoadmapDetails | undefined,
  releases: OfferingRelease[] | undefined
): OfferingRoadmapDetails | undefined {
  if (details) return details;
  const list = releases ?? [];
  if (list.length === 0) return undefined;

  const released = list
    .filter((release) => release.status === "released")
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const next = list.find((release) => release.status === "next");
  const current = released[0];
  const previous = released[1];

  // Written out here rather than imported: the editor's blankRoadmapDetails()
  // lives in a "use client" module, and a server component cannot call into
  // one.
  const base: OfferingRoadmapDetails = {
    currentVersion: "",
    releaseWave: "",
    currentModules: [],
    platformCapabilities: [],
    comparisonCurrentLabel: "",
    comparisonPreviousLabel: "",
    comparisonRows: [],
    history: [],
    nextExpectedLive: "",
    nextVersions: "",
    nextModules: [],
  };
  return {
    ...base,
    currentVersion: current?.version ?? "",
    releaseWave: current?.date ? `Released ${current.date}` : "",
    // Each shipped version becomes one history row, newest first — the order
    // an owner reads it in, and the order they will want to correct.
    history: released.map((release) => ({
      period: release.date || release.version,
      summary: release.features ?? [],
    })),
    comparisonCurrentLabel: current?.version ?? "",
    comparisonPreviousLabel: previous?.version ?? "",
    comparisonRows: (current?.features ?? []).map((feature, index) => ({
      area: feature,
      current: feature,
      previous: previous?.features?.[index] ?? "",
    })),
    currentModules: current
      ? [
          {
            module: current.version,
            ...(current.date ? { version: current.date } : {}),
            details: current.features ?? [],
          },
        ]
      : [],
    nextVersions: next?.version ?? "",
    nextExpectedLive: next?.date ?? "",
    nextModules: next
      ? [{ module: next.version, details: next.features ?? [] }]
      : [],
  };
}
