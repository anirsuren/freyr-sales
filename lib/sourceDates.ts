/** Date provenance attached to a retrieved document passage. */
export type SourceDateKind = "content" | "upload";

export type EffectiveSourceDate = {
  iso: string;
  kind: SourceDateKind;
};

export type SourceDateWindow = {
  /** Inclusive lower boundary. */
  start: string;
  /** Inclusive upper boundary. */
  end: string;
  /** Exact window shown to the model/user. */
  label: string;
};

/** Keep only valid, stable ISO instants. A date-only value remains midnight UTC. */
export function normalizeSourceDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const parsed = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === trimmed
      ? parsed.toISOString()
      : undefined;
  }
  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

/** A document's own date outranks when somebody happened to upload it. */
export function effectiveSourceDate(
  contentDate?: string | null,
  uploadedAt?: string | null
): EffectiveSourceDate | undefined {
  const content = normalizeSourceDate(contentDate);
  if (content) return { iso: content, kind: "content" };
  const upload = normalizeSourceDate(uploadedAt);
  return upload ? { iso: upload, kind: "upload" } : undefined;
}

function subtractUtcMonths(now: Date, months: number): Date {
  const targetMonth = now.getUTCMonth() - months;
  const first = new Date(
    Date.UTC(now.getUTCFullYear(), targetMonth, 1, now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds())
  );
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate();
  first.setUTCDate(Math.min(now.getUTCDate(), lastDay));
  return first;
}

/**
 * Parse explicit recency windows. Boundaries are inclusive so a document dated
 * exactly at the start or end is never silently dropped.
 */
export function sourceDateWindowForQuestion(
  question: string,
  now: Date = new Date()
): SourceDateWindow | undefined {
  if (!Number.isFinite(now.getTime())) return undefined;
  const q = question.toLowerCase();
  const end = now.toISOString();
  const relative = q.match(/\b(?:last|past)\s+(\d{1,4})\s+(day|week|month|year)s?\b/);
  if (relative) {
    const amount = Number(relative[1]);
    if (amount <= 0) return undefined;
    let startDate: Date;
    if (relative[2] === "month") startDate = subtractUtcMonths(now, amount);
    else if (relative[2] === "year") startDate = subtractUtcMonths(now, amount * 12);
    else {
      const days = amount * (relative[2] === "week" ? 7 : 1);
      startDate = new Date(now.getTime() - days * 86_400_000);
    }
    const start = startDate.toISOString();
    return {
      start,
      end,
      label: `${start} through ${end} (inclusive)`,
    };
  }

  const since = q.match(/\bsince\s+(\d{4}-\d{2}-\d{2})\b/);
  const start = normalizeSourceDate(since?.[1]);
  return start
    ? { start, end, label: `${start} through ${end} (inclusive)` }
    : undefined;
}

export function sourceDateInWindow(
  value: string | undefined,
  window: SourceDateWindow
): boolean {
  const normalized = normalizeSourceDate(value);
  if (!normalized) return false;
  const time = Date.parse(normalized);
  return time >= Date.parse(window.start) && time <= Date.parse(window.end);
}

export function isRecencyQuestion(question: string): boolean {
  return /\b(latest|newest|most recent|recently|recent|last|past|since)\b/i.test(
    question
  );
}
