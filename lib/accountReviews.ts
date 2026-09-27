import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getDataMode } from "./dataMode";
import { isSupabaseConfigured } from "./env";

export type AccountReviewAction = { id: string; action: string; owner: string; deadline: string };
export type AccountReviewContent = {
  attendees: string;
  accountStatus: string;
  progress: string;
  relationships: string;
  opportunities: string;
  risks: string;
  strategy: string;
  nextSteps: AccountReviewAction[];
};
export type AccountReviewRecord = {
  id: string;
  reviewedOn: string;
  recordedAt: string;
  recordedBy: string;
  copiedFromId?: string;
  content: AccountReviewContent;
};

const queues = new Map<string, Promise<void>>();
const text = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const validDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

function rowId(customerId: string): string {
  return `account-reviews:${getDataMode()}:${customerId}`;
}

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function normalizeContent(raw: unknown): AccountReviewContent {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    attendees: text(value.attendees, 1000),
    accountStatus: text(value.accountStatus, 4000),
    progress: text(value.progress, 4000),
    relationships: text(value.relationships, 4000),
    opportunities: text(value.opportunities, 4000),
    risks: text(value.risks, 4000),
    strategy: text(value.strategy, 4000),
    nextSteps: (Array.isArray(value.nextSteps) ? value.nextSteps : []).slice(0, 100).flatMap((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const step = item as Record<string, unknown>;
      const action = text(step.action, 1000);
      if (!action) return [];
      return [{ id: text(step.id, 80) || `action-${index}`, action, owner: text(step.owner, 120), deadline: validDay(step.deadline) ? step.deadline : "" }];
    }),
  };
}

function normalize(raw: unknown): AccountReviewRecord[] {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return (Array.isArray(value.reviews) ? value.reviews : []).flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const review = item as Record<string, unknown>;
    if (!validDay(review.reviewedOn)) return [];
    return [{
      id: text(review.id, 80) || `account-review-${index}`,
      reviewedOn: review.reviewedOn,
      recordedAt: text(review.recordedAt, 40),
      recordedBy: text(review.recordedBy, 120),
      copiedFromId: text(review.copiedFromId, 80) || undefined,
      content: normalizeContent(review.content),
    }];
  });
}

export async function readAccountReviews(customerId: string): Promise<AccountReviewRecord[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await client().from("offering_catalog_state")
    .select("catalog").eq("id", rowId(customerId)).maybeSingle();
  if (error) throw new Error(error.message);
  return normalize(data?.catalog);
}

export async function addAccountReview(customerId: string, input: { reviewedOn: unknown; copiedFromId?: unknown; content: unknown }, actor: string): Promise<AccountReviewRecord> {
  if (!isSupabaseConfigured()) throw new Error("Account reviews need the configured database.");
  if (!validDay(input.reviewedOn)) throw new Error("Choose a valid review date.");
  const raw = input.content && typeof input.content === "object" && !Array.isArray(input.content) ? input.content as Record<string, unknown> : {};
  const rawSteps = Array.isArray(raw.nextSteps) ? raw.nextSteps : [];
  if (rawSteps.some((step) => !step || typeof step !== "object" || !text(step.action, 1000) || !text(step.owner, 120) || !validDay(step.deadline))) {
    throw new Error("Every agreed action needs a description, owner and deadline.");
  }
  const content = normalizeContent(input.content);
  if (![content.accountStatus, content.progress, content.relationships, content.opportunities, content.risks, content.strategy].some(Boolean) && !content.nextSteps.length) {
    throw new Error("Record the discussion or an agreed next step before saving.");
  }
  const key = rowId(customerId);
  const previous = queues.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => { release = resolve; });
  queues.set(key, current);
  await previous.catch(() => undefined);
  try {
    const copiedFromId = text(input.copiedFromId, 80);
    const record: AccountReviewRecord = {
      id: `account-review-${crypto.randomUUID()}`,
      reviewedOn: input.reviewedOn,
      recordedAt: new Date().toISOString(),
      recordedBy: actor,
      copiedFromId: copiedFromId || undefined,
      content,
    };
    // Optimistic write keeps a second app instance from replacing a review
    // that another person saved after this request began.
    for (let attempt = 0; attempt < 5; attempt++) {
      const db = client();
      const { data: previousRow, error: readError } = await db.from("offering_catalog_state")
        .select("catalog,updated_at").eq("id", key).maybeSingle();
      if (readError) throw new Error(readError.message);
      const records = normalize(previousRow?.catalog);
      if (copiedFromId && !records.some((item) => item.id === copiedFromId)) throw new Error("The review being copied is no longer available.");
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(previousRow?.updated_at || "") + 1 || 0)).toISOString();
      const nextRow = { catalog: { reviews: [...records, record] }, updated_at: updatedAt };
      const result = previousRow
        ? await db.from("offering_catalog_state").update(nextRow).eq("id", key).eq("updated_at", previousRow.updated_at).select("id")
        : await db.from("offering_catalog_state").insert({ id: key, ...nextRow }).select("id");
      if (result.error?.code === "23505") continue;
      if (result.error) throw new Error(result.error.message);
      if (result.data?.length) return record;
    }
    throw new Error("Another review was saved at the same time. Please try again.");
  } finally {
    release();
    if (queues.get(key) === current) queues.delete(key);
  }
}
