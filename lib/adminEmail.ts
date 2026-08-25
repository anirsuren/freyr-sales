import "server-only";

import { getDataMode } from "./dataMode";

/**
 * EMAILS AN ADMIN WRITES AND SENDS FROM THE APP (Anir, Aug 25: "have you added
 * that element anywhere for admins to be able to create emails here somewhere?
 * ... can the app send emails to a non-user? ... if we want to send that email
 * to somebody who's a user of the app and then CC a non-app user also in that
 * email, that's possible, I hope").
 *
 * The app has always been able to reach any address — Resend does not care
 * whether a recipient has an account — but nothing in the UI let a person
 * write one, and the send helper only ever passed a single `to`, so copying
 * somebody in was impossible however you asked for it.
 *
 * EVERY SEND IS RECORDED. This is a regulatory-affairs company: a mail that
 * left the workspace and cannot be shown afterwards is worse than no mail at
 * all. The record keeps who sent it, to whom, the subject and the body, and
 * whether the provider accepted it — including failures, which are the ones
 * somebody will ask about.
 */

export type AdminEmailStatus = "sent" | "failed" | "simulated";

export type AdminEmailRecord = {
  id: string;
  to: string;
  cc: string[];
  bcc: string[];
  replyTo?: string;
  subject: string;
  body: string;
  sentBy: string;
  sentByEmail?: string;
  sentAt: string;
  status: AdminEmailStatus;
  /** The provider's own words when it refused, so a failure is diagnosable. */
  error?: string;
};

export type AdminEmailState = { emails: AdminEmailRecord[] };

const ROW_ID = "admin-emails";

/** Mock and live keep separate logs, like every other store here: a demo send
 *  can never appear in the real workspace's audit trail. */
function activeRowId(): string {
  try {
    return getDataMode() === "mock" ? `${ROW_ID}:mock` : ROW_ID;
  } catch {
    return ROW_ID;
  }
}

function hasDatabase(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function client() {
  return require("@supabase/supabase-js").createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const EMPTY: AdminEmailState = { emails: [] };

/** Every field named on the way in and out, or the next write drops it. */
function normalize(raw: unknown): AdminEmailState {
  const row = (raw ?? {}) as Partial<AdminEmailState>;
  const list = Array.isArray(row.emails) ? row.emails : [];
  return {
    emails: list
      .map((e) => {
        const r = (e ?? {}) as Partial<AdminEmailRecord>;
        if (!r.id || !r.to) return null;
        return {
          id: String(r.id),
          to: String(r.to),
          cc: Array.isArray(r.cc) ? r.cc.map(String) : [],
          bcc: Array.isArray(r.bcc) ? r.bcc.map(String) : [],
          ...(r.replyTo ? { replyTo: String(r.replyTo) } : {}),
          subject: String(r.subject ?? ""),
          body: String(r.body ?? ""),
          sentBy: String(r.sentBy ?? "Somebody"),
          ...(r.sentByEmail ? { sentByEmail: String(r.sentByEmail) } : {}),
          sentAt: String(r.sentAt ?? new Date().toISOString()),
          status: (["sent", "failed", "simulated"] as const).includes(
            r.status as AdminEmailStatus
          )
            ? (r.status as AdminEmailStatus)
            : "sent",
          ...(r.error ? { error: String(r.error) } : {}),
        } satisfies AdminEmailRecord;
      })
      .filter((e): e is AdminEmailRecord => !!e)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
  };
}

export async function readAdminEmails(): Promise<AdminEmailState> {
  if (!hasDatabase()) return EMPTY;
  try {
    // The jsonb column on this table is `catalog`, whatever the row holds —
    // every other store here reads the same one. Selecting "state" returned a
    // row with no such field, so the log read back empty however much had
    // been written to it.
    const { data, error } = await client()
      .from("offering_catalog_state")
      .select("catalog")
      .eq("id", activeRowId())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return normalize(data?.catalog);
  } catch {
    return EMPTY;
  }
}

/**
 * Serialised through a single promise chain, the same guard every other store
 * here uses: two admins pressing Send at the same moment must not read the
 * same log and write back two copies, losing one of them.
 */
const queue = globalThis as typeof globalThis & {
  __freyrAdminEmailWrite?: Promise<unknown>;
};

async function write(
  change: (state: AdminEmailState) => AdminEmailState
): Promise<AdminEmailState> {
  const run = async () => {
    const current = await readAdminEmails();
    const next = normalize(change(current));
    if (hasDatabase()) {
      const { error } = await client()
        .from("offering_catalog_state")
        .upsert({
          id: activeRowId(),
          catalog: next,
          updated_at: new Date().toISOString(),
        });
      if (error) throw new Error(error.message);
    }
    return next;
  };
  const chained = (queue.__freyrAdminEmailWrite ?? Promise.resolve())
    .catch(() => undefined)
    .then(run);
  queue.__freyrAdminEmailWrite = chained;
  return chained;
}

export async function recordAdminEmail(
  record: Omit<AdminEmailRecord, "id" | "sentAt">
): Promise<AdminEmailRecord> {
  const full: AdminEmailRecord = {
    ...record,
    id: `ae-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    sentAt: new Date().toISOString(),
  };
  await write((state) => ({ emails: [full, ...state.emails].slice(0, 500) }));
  return full;
}

/**
 * ONE ADDRESS PER LINE, COMMA OR SEMICOLON — however somebody pastes a list.
 * Returns the valid ones and names the rest, because silently dropping a
 * malformed address is how a mail goes to four people when you meant five.
 */
export function parseAddresses(raw: string): {
  valid: string[];
  invalid: string[];
} {
  const parts = String(raw ?? "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    // A plain address, or "Name <address>" as pasted from a mail client.
    const address = part.match(/<([^>]+)>/)?.[1]?.trim() ?? part;
    if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(address)) {
      invalid.push(part);
      continue;
    }
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(address);
  }
  return { valid, invalid };
}
