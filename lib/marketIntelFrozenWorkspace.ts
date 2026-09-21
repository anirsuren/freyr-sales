import snapshot from "./marketIntelFrozenWorkspace.json";
import type { FeedCompany, FeedMeta, PersonFeed } from "./marketIntelFeed";
import type { MarketIntelTracking } from "./marketIntelTracking";

/**
 * A dated, committed copy of public Market Intelligence material. Mock mode
 * reads this file only; it never refreshes from the live workspace at runtime.
 */
const frozen = snapshot as unknown as {
  capturedAt: string;
  tracking: MarketIntelTracking;
  companies: Record<string, FeedCompany>;
  people: Record<string, PersonFeed>;
  meta: FeedMeta;
};

export const FROZEN_WORKSPACE_CAPTURED_AT = frozen.capturedAt;
export const FROZEN_WORKSPACE_TRACKING = frozen.tracking;
export const FROZEN_WORKSPACE_COMPANIES = frozen.companies;
export const FROZEN_WORKSPACE_PEOPLE = frozen.people;
export const FROZEN_WORKSPACE_META = frozen.meta;
