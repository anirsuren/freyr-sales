/**
 * THE THREE CUSTOMER ROOMS, AND THEIR ADDRESSES.
 *
 * Plain module for the same reason lib/adminTabs is one: the routes validate
 * against this on the server and the pills draw from it on the client, and a
 * value exported from a "use client" component does not survive that crossing.
 */
export const CUSTOMER_TABS = ["customers", "groups", "targets"] as const;

export type CustomerRouteTab = (typeof CUSTOMER_TABS)[number];

/**
 * THE ADDRESS FOR EACH ROOM.
 *
 * Accounts is /customers itself rather than /customers/customers, and the
 * other two are static segments that deliberately sit beside /customers/[id]:
 * Next resolves a static segment before a dynamic sibling, so these win over
 * the customer-detail route. Customer ids are uuids, so neither word can ever
 * be a real record.
 */
export const CUSTOMER_TAB_PATH: Record<CustomerRouteTab, string> = {
  customers: "/customers",
  groups: "/customers/groups",
  targets: "/customers/targets",
};

/** What the browser tab says, per room. */
export const CUSTOMER_TAB_TITLE: Record<CustomerRouteTab, string> = {
  customers: "Customers",
  groups: "Customer groups",
  targets: "Targets",
};
