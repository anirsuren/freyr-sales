export const ONBOARDING_START_EVENT = "freyr:onboarding:start";

export type OnboardingStartDetail = {
  restart?: boolean;
};

export function requestProductTourStart(
  detail: OnboardingStartDetail = {}
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OnboardingStartDetail>(ONBOARDING_START_EVENT, {
      detail,
    })
  );
}
