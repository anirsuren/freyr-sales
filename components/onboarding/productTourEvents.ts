export const ONBOARDING_START_EVENT = "freyr:onboarding:start";

export type OnboardingStartDetail = {
  restart?: boolean;
  /**
   * Go straight into the first step. Without it the tour opens on its welcome
   * card ("Begin onboarding") so nobody is dropped into a spotlight cold.
   */
  skipWelcome?: boolean;
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

/**
 * THE TOUR OPENS THE BELL (Anir, Oct 1: "The notifications didn't even load
 * until I clicked on it"). The top bar owns the panel; the tour asks for it
 * through this event instead of reaching into another component's state.
 */
export const NOTIFICATIONS_PANEL_EVENT = "freyr:notifications:panel";

export type NotificationsPanelDetail = { open: boolean };

export function requestNotificationsPanel(open: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<NotificationsPanelDetail>(NOTIFICATIONS_PANEL_EVENT, {
      detail: { open },
    })
  );
}

/** Ask the top bar to fetch the bell again, e.g. after the tour is finished. */
export const NOTIFICATIONS_REFRESH_EVENT = "freyr:notifications:refresh";

export function requestNotificationsRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT));
}
