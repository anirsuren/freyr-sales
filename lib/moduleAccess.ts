import type { UserIdentityRole } from "./userIdentity";

/**
 * WHO CAN OPEN WHICH MODULE (Freyr, Aug 12, via Anir).
 *
 *   Everyone (Sales Reps, Managers, Admins) — AI Agent, Offerings, Team,
 *   Performance, Opportunities, Market Intel.
 *   Managers and Admins only — FDL Components, Customers, Reports.
 *
 * Roles in this app: "rep" = Sales Rep, "manager" = Manager, "admin" =
 * Admin. This is a VISIBILITY *and* ACCESS rule: the sidebar hides what a rep
 * may not open, and every restricted page re-checks on the server, so typing
 * the URL is not a way in.
 */

export const MANAGER_ONLY_MODULES = [
  "/components",
  "/customers",
  "/reports",
] as const;

/**
 * WHAT A SALES REP GETS. A WHITELIST, NOT A BLACKLIST.
 *
 * Anir, Aug 16: "for reps, it should only be agent, offerings, team. Just
 * those three pages."
 *
 * The rule above has said this since Aug 12, but the code only ever named the
 * five manager-only modules, so everything nobody thought to list — dashboard,
 * pipeline, forecast, opportunities, contacts, sessions, sequences, campaigns,
 * voice agents, tasks, analytics, activity — was open to reps by default. A
 * blacklist grows a hole every time a module ships. This closes by default.
 *
 * PERFORMANCE AND OPPORTUNITIES REOPENED (Anir, Aug 19: "yes open it"). A rep
 * who could not open either could not log their own result or see their own
 * deal — every number had to be entered on their behalf by a manager, which
 * is not what a sales team does. Performance already scopes a non-manager to
 * themselves plus any group they head, so a rep sees their own goals and
 * nobody else's; writing is still checked per operation on the server.
 */
export const REP_MODULES = [
  "/agent",
  "/offerings",
  "/team",
  "/performance",
  /* The same page under the name Suren gave it on Aug 25. /goals redirects
     to /performance, so it has to be reachable by everyone /performance is. */
  "/goals",
  "/opportunities",
] as const;

/**
 * SOLUTIONING IS ADMIN-ONLY UNTIL ANIR SAYS OTHERWISE (Anir, Aug 25, on
 * seeing it in a rep's sidebar: "you can't have a Solutioning module, bro. You
 * have to hide this for reps... when I ask you to add a new module, you have
 * to hide it for reps, only usable by admin").
 *
 * Suren's Aug 24 transcript describes reps raising the requests, and the
 * module is built for exactly that. Anir owns what ships to whom, and a NEW
 * module now starts closed: admins, plus the Solutions role, whose entire job
 * is this room and which nobody holds until an admin assigns it. Opening it to
 * reps and managers later is putting "/solutioning" back in REP_MODULES and
 * deleting this gate.
 *
 * Same shape as TEAM_ADMIN_ONLY below: a module is admin-only while it is new,
 * not because of what it does.
 */
export const SOLUTIONING_ADMIN_ONLY = true;

/**
 * EVERY MODULE THAT SHIPPED ON AUG 25 STARTS CLOSED — the standing rule Anir
 * set that same day, on seeing Solutioning in a rep's sidebar: "when I ask you
 * to add a new module, you have to hide it for reps, only usable by admin."
 *
 * Leads, Revenue Accruals and Contracts are all brand new and all built from
 * Suren's Aug 25 call. Whether a rep ever sees them is Anir's decision, not
 * mine; opening one is deleting its path from this list.
 */
export const NEW_MODULES_ADMIN_ONLY = [
  "/leads",
  "/revenue-accruals",
  "/contracts",
  /* Meetings, built from Suren's Aug 28 walkthrough. Same standing rule: a
     module starts closed and Anir decides when reps see it. */
  "/meetings",
] as const;

