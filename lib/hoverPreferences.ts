/**
 * THE hover delay for this entire app — a constant, not a preference.
 *
 * Every contextual hover popup (people previews, row cards, folder and file
 * peeks, tooltips, expanding cards) waits exactly this long before opening.
 * Graph surfaces are the one exception: chart tips open instantly because
 * pointing at a data point is deliberate (Anir, Aug 8: "Literally every single
 * hover pop-up should be set to 1 second, as long as it's not a graph. If
 * it's a graph, it's immediate").
 *
 * There used to be a Settings card with an on/off toggle and a delay slider.
 * It is gone on the same instruction ("Remove the setting. We don't need the
 * fucking setting"), so nothing reads or writes a stored hover preference any
 * more — this constant is the entire policy.
 */
export const HOVER_DELAY_MS = 1000;
