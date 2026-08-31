/**
 * THE FIVE ADMIN ROOMS, AND THEIR ADDRESSES.
 *
 * Plain module on purpose. This list has to be readable from the server (the
 * routes under app/admin validate against it) and from the client (AdminTabs
 * draws the pills), and a value exported from a "use client" component reaches
 * a server component as a client reference, not as the array — importing it
 * there gave "ADMIN_TABS.includes is not a function" on every /admin/<tab>
 * address until this moved out.
 */
export const ADMIN_TABS = [
  "members",
  "groups",
  "privileges",
  "activity",
  "email",
] as const;

export type AdminRouteTab = (typeof ADMIN_TABS)[number];

/** What the browser tab says, per room. */
export const ADMIN_TAB_TITLE: Record<AdminRouteTab, string> = {
  members: "Team members",
  groups: "User groups",
  privileges: "Privileges",
  activity: "Activity master",
  email: "Email",
};
