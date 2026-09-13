import "server-only";
import { collectionKey, readCollectionRow, writeCollectionRow } from "./marketIntelCollectionStore";
import { collectedInCurrentCycle } from "./marketIntelCadence";

/** Start once, persist the provider run ID, then resume polling that same run.
 * An ambiguous POST is deliberately not retried: it may already be billable. */
export async function runDurableMarketIntelActor(actor: string, input: unknown, token: string): Promise<any[]> {
  const id = `market-intel:actor:${collectionKey({ actor, input })}`;
  const row = await readCollectionRow(id);
  if (row?.catalog.items && collectedInCurrentCycle(row.catalog.at)) {
    Object.defineProperty(row.catalog.items, "collectionCostUsd", { value: 0 });
    return row.catalog.items;
  }
  let state = row?.catalog;
  if (state?.runId && state.at && !collectedInCurrentCycle(state.at)) state = null;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (!state?.runId) {
    if (state?.starting) {
      // The server can die after Apify accepts the POST but before runId is
      // persisted. Reconcile against provider-owned run inputs, never re-POST.
      const response = await fetch(`https://api.apify.com/v2/acts/${actor}/runs?desc=true&limit=30`, { headers, cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error("Could not reconcile the existing scraper request. No new paid run was started.");
      const runs = (await response.json()).data?.items ?? [];
      for (const run of runs) {
        if (Date.parse(run.startedAt) < Date.parse(state.requestedAt) - 5000) continue;
        const original = await fetch(`https://api.apify.com/v2/key-value-stores/${encodeURIComponent(run.defaultKeyValueStoreId)}/records/INPUT`, { headers, cache: "no-store", signal: AbortSignal.timeout(15_000) });
        if (!original.ok) continue;
        const actual = await original.json();
        if (Object.entries(input as Record<string, unknown>).every(([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value))) {
          state = { ...state, starting: false, runId: run.id, datasetId: run.defaultDatasetId };
          await writeCollectionRow(id, state);
          break;
        }
      }
      if (!state.runId) throw new Error("The original scraper request could not yet be confirmed. No duplicate paid run was started.");
    }
  }
  if (!state?.runId) {
    state = { starting: true, actor, input, requestedAt: new Date().toISOString() };
    if (!await writeCollectionRow(id, state, row)) throw new Error("This scraper request is already being collected.");
    const response = await fetch(`https://api.apify.com/v2/acts/${actor}/runs`, {
      method: "POST", headers, body: JSON.stringify(input), cache: "no-store", signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Scraper start HTTP ${response.status}; request retained for reconciliation.`);
    const run = (await response.json()).data;
    if (!run?.id) throw new Error("Scraper did not return a run ID.");
    state = { ...state, starting: false, runId: run.id, datasetId: run.defaultDatasetId };
    await writeCollectionRow(id, state);
  }
  // Bounded polling. A later retry resumes this ID, never another paid POST.
  const deadline = Date.now() + 4 * 60_000;
  while (Date.now() < deadline) {
    const response = await fetch(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(state.runId)}?waitForFinish=30`, { headers, cache: "no-store", signal: AbortSignal.timeout(40_000) });
    if (!response.ok) throw new Error(`Scraper status HTTP ${response.status}; run retained for retry.`);
    const run = (await response.json()).data;
    if (run.status === "SUCCEEDED") {
      const data = await fetch(`https://api.apify.com/v2/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?clean=true&format=json`, { headers, cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (!data.ok) throw new Error(`Scraper results HTTP ${data.status}; run retained for retry.`);
      const items = await data.json();
      if (!Array.isArray(items)) throw new Error("Scraper results are invalid.");
      await writeCollectionRow(id, { ...state, items, at: new Date().toISOString(), status: run.status, costUsd: run.usageTotalUsd });
      Object.defineProperty(items, "collectionCostUsd", { value: run.usageTotalUsd ?? items.length * 0.005 });
      return items;
    }
    if (["FAILED", "TIMED-OUT", "ABORTED"].includes(run.status)) throw new Error(`Scraper ${run.status.toLowerCase()}. Its run is saved for inspection.`);
  }
  throw new Error("Scraper is still running. Retry will retrieve the same run without starting another.");
}
