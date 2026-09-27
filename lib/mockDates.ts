/** Keep dated showroom records inside the July 2026-onward demo timeline.
 * Only exact ISO date values are changed; prose and source documents are left
 * alone. The mapping preserves the order of legacy dates and is idempotent.
 */
const FIRST_MOCK_DAY = Date.UTC(2026, 6, 1);
const LEGACY_START = Date.UTC(2025, 0, 1);
const LEGACY_SPAN = FIRST_MOCK_DAY - LEGACY_START;
const MOCK_WINDOW = 61 * 86_400_000;

export function normalizeMockDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return value;
  const day = Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(day) || day >= FIRST_MOCK_DAY) return value;
  const fraction = Math.max(0, day - LEGACY_START) / LEGACY_SPAN;
  const mapped = FIRST_MOCK_DAY + Math.floor(fraction * MOCK_WINDOW / 86_400_000) * 86_400_000;
  return new Date(mapped).toISOString().slice(0, 10) + value.slice(10);
}

export function normalizeMockRecordDates(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  let changed = 0;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") {
      const next = normalizeMockDate(child);
      if (next !== child) {
        (value as Record<string, unknown>)[key] = next;
        changed += 1;
      }
    } else if (child && typeof child === "object") {
      changed += normalizeMockRecordDates(child);
    }
  }
  return changed;
}

export function mockDated<T>(value: T): T {
  normalizeMockRecordDates(value);
  return value;
}
