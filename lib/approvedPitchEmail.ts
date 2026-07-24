import type { PitchSession } from "./types";

export type ApprovedPitchEmail = {
  subject: string;
  body: string;
};

type PitchEmailShape = {
  subject_lines?: unknown;
  body?: unknown;
};

/**
 * Resolve the exact email content stored on an approved pitch. Outbound routes
 * use this server-side value rather than trusting browser-supplied copy.
 */
export function approvedPitchEmail(
  value: PitchSession["pitch_email"],
  requestedSubject?: unknown
): ApprovedPitchEmail | null {
  let parsed: PitchEmailShape;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as PitchEmailShape;
    } catch {
      return null;
    }
  } else {
    parsed = value as PitchEmailShape;
  }

  const subjects = Array.isArray(parsed?.subject_lines)
    ? parsed.subject_lines
        .filter(
          (item): item is string => typeof item === "string" && !!item.trim()
        )
        .map((item) => item.trim())
    : [];
  const requested =
    typeof requestedSubject === "string" ? requestedSubject.trim() : null;
  const subject =
    requestedSubject === undefined
      ? subjects[0] || ""
      : requested && subjects.includes(requested)
        ? requested
        : "";
  const body = typeof parsed?.body === "string" ? parsed.body : "";
  return subject && body.trim() ? { subject, body } : null;
}

function normalizeBody(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function matchesApprovedPitchEmail(
  approved: ApprovedPitchEmail,
  requestedSubject: unknown,
  requestedBody: unknown
): boolean {
  const subjectMatches =
    requestedSubject === undefined ||
    (typeof requestedSubject === "string" &&
      requestedSubject.trim() === approved.subject);
  const bodyMatches =
    requestedBody === undefined ||
    (typeof requestedBody === "string" &&
      normalizeBody(requestedBody) === normalizeBody(approved.body));
  return subjectMatches && bodyMatches;
}

export function isDeliverableEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}
