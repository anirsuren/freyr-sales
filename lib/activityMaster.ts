import { getDataMode } from "./dataMode";
import {
  builtInActivities,
  CONTRIBUTIONS,
  type ActivityContribution,
  type ActivityMasterState,
  type MasterActivity,
} from "./activityMasterShared";

/**
 * ACTIVITY MASTER — storage and operations.
 *
 * Same one-row pattern as opportunities and performance: a row in
 * offering_catalog_state, mock and real split so a mock experiment can never
 * rewire which goal a real contract feeds.
 *
 * Reads MERGE the built-ins in rather than trusting the stored row to carry
 * them: the five activities exist because engagement history is written in
 * them, so a half-written row, a bad migration or an over-eager delete can
 * never make "contract" stop being an activity. Only their settings persist.
 */

const ROW_ID = "activity_master";

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

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function contribution(v: unknown): ActivityContribution {
  const s = str(v, 20).toLowerCase();
  return (CONTRIBUTIONS as readonly string[]).includes(s)
    ? (s as ActivityContribution)
    : "none";
}

function goalIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item, 60);
    if (s && !out.includes(s)) out.push(s);
  }
  return out.slice(0, 12);
}

/** A colour is an identity, so an invalid one falls back to neutral slate. */
function color(v: unknown): string {
  const s = str(v, 20);
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : "#475569";
}

function normalize(raw: unknown): ActivityMasterState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const stored = Array.isArray(r.activities) ? r.activities : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of stored) {
    if (item && typeof item === "object") {
      const id = str((item as Record<string, unknown>).id, 60).toLowerCase();
      if (id) byId.set(id, item as Record<string, unknown>);
    }
  }

  // Built-ins first, wearing stored settings when the row has them.
  const activities: MasterActivity[] = builtInActivities().map((b) => {
    const s = byId.get(b.id);
    byId.delete(b.id);
    if (!s) return b;
    return {
      ...b,
      contribution: s.contribution === undefined ? b.contribution : contribution(s.contribution),
      goalIds: goalIds(s.goalIds),
    };
  });

  // Then whatever was added by hand.
  for (const [id, s] of byId) {
    const label = str(s.label, 60);
    if (!label) continue;
    activities.push({
      id,
      label,
      color: color(s.color),
      contribution: contribution(s.contribution),
      goalIds: goalIds(s.goalIds),
      builtIn: false,
    });
  }
  return { activities };
}

async function readRow(): Promise<ActivityMasterState> {
  if (!hasDatabase()) return normalize(null);
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", activeRowId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalize(data?.catalog);
}

async function writeRow(state: ActivityMasterState): Promise<void> {
  const { error } = await client()
    .from("offering_catalog_state")
    .upsert({
      id: activeRowId(),
      catalog: state,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

export async function readActivityMaster(): Promise<ActivityMasterState> {
  return readRow().catch(() => normalize(null));
}

/** Update one activity's contribution and/or goal connections. */
export async function updateMasterActivity(input: {
  id: string;
  contribution?: string;
  goalIds?: unknown;
}): Promise<ActivityMasterState> {
  const id = str(input.id, 60).toLowerCase();
  const state = await readRow();
  const hit = state.activities.find((a) => a.id.toLowerCase() === id);
  if (!hit) throw new Error("That activity is not on the master.");
  if (input.contribution !== undefined) {
    hit.contribution = contribution(input.contribution);
  }
  if (input.goalIds !== undefined) {
    hit.goalIds = goalIds(input.goalIds);
  }
  await writeRow(state);
  return state;
}

/** Add a hand-made activity to the master. */
export async function addMasterActivity(input: {
  label: string;
  color?: string;
  contribution?: string;
  goalIds?: unknown;
}): Promise<ActivityMasterState> {
  const label = str(input.label, 60);
  if (!label) throw new Error("Give the activity a name.");
  const state = await readRow();
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!id) throw new Error("Give the activity a name with letters in it.");
  if (state.activities.some((a) => a.id === id)) {
    throw new Error(`"${label}" is already on the master.`);
  }
  state.activities.push({
    id,
    label,
    color: color(input.color),
    contribution: contribution(input.contribution),
    goalIds: goalIds(input.goalIds),
    builtIn: false,
  });
  await writeRow(state);
  return state;
}

/** Remove a hand-made activity. The five built-ins never leave: engagement
 *  history is written in them. */
export async function removeMasterActivity(id: string): Promise<ActivityMasterState> {
  const key = str(id, 60).toLowerCase();
  const state = await readRow();
  const hit = state.activities.find((a) => a.id.toLowerCase() === key);
  if (!hit) throw new Error("That activity is not on the master.");
  if (hit.builtIn) {
    throw new Error(
      `${hit.label} is part of the app's activity vocabulary and cannot be removed — disconnect its goals instead.`
    );
  }
  state.activities = state.activities.filter((a) => a !== hit);
  await writeRow(state);
  return state;
}
