import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getDataMode } from "./dataMode";
import { hasSupabase } from "./env";

/**
 * THE WORDS INSIDE EVERY UPLOADED FILE, kept where the agent can search them.
 *
 * Eeswar uploads decks, transcripts and one-pagers; the assistant is supposed
 * to answer FROM THEM (Wajeed, Jul 29: "we want to make the agent as smart as
 * possible about each of the offerings — that's the end goal"). So extraction
 * happens once, at upload, and the text lives here.
 *
 * It is deliberately NOT stored on the offering record. That record is a
 * single JSON document that is re-written on every catalogue edit and shipped
 * into the browser on every page render; a dozen decks would make each of
 * those an order of magnitude heavier for no reason. This is a second row in
 * the same table — same durability, same client, no migration — read once per
 * process and only by the server.
 *
 * The key is the file's storage path, not the material id: the file is
 * uploaded BEFORE the material row exists, and the path is what uniquely
 * identifies it for the rest of its life.
 */

export type MaterialTextEntry = {
  /** The offering the file belongs to, so retrieval can cite it. */
  offeringId: string;
  filename: string;
  /** Extracted, plain text. Empty means "we could not read this format". */
  text: string;
  extractedAt: string;
  /** Published/authored date declared inside the document, when available. */
  contentDate?: string;
  /** Searchable files extracted from a ZIP, with safe member paths. */
  archiveMembers?: Array<{
    path: string;
    text: string;
    contentDate?: string;
  }>;
};

type TextIndex = Record<string, MaterialTextEntry>;

const ROW_ID = "material-text";

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_MATERIAL_TEXT__: TextIndex | undefined;
  // eslint-disable-next-line no-var
  var __FREYR_MATERIAL_TEXT_LOAD__: Promise<void> | undefined;
}

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function index(): TextIndex {
  if (!globalThis.__FREYR_MATERIAL_TEXT__) globalThis.__FREYR_MATERIAL_TEXT__ = {};
  return globalThis.__FREYR_MATERIAL_TEXT__;
}

/** Hydrate the index from the database once per process. Safe to await on
 *  every request; safe to call with no database at all (mock mode keeps the
 *  in-memory copy, which is exactly the demo behaviour we want). */
export async function loadMaterialText(): Promise<TextIndex> {
  if (getDataMode() !== "live" || !hasSupabase()) return index();
  if (!globalThis.__FREYR_MATERIAL_TEXT_LOAD__) {
    globalThis.__FREYR_MATERIAL_TEXT_LOAD__ = (async () => {
      const { data, error } = await client()
        .from("offering_catalog_state")
        .select("catalog")
        .eq("id", ROW_ID)
        .maybeSingle();
      // A missing row is the normal first-run state, not a failure. A real
      // error must not take the page down either — the agent simply answers
      // from the catalogue alone, which is what it did before files existed.
      if (!error && data?.catalog && typeof data.catalog === "object") {
        globalThis.__FREYR_MATERIAL_TEXT__ = data.catalog as TextIndex;
      }
    })().catch(() => undefined);
  }
  await globalThis.__FREYR_MATERIAL_TEXT_LOAD__;
  return index();
}

/** Record what a freshly uploaded file says. */
export async function saveMaterialText(
  path: string,
  entry: MaterialTextEntry
): Promise<void> {
  await loadMaterialText();
  index()[path] = entry;
  await persist();
}

/** Forget a file's text when its material row is deleted, so a removed deck
 *  stops informing answers the moment it leaves the page. */
export async function forgetMaterialText(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await loadMaterialText();
  let changed = false;
  for (const p of paths) {
    if (index()[p]) {
      delete index()[p];
      changed = true;
    }
  }
  if (changed) await persist();
}

async function persist(): Promise<void> {
  if (getDataMode() !== "live" || !hasSupabase()) return;
  const { error } = await client().from("offering_catalog_state").upsert({
    id: ROW_ID,
    catalog: index(),
    updated_at: new Date().toISOString(),
  });
  if (error)
    throw new Error(`Could not save the file's contents: ${error.message}`);
}

/** How much readable content we hold, for the owner-facing "the agent has read
 *  N files" line. Counts only files that actually yielded words. */
export async function materialTextStats(offeringId?: string): Promise<{
  files: number;
  words: number;
}> {
  const all = await loadMaterialText();
  const rows = Object.values(all).filter(
    (e) => e.text && (!offeringId || e.offeringId === offeringId)
  );
  return {
    files: rows.length,
    words: rows.reduce((n, e) => n + (e.text.match(/\S+/g)?.length ?? 0), 0),
  };
}
