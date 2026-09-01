import type { Customer360Band } from "./customer360Shared";

/**
 * THE ORDER THE TABS COME IN, IN ONE PLACE.
 *
 * Suren, Aug 28, dictating it: "the tab should be customers, that's number
 * one, and then bring closer the contracts... third is opportunities... and
 * see these contacts and then I want to be able to see the submissions", then
 * writing the same thing as a grid (Untitled spreadsheet, Sheet1): the columns
 * run Customer, Team, Contract, Offerings, Opportunities, Submissions,
 * Presentations, Meetings, Solution Requests.
 *
 * "So this is like the order in which I need everything to be shown."
 *
 * Every page that draws a connection strip reads this list, so the customer
 * page, the deal, the contract and the person all present their connections in
 * the same sequence. Three files ordering themselves by hand is three files
 * that drift.
 *
 * TEAM COMES FIRST ON A RECORD. On his grid Team sits second, after the
 * Customer column — but the Customer column is only ever filled in for pages
 * that are NOT a customer (an offering lists its customers; a customer does
 * not list itself). So on the pages that have one, Team leads: "let's say if
 * I'm in a customer page, then tab is the team. Team wins."
 *
 * Anything not on his list keeps working and sorts after it, rather than being
 * dropped — removing a band nobody asked me to remove is not my call.
 */
export const CONNECTION_ORDER = [
  "customers",
  "team",
  "contracts",
  "offerings",
  "opportunities",
  /* Where he said it out loud: "third is opportunities... and see these
     contacts and then I want to be able to see the submissions". His written
     grid has no Contacts column at all, so the spoken order is the only
     instruction there is for it. */
  "contacts",
  "submissions",
  "presentations",
  "meetings",
  /* Last, exactly where his grid puts it: the columns run ... Submissions,
     Presentations, Meetings, Solution Requests. */
  "solutionRequests",
  "meetingRequests",
  "goals",
] as const;

export function orderBands(bands: Customer360Band[]): Customer360Band[] {
  const rank = (key: string) => {
    const i = (CONNECTION_ORDER as readonly string[]).indexOf(key);
    return i === -1 ? CONNECTION_ORDER.length : i;
  };
  return [...bands].sort((a, b) => rank(a.key) - rank(b.key));
}

/**
 * THE DEAL READS ITS OWN ORDER (Suren, Sep 1, on the opportunity page: "the
 * order needs to be a little changed. Contracts can come at the end, and those
 * requests should come earlier — solution request meeting, submissions,
 * presentations, meetings they're doing").
 *
 * This is deliberately NOT the shared sequence above. That one is his Aug 28
 * grid and still governs the customer, contract and person pages, which he did
 * not ask me to touch. On a deal the flow is what was ASKED for, then what was
 * produced, then what was held, and the signed paper last — so contracts moves
 * from third to last and the two request bands come to the front.
 *
 * Anything not named here keeps working and sorts after, same as above.
 */
export const DEAL_CONNECTION_ORDER = [
  "solutionRequests",
  "meetingRequests",
  "submissions",
  "presentations",
  "meetings",
  "revenueAccruals",
  "contracts",
] as const;

export function orderDealBands(bands: Customer360Band[]): Customer360Band[] {
  const rank = (key: string) => {
    const i = (DEAL_CONNECTION_ORDER as readonly string[]).indexOf(key);
    return i === -1 ? DEAL_CONNECTION_ORDER.length : i;
  };
  return [...bands].sort((a, b) => rank(a.key) - rank(b.key));
}
