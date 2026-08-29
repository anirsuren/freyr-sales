import "server-only";

import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { ModuleKey } from "./privileges";

/**
 * THE GROUP A RECORD WAS HANDED TO, AND THE PEOPLE ON IT.
 *
 * The other half of Suren's Aug 29 model. `owner` already lives on the record
 * itself — whoever created it — and this is everything that was added after:
 * "when he assigns somebody as a member, that particular person can actually
 * start writing things", and "I am assigning a customer to this business
 * development group".
 *
 * Reads are per module and whole: a customers page wants every assignment in
 * Customers, not one lookup per row, so this returns a map and callers index
 * into it. React's cache keeps that to one round trip per request even when
 * four components ask.
 *
 * MISSING TABLE IS NOT AN ERROR. Migration 025 may not have run on an
 * environment yet, and a records page must not 500 because of it. An empty map
 * means nothing is assigned, which every caller already handles.
 */

export type Assignment = {
  groupId: string | null;
  members: string[];
};

export type AssignmentMap = Record<string, Assignment>;

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export const readAssignments = cache(
  async (module: ModuleKey): Promise<AssignmentMap> => {
    try {
      const { data, error } = await client()
        .from("record_assignments")
        .select("record_id, group_id, members")
        .eq("module", module);
      if (error || !Array.isArray(data)) return {};

      const out: AssignmentMap = {};
      for (const row of data) {
        const id = str(row.record_id, 120);
        if (!id) continue;
        out[id] = {
          groupId: str(row.group_id, 120) || null,
          members: Array.isArray(row.members)
            ? [
                ...new Set(
                  row.members
                    .map((m: unknown) => str(m, 80))
                    .filter(Boolean)
                ),
              ]
            : [],
        };
      }
      return out;
    } catch {
      return {};
    }
  }
);

/**
 * Assign a record, or clear it.
 *
 * A record with no group and nobody on it has no row rather than an empty one,
 * so "is anything assigned here" stays a question about existence.
 */
export async function writeAssignment(input: {
  module: ModuleKey;
  recordId: string;
  groupId: string | null;
  members: string[];
  by: string;
}): Promise<void> {
  const members = [
    ...new Set(input.members.map((m) => str(m, 80)).filter(Boolean)),
  ];
  const groupId = str(input.groupId ?? "", 120) || null;
  const db = client();

  if (!groupId && members.length === 0) {
    await db
      .from("record_assignments")
      .delete()
      .eq("module", input.module)
      .eq("record_id", input.recordId);
    return;
  }

  const { error } = await db.from("record_assignments").upsert(
    {
      module: input.module,
      record_id: input.recordId,
      group_id: groupId,
      members,
      updated_at: new Date().toISOString(),
      updated_by: str(input.by, 80) || null,
    },
    { onConflict: "module,record_id" }
  );
  if (error) throw new Error(error.message);
}
