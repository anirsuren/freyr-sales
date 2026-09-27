/**
 * THE AGENT'S ACTIONS, THE PARTS THAT NEED NO SERVER.
 *
 * Shapes shared by the store, the converse route, the confirm route, the web
 * card and the WhatsApp bridge, plus the small pure helpers the tests cover:
 * reading a yes or a no, matching a person's name, parsing money and dates.
 */

export type ProposalStatus = "proposed" | "done" | "cancelled" | "failed" | "expired";

export type ActionProposal = {
  id: string;
  /** Registry key, e.g. assign_goal. */
  action: string;
  /** Normalised parameters, ids resolved, exactly what will be sent. */
  params: Record<string, unknown>;
  /** One plain sentence: what will change. */
  summary: string;
  status: ProposalStatus;
  createdAt: number;
  expiresAt: number;
  channel: "web" | "whatsapp";
  conversationId?: string;
  /** After execution. */
  result?: string;
  link?: string;
  error?: string;
  decidedAt?: number;
};

/** What a chat message carries so the web card can draw itself. */
export type PendingActionPayload = {
  id: string;
  action: string;
  summary: string;
  status: ProposalStatus;
  result?: string;
  link?: string;
};

/** A proposal is good for this long; then it must be asked for again. */
export const PROPOSAL_TTL_MS = 30 * 60_000;

const YES = /^(?:yes|yes please|yep|yeah|yup|ya|y|ok|okay|sure|confirm|confirmed|do it|go ahead|go|proceed|please do|approve|approved|make it so|👍|✅)\s*[.!]*\s*$/i;
const NO = /^(?:no|nope|n|cancel|stop|don't|do not|not now|never mind|nevermind|abort|reject|leave it|skip)\s*[.!]*\s*$/i;

export function isAffirmative(text: string): boolean {
  return YES.test(String(text ?? "").trim());
}

export function isNegative(text: string): boolean {
  return NO.test(String(text ?? "").trim());
}

export type NamedThing = { id: string; name: string };

export type Match<T> = { ok: true; value: T } | { ok: false; error: string };

function norm(value: string): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Find one record by id or by name. Exact name first, then a unique partial
 * match; two partial matches is a question back to the person, not a guess.
 */
export function matchOne<T extends NamedThing>(
  query: string,
  items: T[],
  what: string,
  extraKeys: (item: T) => string[] = () => []
): Match<T> {
  const q = norm(query);
  if (!q) return { ok: false, error: `Which ${what}?` };
  const byId = items.find((item) => item.id === query.trim() || extraKeys(item).some((k) => norm(k) === q));
  if (byId) return { ok: true, value: byId };
  const exact = items.filter((item) => norm(item.name) === q);
  if (exact.length === 1) return { ok: true, value: exact[0] };
  if (exact.length > 1) return { ok: false, error: `More than one ${what} is called "${query.trim()}"; give the id.` };
  const partial = items.filter((item) => norm(item.name).includes(q) || q.includes(norm(item.name)));
  if (partial.length === 1) return { ok: true, value: partial[0] };
  if (partial.length > 1) {
    const names = partial.slice(0, 5).map((item) => item.name).join(", ");
    return { ok: false, error: `Which ${what}: ${names}${partial.length > 5 ? "…" : ""}?` };
  }
  /* A person is often named by first name alone; a record by one word of it. */
  const words = q.split(" ");
  const byWord = items.filter((item) => {
    const parts = norm(item.name).split(" ");
    return words.every((w) => parts.some((p) => p === w || p.startsWith(w)));
  });
  if (byWord.length === 1) return { ok: true, value: byWord[0] };
  if (byWord.length > 1) {
    return { ok: false, error: `Which ${what}: ${byWord.slice(0, 5).map((item) => item.name).join(", ")}?` };
  }
  return { ok: false, error: `No ${what} called "${query.trim()}".` };
}

/** "$1.2m", "200k", "1,500,000", "USD 50,000" to a number. */
export function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim().toLowerCase().replace(/[$€£,\s]|usd|eur|gbp|inr/g, "");
  const match = /^(-?\d+(?:\.\d+)?)([kmb])?$/.exec(raw);
  if (!match) return null;
  const n = Number(match[1]);
  const mult = match[2] === "k" ? 1e3 : match[2] === "m" ? 1e6 : match[2] === "b" ? 1e9 : 1;
  return Number.isFinite(n) ? n * mult : null;
}

/** An ISO day (YYYY-MM-DD) from what a person types; null when unreadable. */
export function parseDay(value: unknown, now = new Date()): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const lower = raw.toLowerCase();
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (lower === "today") return day(base);
  if (lower === "tomorrow") return day(new Date(base.getTime() + 86_400_000));
  const inDays = /^in (\d+) days?$/.exec(lower);
  if (inDays) return day(new Date(base.getTime() + Number(inDays[1]) * 86_400_000));
  const inWeeks = /^(?:in (\d+) weeks?|next week)$/.exec(lower);
  if (inWeeks) return day(new Date(base.getTime() + (inWeeks[1] ? Number(inWeeks[1]) : 1) * 7 * 86_400_000));
  const endOf = /^end of (q[1-4])(?: (\d{4}))?$/.exec(lower);
  if (endOf) {
    const year = endOf[2] ? Number(endOf[2]) : now.getUTCFullYear();
    const month = { q1: 2, q2: 5, q3: 8, q4: 11 }[endOf[1] as "q1" | "q2" | "q3" | "q4"];
    return day(new Date(Date.UTC(year, month + 1, 0)));
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return day(parsed);
  return null;
}

export function shortId(prefix = "act"): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
