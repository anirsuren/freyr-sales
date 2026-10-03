import { AsyncLocalStorage } from "node:async_hooks";
import { closeSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { GenerateContentParameters, GenerateContentResponseUsageMetadata } from "@google/genai";

// Opt-in development QA requests only. Ordinary chats never use this ledger.
// The browser cannot choose a path, increase the budget, or enable paid work.
export const QA_CAMPAIGN = "freyr-agent-2026-10-02";
type Context = { file: string; actor?: string };
declare global {
  // eslint-disable-next-line no-var
  var __FREYR_QA_BUDGET_CONTEXT__: AsyncLocalStorage<Context> | undefined;
}
const context = globalThis.__FREYR_QA_BUDGET_CONTEXT__ ??= new AsyncLocalStorage<Context>();
export type QaLedger = {
  campaign: string;
  status: "pending_verification" | "active" | "exhausted";
  googleAccount: string;
  identityVerified: boolean;
  guardVerified: boolean;
  limitMicrousd: number;
  reservedMicrousd: number;
  allowedActorIds: string[];
  reservations: { id: string; at: string; actor: string; inputTokens: number; outputCeiling: number; microusd: number; upperMicrousd: number; settled?: boolean }[];
};
const ledgerPath = () => path.join(process.cwd(), ".qa-backups", "agent-paid-campaign.json");

function readLedger(file: string): QaLedger {
  const ledger = JSON.parse(readFileSync(file, "utf8")) as QaLedger;
  if (ledger.campaign !== QA_CAMPAIGN || ledger.limitMicrousd !== 10_000_000 ||
    !Number.isSafeInteger(ledger.reservedMicrousd) || ledger.reservedMicrousd < 0 ||
    ledger.reservedMicrousd > ledger.limitMicrousd || !Array.isArray(ledger.reservations) ||
    !Array.isArray(ledger.allowedActorIds) ||
    ledger.reservations.reduce((sum, row) => sum + row.microusd, 0) !== ledger.reservedMicrousd) {
    throw new Error("QA spending ledger is invalid; paid testing is blocked.");
  }
  if (ledger.status !== "active" || !ledger.identityVerified || !ledger.guardVerified ||
    ledger.googleAccount !== "anirudhsuren@gmail.com") {
    throw new Error("Paid QA awaits verified Google identity and spending guard.");
  }
  return ledger;
}

export function isAgentQaRequest(): boolean { return !!context.getStore(); }

export async function withAgentQaRequest<T>(request: { url: string; headers: Headers }, run: () => Promise<T>): Promise<T> {
  const campaign = request.headers.get("x-freyr-qa-campaign");
  if (!campaign) return run();
  const url = new URL(request.url);
  if (campaign !== QA_CAMPAIGN || process.env.NODE_ENV !== "development" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "3006" ||
    process.env.AUTH_MODE !== "supabase" ||
    process.env.GOOGLE_CLOUD_PROJECT !== "sound-fastness-480519-a6" ||
    new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://invalid").hostname !== "ebyoefeikqxxxxifgjxk.supabase.co") {
    throw new Error("QA spending guard requires the authenticated local development environment.");
  }
  const file = ledgerPath();
  readLedger(file);
  return context.run({ file }, run);
}

export function authorizeAgentQaActor(userId: string): void {
  const scope = context.getStore();
  if (!scope) return;
  if (!readLedger(scope.file).allowedActorIds.includes(userId)) {
    throw new Error("Paid QA requires a journaled disposable test account.");
  }
  scope.actor = userId;
}

export function assertAgentQaProvider(provider: string): void {
  if (isAgentQaRequest() && provider !== "vertex") {
    throw new Error("Unmetered provider fallback is disabled for paid QA.");
  }
}

// Reservations survive errors, partial streams, aborts and process restarts.
// Only complete, internally consistent provider usage can settle a reservation.
export function reserveQaCall(file: string, actor: string, inputTokens: number, outputCeiling: number): string {
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || inputTokens > 1_048_576 ||
    !Number.isSafeInteger(outputCeiling) || outputCeiling < 1 || outputCeiling > 131_072) {
    throw new Error("QA token bound is invalid.");
  }
  const lock = `${file}.lock`;
  const handle = openSync(lock, "wx", 0o600); // Contention or stale locks fail closed.
  try {
    const ledger = readLedger(file);
    if (!ledger.allowedActorIds.includes(actor)) throw new Error("Unregistered QA actor.");
    // Global Gemini 3.5 Flash: $1.50/M input; $9/M response + reasoning.
    // No cached-token discount. Add 25% margin and stop $1 below the limit.
    const microusd = Math.ceil((inputTokens * 1.5 + outputCeiling * 9) * 1.25);
    if (ledger.reservedMicrousd + microusd > ledger.limitMicrousd - 1_000_000) {
      throw new Error("QA spending ceiling reached; no further paid call is allowed.");
    }
    ledger.reservedMicrousd += microusd;
    const id = randomUUID();
    ledger.reservations.push({ id, at: new Date().toISOString(), actor, inputTokens, outputCeiling, microusd, upperMicrousd: microusd });
    const temporary = `${file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(ledger, null, 2) + "\n", { mode: 0o600 });
    renameSync(temporary, file);
    return id;
  } finally {
    closeSync(handle);
    unlinkSync(lock);
  }
}

const receipts = new WeakMap<object, { file: string; id: string }>();

export function completeQaVertexRequest(request: GenerateContentParameters, usage?: GenerateContentResponseUsageMetadata): void {
  const receipt = receipts.get(request);
  if (!receipt || !usage) return;
  const input = usage.promptTokenCount;
  const total = usage.totalTokenCount;
  const visible = usage.candidatesTokenCount ?? 0;
  const thoughts = usage.thoughtsTokenCount ?? 0;
  if (![input, total, visible, thoughts].every(value => Number.isSafeInteger(value) && value! >= 0) ||
    input === undefined || total === undefined || total < input + visible + thoughts) return;
  // Any unclassified generated tokens are charged at the higher output rate.
  const cost = Math.ceil((input * 1.5 + (total - input) * 9) * 1.25);
  const lock = `${receipt.file}.lock`;
  const handle = openSync(lock, "wx", 0o600);
  try {
    const ledger = readLedger(receipt.file);
    const row = ledger.reservations.find(item => item.id === receipt.id);
    if (!row || row.settled) return;
    if (cost > row.upperMicrousd) throw new Error("Provider usage exceeded its QA reservation; stop paid testing.");
    ledger.reservedMicrousd -= row.microusd - cost;
    row.microusd = cost;
    row.settled = true;
    const temporary = `${receipt.file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(ledger, null, 2) + "\n", { mode: 0o600 });
    renameSync(temporary, receipt.file);
    receipts.delete(request);
  } finally {
    closeSync(handle);
    unlinkSync(lock);
  }
}

