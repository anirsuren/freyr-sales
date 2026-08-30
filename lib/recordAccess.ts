import { teamFor, type RecordTeamsState, type TeamedRecord } from "./recordTeams";
import {
  accessForPrivileges,
  canCreate,
  canEdit,
  privilegesForPerson,
  type ModuleKey,
  type PrivilegeState,
} from "./privileges";

/**
 * WHAT A PERSON MAY DO TO ONE RECORD, not to a module.
 *
 * Suren, Aug 30: "an opportunity can be created only by an owner. Once an
 * opportunity is created, only these two people who are in the opportunity can
 * do something. The rest of the people only view… if you are not connected to
 * the account, are not a member, or are not an owner, then none of these
 * privileges are applicable for that account."
 *
 * Two things were already built and never wired to each other:
 *
 *  - **lib/privileges** answers "what may this person do in this MODULE" —
 *    none / view / edit / create, where create is an owner and edit is a
 *    member. That part of his rule was already right.
 *  - **lib/recordTeams** records who is the owner of one customer or one
 *    opportunity and who else is on it. Its own note said, in as many words,
 *    that it grants nothing and nothing reads it to decide access.
 *
 * This is the join. A privilege is a licence to act *somewhere*; being on the
 * record is what says *here*. Holding "edit" on Opportunities no longer means
 * you may edit ANY opportunity — it means you may edit the ones you are on,
 * under a customer you are on.
 *
 * THE CUSTOMER IS THE OUTER GATE. His words: not connected to the account, and
 * none of it applies. So a person on a deal but not on its account cannot
 * write to the deal — the account decides first, and the deal decides second.
 */

export type RecordVerdict = {
  mayView: boolean;
  mayEdit: boolean;
  mayCreate: boolean;
  /** Plain-English reason, shown behind the (?) on the page. */
  why: string;
};

function onTeam(
  teams: RecordTeamsState,
  type: TeamedRecord,
  id: string | undefined,
  person: string
): boolean {
  if (!id) return false;
  const team = teamFor(teams, type, id);
  if (!team) return false;
  const me = person.trim().toLowerCase();
  const is = (n?: string) => (n ?? "").trim().toLowerCase() === me;
  return is(team.owner) || (team.members ?? []).some(is);
}

/**
 * UNASSIGNED RECORDS ARE OPEN TO WHOEVER MAY WRITE THE MODULE.
 *
 * Nothing in the app has ever assigned a customer team, so gating on one today
 * would freeze every account for everybody — a rule that locks out the whole
 * company on the day it ships is not the rule he described. A record with NO
 * team recorded falls back to the module answer; the moment somebody is put on
 * it, it starts gating. That is also why teamFor returning nothing is treated
 * differently from an empty team.
 */
export function mayTouchOpportunity(input: {
  privileges: PrivilegeState;
  teams: RecordTeamsState;
  person: string;
  role: string;
  opportunityId: string;
  customerId?: string;
}): RecordVerdict {
  const { privileges, teams, person, role, opportunityId, customerId } = input;

  /* An admin runs the workspace itself; locking them out of a record they are
     not on would leave nobody able to fix a wrongly-assigned one. Flagged on
     the page so it can be taken away if he wants it taken away. */
  if (role === "admin")
    return {
      mayView: true,
      mayEdit: true,
      mayCreate: true,
      why: "You are a workspace admin, so this is editable regardless of who is on the deal or the account.",
    };

  const held = privilegesForPerson(privileges, person);
  const moduleAccess = accessForPrivileges(privileges, held, "opportunities" as ModuleKey);
  if (moduleAccess === "none")
    return {
      mayView: false,
      mayEdit: false,
      mayCreate: false,
      why: "Your privileges do not open the Opportunities module.",
    };

  const customerTeam = customerId ? teamFor(teams, "customer", customerId) : null;
  const dealTeam = teamFor(teams, "opportunity", opportunityId);

  /* THE ACCOUNT DECIDES FIRST. */
  if (customerTeam && !onTeam(teams, "customer", customerId, person))
    return {
      mayView: true,
      mayEdit: false,
      mayCreate: false,
      why: "This account has a team and you are not on it, so nothing under it is editable for you — the account decides before the deal does.",
    };

  if (dealTeam && !onTeam(teams, "opportunity", opportunityId, person))
    return {
      mayView: true,
      mayEdit: false,
      mayCreate: false,
      why: "This deal has an owner and a team, and you are not on it. Only the people on a deal can change it.",
    };

  return {
    mayView: true,
    mayEdit: canEdit(moduleAccess),
    mayCreate: canCreate(moduleAccess),
    why: canEdit(moduleAccess)
      ? dealTeam
        ? "You are on this deal and your privileges allow editing."
        : "Nobody has been put on this deal yet, so your Opportunities privilege decides — and it allows editing."
      : "Your Opportunities privilege is view-only.",
  };
}
