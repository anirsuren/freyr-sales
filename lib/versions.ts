import type { PitchSession, PitchVersion } from "./types";

const MAX_VERSIONS = 12;

function asStr(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : JSON.stringify(v);
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(
    Math.random() * 1e4
  ).toString(36)}`;
}

export function makeVersion(
  fields: {
    pitch_5min_script?: unknown;
    pitch_email?: unknown;
    pitch_call_script?: unknown;
  },
  source: PitchVersion["source"],
  created_at?: string
): PitchVersion {
  return {
    id: uid("ver"),
    created_at: created_at || new Date().toISOString(),
    source,
    pitch_5min_script: asStr(fields.pitch_5min_script),
    pitch_email: asStr(fields.pitch_email),
    pitch_call_script: asStr(fields.pitch_call_script),
  };
}

// Prepend a new snapshot to the session's history, seeding an "initial"
// snapshot from the session's current content the first time around.
export function pushVersion(
  session: PitchSession,
  newFields: {
    pitch_5min_script?: unknown;
    pitch_email?: unknown;
    pitch_call_script?: unknown;
  },
  source: PitchVersion["source"]
): PitchVersion[] {
  let versions = session.pitch_versions ? [...session.pitch_versions] : [];
  if (versions.length === 0) {
    versions = [makeVersion(session, "initial", session.created_at)];
  }
  return [makeVersion(newFields, source), ...versions].slice(0, MAX_VERSIONS);
}
