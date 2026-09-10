/**
 * ONE STORY, ONE CARD (Saras, Sep 10: "if we have multiple articles talking
 * about the same thing, can they be grouped together? Maybe it can just say
 * at the box below, 'Other sources talking about this'").
 *
 * Two things produce repeats in a briefing. The same article arrives from two
 * sources under two links, and the news wire's headline and the same-day
 * pass's headline rarely match to the letter. And a company's own post is
 * reposted by one of its tracked people: same words, same minute, a second
 * link. Neither is caught by an exact-match key, so this groups by what the
 * words say rather than by the link.
 *
 * Pure, deterministic, and cheap enough to run on every render: normalise
 * the words, drop the ones that carry no meaning, and call two items the same
 * story when their word sets mostly overlap or one is contained in the other.
 * A wrong merge hides a story, a missed merge shows a repeat, so the
 * thresholds lean towards keeping items apart.
 */

const STOP = new Set(
  "a an and are as at be by for from has have in into is it its of on or that the this to was were will with their they our we you your about after over under new says said new".split(
    " "
  )
);

/** Lower-case, no links, no hashtags, letters and digits only. */
export function normalizeStoryText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    // "122.6 crore" and "1,200" are one number each, not two tokens.
    .replace(/(\d)[.,](\d)/g, "$1$2")
    .replace(/[#@]\w+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function storyTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of normalizeStoryText(text).split(" ")) {
    if (word.length < 3 || STOP.has(word)) continue;
    out.add(word);
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): { jaccard: number; containment: number } {
  if (a.size === 0 || b.size === 0) return { jaccard: 0, containment: 0 };
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = a.size + b.size - shared;
  return {
    jaccard: shared / union,
    containment: shared / Math.min(a.size, b.size),
  };
}

export type StoryInput = {
  /** Stable key for the item (its URL). */
  key: string;
  /** The headline for news, the first sentence for a post. */
  title: string;
  /** Longer text when there is one; posts use their body. */
  body?: string | null;
  date: string | null;
};

/**
 * Same story: titles that share most of their meaningful words, or a post
 * whose opening lines are the other post's opening lines (a repost).
 */
export function sameStory(a: StoryInput, b: StoryInput): boolean {
  const ta = storyTokens(a.title);
  const tb = storyTokens(b.title);
  const t = overlap(ta, tb);
  /* Measured on the Sep 10 transcript's own examples: "Tata Consultancy
     Services wins Rs 122.6 crore work order from Government of Odisha for
     OSWAS 3.0" and "TCS bags Rs 122.6 crore Odisha government work order for
     OSWAS 3.0 automation" share seven meaningful words of ten and eleven,
     which is a Jaccard of 0.5. Two different stories about one company
     rarely share half their meaningful words once the stop words are gone. */
  if (ta.size >= 4 && tb.size >= 4 && (t.jaccard >= 0.5 || t.containment >= 0.7)) return true;
  if (a.body && b.body) {
    const na = normalizeStoryText(a.body).slice(0, 160);
    const nb = normalizeStoryText(b.body).slice(0, 160);
    if (na.length >= 60 && na === nb) return true;
    const ba = storyTokens(a.body.slice(0, 600));
    const bb = storyTokens(b.body.slice(0, 600));
    const o = overlap(ba, bb);
    if (ba.size >= 12 && bb.size >= 12 && o.jaccard >= 0.7) return true;
  }
  return false;
}

export type StoryGroup<T extends StoryInput> = { lead: T; others: T[] };

/**
 * Groups a date-sorted list. The first item seen becomes the lead of its
 * story; anything that matches an existing lead joins it. Order is preserved
 * so the page still reads newest first.
 */
export function groupStories<T extends StoryInput>(items: T[]): StoryGroup<T>[] {
  const groups: StoryGroup<T>[] = [];
  for (const item of items) {
    const home = groups.find((g) => sameStory(g.lead, item));
    if (home) home.others.push(item);
    else groups.push({ lead: item, others: [] });
  }
  return groups;
}
