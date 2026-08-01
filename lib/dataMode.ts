import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";

export type DataMode = "mock" | "live";
// New name intentionally ignores the old year-long workspace-mode cookie, so
// everyone starts in Real mode when this correction ships.
export const DATA_MODE_COOKIE = "freyr_data_view_session";

/**
 * A deployment may deliberately lock the experience, but an unlocked app
 * always starts in Real mode. Mock mode is a temporary viewer choice carried
 * by this browser session; it is never workspace state.
 */
export function configuredDataMode(): DataMode {
  return process.env.DATA_MODE_LOCKED === "1" &&
    process.env.DEFAULT_DATA_MODE === "mock"
    ? "mock"
    : "live";
}

export function isDataModeLocked(): boolean {
  return process.env.DATA_MODE_LOCKED === "1";
}

declare global {
  // Unit tests exercise the data adapters outside a Next request. This
  // non-production-only override gives those isolated tests an explicit mode
  // without reintroducing mutable mode state into the deployed application.
  // eslint-disable-next-line no-var
  var __FREYR_TEST_DATA_MODE__: DataMode | undefined;
}

export function setDataMode(mode: DataMode): DataMode {
  if (process.env.NODE_ENV !== "production") {
    globalThis.__FREYR_TEST_DATA_MODE__ = mode;
  }
  return mode;
}

/**
 * Resolve mode from Next's request-local cookie store. The app's data adapters
 * are synchronous selectors used deep inside server operations, so they read
 * the same AsyncLocalStorage-backed request store Next uses for cookies rather
 * than keeping any process-global mode. Outside a request (boot, scripts,
 * instrumentation), Real mode is the safe default.
 */
export function getDataMode(): DataMode {
  if (isDataModeLocked()) return configuredDataMode();
  if (
    process.env.NODE_ENV !== "production" &&
    globalThis.__FREYR_TEST_DATA_MODE__
  ) {
    return globalThis.__FREYR_TEST_DATA_MODE__;
  }
  try {
    const store = workUnitAsyncStorage.getStore();
    if (store && "cookies" in store) {
      return store.cookies.get(DATA_MODE_COOKIE)?.value === "mock"
        ? "mock"
        : "live";
    }
  } catch {
    // Boot code and standalone scripts do not have a request store.
  }
  return "live";
}
