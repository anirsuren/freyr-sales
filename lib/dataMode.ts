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
