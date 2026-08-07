import { getDataMode } from "@/lib/dataMode";
import { isOfferingsOnly } from "@/lib/release";

/**
 * WHERE A SIGNED-IN PERSON BELONGS.
 *
 * There were two answers to this and they disagreed: /api/auth/resolve sent
 * you to /offerings, /login linked to /dashboard. Whichever door you came
 * through decided where you landed, and the public landing page never asked
 * the question at all — it showed a sign-in pitch to people who were already
 * signed in (Anir, Aug 7: "if I go to the dashboard page, why is it logging me
 * in? when I go to the landing page, why is it not? something's clearly
 * wrong").
 *
 * One answer now, and it respects the release gate: on the live workspace only
 * the offerings modules are released, so Offerings is home. Everywhere else
 * the full app is available and the dashboard is home.
 */
export function appHomePath(): string {
  return isOfferingsOnly(getDataMode()) ? "/offerings" : "/dashboard";
}
