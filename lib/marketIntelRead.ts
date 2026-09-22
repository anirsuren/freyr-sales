import "server-only";
import { getDataMode } from "./dataMode";
import * as real from "./marketIntelFeed";
import { readDemoIntel } from "./marketIntelDemoFeed";
export * from "./marketIntelFeed";
export async function readMarketIntelFeed(options?: { fresh?: boolean }) {
  if (getDataMode() !== "mock") return real.readMarketIntelFeed(options);
  const demo = await readDemoIntel();
  return {
    version: demo.meta.version,
    companies: demo.companies,
    people: demo.people,
    mna: demo.meta.mna,
    thought: demo.meta.thought,
    health: demo.meta.health,
    updatedAt: demo.meta.updatedAt,
    spendUsd: demo.meta.spendUsd,
    apifyDay: demo.meta.apifyDay,
  };
}
export async function readMarketIntelSummaries(options?: {fresh?:boolean}) {
  if (getDataMode() !== "mock") return real.readMarketIntelSummaries(options);
  const demo = await readDemoIntel();
  return {meta:demo.meta,companies:demo.summaries};
}
export async function readFeedCompany(id:string) {
  return getDataMode() === "mock" ? (await readDemoIntel()).companies[id] ?? null : real.readFeedCompany(id);
}
export async function readFeedPeople(ids:string[]) {
  if (getDataMode() !== "mock") return real.readFeedPeople(ids);
  const {people} = await readDemoIntel();
  return Object.fromEntries(ids.filter(id=>people[id]).map(id=>[id,people[id]]));
}
export async function readFeedPeopleSummaries() {
  return getDataMode() === "mock" ? (await readDemoIntel()).personSummaries : real.readFeedPeopleSummaries();
}
