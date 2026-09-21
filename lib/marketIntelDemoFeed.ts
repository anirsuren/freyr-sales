import "server-only";
import { readMarketIntelTracking, type MarketIntelTracking } from "./marketIntelTracking";
import {
  summarizeCompany,
  summarizePerson,
  type FeedCompany,
  type FeedMeta,
  type PersonFeed,
} from "./marketIntelFeed";
import {
  FROZEN_WORKSPACE_CAPTURED_AT,
  FROZEN_WORKSPACE_COMPANIES,
  FROZEN_WORKSPACE_META,
  FROZEN_WORKSPACE_PEOPLE,
} from "./marketIntelFrozenWorkspace";

/** Frozen review-workspace feed. Uses the same feed schema as real mode. */
export async function readDemoIntel() {
  return buildDemoIntel(await readMarketIntelTracking());
}

export function buildDemoIntel(tracking: MarketIntelTracking) {
  const companies: Record<string, FeedCompany> = {};
  const people: Record<string, PersonFeed> = {};

  for (const tracked of tracking.companies) {
    const hidden = new Set(tracking.mockHiddenStories?.[tracked.id] ?? []);
    const captured = FROZEN_WORKSPACE_COMPANIES[tracked.id];
    companies[tracked.id] = captured
      ? {
          ...structuredClone(captured),
          name: tracked.name,
          group: tracked.group ?? "customer",
          logoUrl: tracked.logoUrl ?? captured.logoUrl ?? null,
          posts: captured.posts.filter((item) => !hidden.has(item.url)),
          news: captured.news.filter((item) => !hidden.has(item.url)),
          site: (captured.site ?? []).filter((item) => !hidden.has(item.url)),
        }
      : {
          id: tracked.id,
          name: tracked.name,
          slug: null,
          author: { name: tracked.name, followerCount: null },
          group: tracked.group ?? "customer",
          logoUrl: tracked.logoUrl ?? null,
          fetchedAt: FROZEN_WORKSPACE_CAPTURED_AT,
          posts: [],
          news: [],
          site: [],
          tldr: null,
        };
  }

  const trackedPeople = new Set(tracking.people.map((person) => person.id));
  for (const [id, feed] of Object.entries(FROZEN_WORKSPACE_PEOPLE)) {
    if (!trackedPeople.has(id)) continue;
    const companyId = tracking.people.find((person) => person.id === id)?.companyId;
    const hidden = new Set(companyId ? tracking.mockHiddenStories?.[companyId] ?? [] : []);
    people[id] = {
      ...structuredClone(feed),
      posts: feed.posts.filter((item) => !hidden.has(item.url)),
    };
  }

  const meta: FeedMeta = structuredClone(FROZEN_WORKSPACE_META);
  return {
    tracking,
    companies,
    people,
    summaries: Object.fromEntries(
      Object.entries(companies).map(([id, company]) => [id, summarizeCompany(company)]),
    ),
    personSummaries: Object.fromEntries(
      Object.entries(people).map(([id, feed]) => [id, summarizePerson(feed)]),
    ),
    meta,
  };
}