/**
 * MARKET INTEL IS CLOSED TO REPS AGAIN (Anir, Aug 25: "can we hide the Market
 * Intel module for everybody with rep access? Let's do that ASAP").
 *
 * He opened it to them on Aug 20 — "I think they should be able to see market
 * intel" — and closed it again after watching a rep's screen on the Aug 25
 * call. Both calls are his; this is the current one. The module still ships
 * for managers and admins, and re-opening it is putting "/market-intel" back
 * in the list above.
 */

/**
 * TEAM IS NOT FINISHED, SO NOBODY BUT ADMINS SEES IT YET (Anir, Aug 16: "the
 * Teams page probably should not show up until it's finalized. It shouldn't
 * show up for anyone other than admins").
 *
 * It stays in REP_MODULES because that IS the standing rule for reps — this
 * flag is the only thing holding it back, so finishing the page is one line:
 * set this to false.
 */
export const TEAM_ADMIN_ONLY = false;

export function isManagerOrAdmin(role: UserIdentityRole): boolean {
  return role === "admin" || role === "manager";
}

/**
 * WHAT THE SOLUTIONS ROLE OPENS (Suren, Aug 24: "the solutioning guy will not
 * come to the customer module, he'll come to the solutioning module").
 *
 * Their room, plus the three every role gets: the assistant, the offerings
 * catalogue their decks are built from, and the team directory. Nothing
 * manager-only, no customers, no pipeline — a solutions person is not sales.
 */
export const SOLUTIONS_MODULES = [
  "/solutioning",
  "/agent",
  "/offerings",
  "/team",
] as const;

/** Does this path belong to a manager-and-admin-only module? */
export function isManagerOnlyPath(path: string): boolean {
  return MANAGER_ONLY_MODULES.some(
    (m) => path === m || path.startsWith(`${m}/`) || path.startsWith(`${m}?`)
  );
}

/** The one question every nav item and every guarded page asks. */
export function canAccessModule(
  path: string,
  role: UserIdentityRole
): boolean {
  // Running the workspace is an ADMIN job — not a manager one.
  if (path === "/admin" || path.startsWith("/admin/")) return role === "admin";
  if (TEAM_ADMIN_ONLY && isUnder(path, "/team")) return role === "admin";
  // Ahead of every other rule, including the rep whitelist and the manager
  // default, so no role picks it up by being none of the above.
  if (SOLUTIONING_ADMIN_ONLY && isUnder(path, "/solutioning")) {
    return role === "admin" || role === "solutions";
  }
  // Same rule, same place in the order: ahead of the rep whitelist and the
  // manager default, so nothing picks these up by being none of the above.
  if (NEW_MODULES_ADMIN_ONLY.some((m) => isUnder(path, m))) {
    return role === "admin";
  }
  // Signing in, your own settings, the notification list, the tour: these are
  // not modules and locking a rep out of them would lock them out of the app.
  if (isAlwaysOpen(path)) return true;
  // A rep gets exactly the modules on that list, and nothing gets added to it
  // by being built later.
  if (role === "rep") return REP_MODULES.some((m) => isUnder(path, m));
  if (role === "solutions")
    return SOLUTIONS_MODULES.some((m) => isUnder(path, m));
  if (!isManagerOnlyPath(path)) return true;
  return isManagerOrAdmin(role);
}

/**
 * NOT MODULES. Everyone signed in reaches these whatever their role: the
 * sign-in and recovery pages, your own settings, your notifications, the tour,
 * the search results page, and the waiting room. Same list the release gate
 * keeps (lib/release NON_MODULE_PATHS) plus the in-app tools that hang off a
 * module rather than being one.
 */
const ALWAYS_OPEN = [
  "/login",
  "/auth",
  "/access-pending",
  "/onboarding",
  "/settings",
  "/notifications",
  "/search",
] as const;

function isAlwaysOpen(path: string): boolean {
  return ALWAYS_OPEN.some((p) => isUnder(path, p));
}

/** `/team`, `/team/`, `/team/anir`, `/team?x=1` — but never `/teams-report`. */
function isUnder(path: string, module: string): boolean {
  return (
    path === module ||
    path.startsWith(`${module}/`) ||
    path.startsWith(`${module}?`)
  );
}