export async function guardedQaVertexRequest(
  request: GenerateContentParameters,
): Promise<GenerateContentParameters> {
  const scope = context.getStore();
  if (!scope) return request;
  if (!scope.actor || request.model !== "gemini-3.5-flash" ||
    (process.env.GOOGLE_CLOUD_LOCATION || "global") !== "global" ||
    process.env.GOOGLE_CLOUD_PROJECT !== "sound-fastness-480519-a6") {
    throw new Error("Unpriced QA provider/model/location is blocked.");
  }
  const config = request.config || {};
  if (config.cachedContent || config.candidateCount && config.candidateCount !== 1 ||
    config.tools?.some(tool => Object.keys(tool).some(key => key !== "functionDeclarations"))) {
    throw new Error("Unpriced caching, candidates or external grounding is blocked for QA.");
  }
  const output = config.maxOutputTokens;
  if (!Number.isSafeInteger(output) || !output || output < 1 || output > 65_536) {
    throw new Error("Paid QA requires a bounded output.");
  }
  // Multimodal countTokens estimates can undercount. Reserve the entire
  // supported input window plus full reasoning allowance, for every call.
  // Successful calls settle from complete usage; failures keep this bound.
  const id = reserveQaCall(scope.file, scope.actor, 1_048_576, output + 65_536);
  const guarded = { ...request, config: { ...config, httpOptions: {
    ...config.httpOptions, retryOptions: { attempts: 1 },
  } } };
  receipts.set(guarded, { file: scope.file, id });
  return guarded;
}
