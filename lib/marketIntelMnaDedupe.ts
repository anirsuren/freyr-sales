import type { MnaItem } from "./marketIntelFeed";

/**
 * ONE DEAL, ONE ROW (Sep 13 loop). Three outlets covered Precera buying
 * Additive Metal Services and the tracker listed it three times: "Precera ->
 * MIM/Additive Manufacturing company", "Precera -> MIM, Additive
 * Manufacturing" and "Precera Medical -> Additive Metal Services". The old
 * check deleted punctuation instead of spacing it ("mimadditive" never
 * matched "mim additive") and needed the two target names to contain each
 * other, which three headlines' paraphrases never do.
 *
 * Same deal when the acquirers match and either the targets match, or the
 * two reports are from the same day and their targets share a real word.
 * The first report in the list is the one kept.
 */
const CORPORATE =
  /\b(inc|corp|corporation|ltd|limited|plc|llc|co|group|holdings?|company|companies|pharmaceuticals?|pharma|biosciences?|therapeutics|sciences|laboratories|labs|international|medical|business|the|and|of)\b/g;

function bare(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/['\u2019]s\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(CORPORATE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameName(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
}

function sharesWord(a: string, b: string): boolean {
  const words = new Set(a.split(" ").filter((w) => w.length >= 4));
  return b.split(" ").some((w) => w.length >= 4 && words.has(w));
}

function day(iso: string | null | undefined): string {
  const at = Date.parse(String(iso ?? ""));
  return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : "";
}

export function isSameDeal(a: Pick<MnaItem, "acquirer" | "target" | "date">, b: Pick<MnaItem, "acquirer" | "target" | "date">): boolean {
  if (!sameName(bare(a.acquirer), bare(b.acquirer))) return false;
  const ta = bare(a.target);
  const tb = bare(b.target);
  if (sameName(ta, tb)) return true;
  return !!day(a.date) && day(a.date) === day(b.date) && sharesWord(ta, tb);
}

export function dedupeMnaDeals<T extends Pick<MnaItem, "acquirer" | "target" | "date">>(deals: T[]): T[] {
  const kept: T[] = [];
  for (const deal of deals) {
    if (!kept.some((other) => isSameDeal(deal, other))) kept.push(deal);
  }
  return kept;
}
