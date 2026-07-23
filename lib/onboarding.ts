import type { WorkspaceRole } from "./accessControl";

/** Increment only when the onboarding flow changes incompatibly. */
export const TOUR_VERSION = 2;

/** Onboarding step indexes are zero-based. */
export const TOUR_FIRST_STEP = 0;
// The persisted number is the canonical PRODUCT_TOUR_STEPS index, never the
// index of a role- or release-filtered path. Reordering existing catalog steps
// requires incrementing TOUR_VERSION so stored progress is not reinterpreted.
export const TOUR_LAST_STEP = 127;

export type OnboardingStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "skipped";

export type OnboardingState = {
  version: number;
  status: OnboardingStatus;
  currentStep: number;
  completedAt?: string;
  skippedAt?: string;
};

export type OnboardingResponse = {
  state: OnboardingState;
  role: WorkspaceRole;
};

export type OnboardingAction =
  | { action: "progress"; currentStep: number }
  | { action: "complete"; currentStep?: number }
  | { action: "skip"; currentStep?: number }
  | { action: "reset" };

export type StoredOnboardingState = {
  version: number;
  status: Exclude<OnboardingStatus, "not_started">;
  current_step: number;
  completed_at: string | null;
  skipped_at: string | null;
};

export class OnboardingValidationError extends Error {}

export function notStartedOnboardingState(): OnboardingState {
  return {
    version: TOUR_VERSION,
    status: "not_started",
    currentStep: TOUR_FIRST_STEP,
  };
}

export function presentOnboardingState(
  stored: StoredOnboardingState | null
): OnboardingState {
  if (!stored) return notStartedOnboardingState();

  const state: OnboardingState = {
    version: stored.version,
    status: stored.status,
    currentStep: stored.current_step,
  };
  if (stored.completed_at) state.completedAt = stored.completed_at;
  if (stored.skipped_at) state.skippedAt = stored.skipped_at;
  return state;
}

function validStep(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    Number(value) >= TOUR_FIRST_STEP &&
    Number(value) <= TOUR_LAST_STEP
  );
}

export function parseOnboardingAction(value: unknown): OnboardingAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OnboardingValidationError("Enter a valid onboarding action.");
  }

  const body = value as { action?: unknown; currentStep?: unknown };
  if (
    body.action !== "progress" &&
    body.action !== "complete" &&
    body.action !== "skip" &&
    body.action !== "reset"
  ) {
    throw new OnboardingValidationError("Unsupported onboarding action.");
  }

  if (body.action === "reset") {
    if (body.currentStep !== undefined) {
      throw new OnboardingValidationError(
        "Reset does not accept a current step."
      );
    }
    return { action: "reset" };
  }

  if (body.action === "progress") {
    if (!validStep(body.currentStep)) {
      throw new OnboardingValidationError(
        `Current step must be between ${TOUR_FIRST_STEP} and ${TOUR_LAST_STEP}.`
      );
    }
    return { action: "progress", currentStep: body.currentStep };
  }

  if (body.currentStep !== undefined && !validStep(body.currentStep)) {
    throw new OnboardingValidationError(
      `Current step must be between ${TOUR_FIRST_STEP} and ${TOUR_LAST_STEP}.`
    );
  }
  return body.currentStep === undefined
    ? { action: body.action }
    : { action: body.action, currentStep: body.currentStep };
}
