export type DataMode = "mock" | "live";
export const DATA_MODE_COOKIE = "freyr_data_mode";

export function configuredDataMode(): DataMode {
  return process.env.DEFAULT_DATA_MODE === "live" ? "live" : "mock";
}

export function isDataModeLocked(): boolean {
  return process.env.DATA_MODE_LOCKED === "1";
}

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_DATA_MODE__: DataMode | undefined;
}

export function getDataMode(): DataMode {
  if (isDataModeLocked()) return configuredDataMode();
  if (!globalThis.__FREYR_DATA_MODE__) {
    globalThis.__FREYR_DATA_MODE__ = configuredDataMode();
  }
  return globalThis.__FREYR_DATA_MODE__;
}

export function setDataMode(mode: DataMode): DataMode {
  if (isDataModeLocked()) return configuredDataMode();
  globalThis.__FREYR_DATA_MODE__ = mode;
  return mode;
}

/**
 * REMEMBER AN ADMIN'S CHOICE ACROSS RESTARTS.
 *
 * DEFAULT_DATA_MODE is a deployment default, not a decision. The deploy
 * pipeline writes "mock" onto every task definition, so each release quietly
 * put production back into the demo catalogue and somebody had to notice and
 * flip it again — which is exactly what happened after the Jul 29 deploy, with
 * real Freyr people about to look at it.
 *
 * An explicit choice made in the app therefore outlives the process. The env
 * default applies only until somebody chooses; DATA_MODE_LOCKED still wins
 * absolutely, because that is a deliberate lock rather than a default.
 */
const MODE_ROW = "workspace-data-mode";

function modeClient() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    return null;
  // Imported lazily: this module is pulled into client bundles for its types.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/** Write the choice down. Failure is not fatal: the process still honours it. */
export async function persistDataMode(mode: DataMode): Promise<void> {
  if (isDataModeLocked()) return;
  // Same boundary as hydrate: a local toggle is local.
  if (process.env.NODE_ENV !== "production") return;
  const client = modeClient();
  if (!client) return;
  await client
    .from("offering_catalog_state")
    .upsert({
      id: MODE_ROW,
      catalog: { mode },
      updated_at: new Date().toISOString(),
    })
    .then(() => undefined, () => undefined);
}

/** Restore the remembered choice at boot, before anything renders. */
export async function hydrateDataMode(): Promise<DataMode> {
  if (isDataModeLocked()) return configuredDataMode();
  // ONLY A DEPLOYED SERVER REMEMBERS.
  //
  // The row lives in the workspace database, which a laptop and the test
  // runner also point at — so the first version of this handed production's
  // choice to every environment that shared the database. The verify suite
  // booted into live mode and a dozen mock-data tests failed, which is a
  // polite version of what it would have done to a developer mid-debug.
  //
  // A running deployment remembers what its operator chose; anywhere else,
  // DEFAULT_DATA_MODE is the whole answer, as it always was.
  if (process.env.NODE_ENV !== "production") return getDataMode();
  const client = modeClient();
  if (!client) return getDataMode();
  try {
    const { data } = await client
      .from("offering_catalog_state")
      .select("catalog")
      .eq("id", MODE_ROW)
      .maybeSingle();
    const stored = (data?.catalog as { mode?: string } | null)?.mode;
    if (stored === "live" || stored === "mock") {
      globalThis.__FREYR_DATA_MODE__ = stored;
      return stored;
    }
  } catch {
    // Unreachable database: the env default stands, which is the old behaviour.
  }
  return getDataMode();
}
