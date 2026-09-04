// Account health score (V5) — a 0-100 heuristic from real engagement signals:
// activity recency, latest outcome sentiment, deal progression, and contact
// coverage. Pure + dependency-light so list + detail share one source of truth.
import type { Interaction } from "./types";
import type { Deal } from "./pipeline";

export type HealthBand = "healthy" | "watch" | "at_risk";

export interface AccountHealth {
  score: number;
  band: HealthBand;
  label: string;
  factors: { label: string; delta: number }[];
}

const POSITIVE = new Set(["interested", "meeting_booked", "ai_call_completed"]);
const NEGATIVE = new Set(["not_interested", "ai_call_failed"]);

export function accountHealth(input: {
  interactions: Interaction[];
  deals: Deal[];
  contactCount: number;
}): AccountHealth {
  const { interactions, deals, contactCount } = input;
  const factors: { label: string; delta: number }[] = [];
  let score = 60;

  // recency of last activity
  const last = [...interactions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];
  if (!last) {
    score -= 20;
    factors.push({ label: "No activity logged", delta: -20 });
  } else {
    const days = Math.floor(
      (Date.now() - new Date(last.created_at).getTime()) / 86400000
    );
    if (days <= 7) {
      score += 25;
      factors.push({ label: "Active in the last week", delta: 25 });
    } else if (days <= 21) {
      score += 10;
      factors.push({ label: "Active this month", delta: 10 });
    } else if (days > 45) {
      score -= 25;
      factors.push({ label: `Quiet for ${days} days`, delta: -25 });
    }

    // latest outcome sentiment
    if (POSITIVE.has(last.outcome)) {
      score += 15;
      factors.push({ label: "Positive last touch", delta: 15 });
    } else if (NEGATIVE.has(last.outcome)) {
      score -= 20;
      factors.push({ label: "Negative last touch", delta: -20 });
    } else if (last.outcome === "no_response") {
      score -= 5;
      factors.push({ label: "Awaiting a response", delta: -5 });
    }
  }

  // deal progression (best stage)
  const stages = deals.map((d) => d.stage);
  if (stages.includes("Meeting Booked") || stages.includes("Qualified")) {
    score += 15;
    factors.push({ label: "Deal is progressing", delta: 15 });
  } else if (stages.includes("Engaged")) {
    score += 5;
    factors.push({ label: "Engaged", delta: 5 });
  } else if (stages.length && stages.every((s) => s === "Closed Lost")) {
    score -= 15;
    factors.push({ label: "Deal closed lost", delta: -15 });
  }

  // contact coverage (multi-threading)
  if (contactCount >= 3) {
    score += 5;
    factors.push({ label: "Multi-threaded", delta: 5 });
  } else if (contactCount === 0) {
    score -= 10;
    factors.push({ label: "No contacts mapped", delta: -10 });
  }

  score = Math.max(0, Math.min(100, score));
  const band: HealthBand =
    score >= 70 ? "healthy" : score >= 45 ? "watch" : "at_risk";
  const label =
    band === "healthy" ? "Healthy" : band === "watch" ? "Watch" : "At risk";
  return {
    score,
    band,
    label,
    factors: factors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 4),
  };
}

// Honest health trend: recompute the score at weekly cutoffs using only the
// interactions that existed on/before each date (deals + coverage held at
// current), so the line reflects how engagement actually moved over time.
export function accountHealthSeries(
  input: { interactions: Interaction[]; deals: Deal[]; contactCount: number },
  weeks = 5,
  now = Date.now()
): { points: number[]; delta: number } {
  const points: number[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const cutoff = now - i * 7 * 86400000;
    const ints = input.interactions.filter(
      (x) => new Date(x.created_at).getTime() <= cutoff
    );
    points.push(
      accountHealth({
        interactions: ints,
        deals: input.deals,
        contactCount: input.contactCount,
      }).score
    );
  }
  return { points, delta: points[points.length - 1] - points[0] };
}

// Traffic-light bands: green / warm / red. The middle band was mustard #CA8A04
// on a yellow wash — 2.7:1, i.e. unreadable, and the exact yellow Suren banned
// on Jul 27. It is now burnt orange: still unmistakably "caution" between the
// green and the red, but 4.3:1 on its own tint, and saturated enough (94%) to
// read as orange rather than the muddy brown that darkened amber becomes.
export const HEALTH_COLOR: Record<HealthBand, { bg: string; color: string }> = {
  healthy: { bg: "rgba(34,197,94,0.14)", color: "#16A34A" },
  watch: { bg: "rgba(194,65,12,0.12)", color: "var(--ink-orange)" },
  at_risk: { bg: "rgba(239,68,68,0.12)", color: "#DC2626" },
};
