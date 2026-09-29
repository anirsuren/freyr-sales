# What the agent still cannot do

Written Sep 29 from the action registry in `lib/agentActions.ts` and the
WhatsApp bridge, after auditing all 55 actions. Every gap below was checked
against the code, not guessed. Ordered by what a sales team would miss first.

## 1. You cannot send the agent a file

The agent can now send documents and charts out over WhatsApp. Nothing comes
back the other way. `parseInboundMessages` in `lib/whatsapp.ts` reads only
`text` and `audio`, so a rep who photographs a signed page, or forwards the
countersigned PDF, gets "I can read text and voice notes here."

The pieces already exist: `downloadWhatsAppMedia` fetches any media id, and
every module has an upload route that the upload smoke test exercises daily.
What is missing is the parse, and a sentence deciding where the file belongs.

Worth it because it closes the loop on the thing Anir asked for on Sep 28: the
deck goes out by text, the signed contract should come back the same way.

## 2. Offerings has no actions at all

Zero of the 55 touch `/offerings`, the module Suren calls number one. The agent
reads the catalogue, answers questions about materials, and now delivers them,
but it cannot change one thing:

- mark an offering available, or move its date
- add, replace or retire a material
- add or remove an owner

Anyone who can edit an offering in the app must open the app to do it.

## 3. FDL Components has no actions

Same shape as Offerings, and the same answer: read yes, change no.

## 4. Contacts, Team, Reports and Goals have no actions of their own

Contacts are reachable through the customer actions (add a contact at an
account, change a contact's details), so that gap is partly covered. Team and
Reports are read-only modules for almost every role, so this is arguably
correct. Goals are covered by the fourteen Performance actions.

## 5. Three actions are checked only when proposed

Set a follow-up, Log a touch and Save a draft run in-process rather than
through a route, so the permission question is asked when the action is
proposed and not again when it is confirmed. Every other action is re-checked
by the route it calls. A permission removed between proposing and confirming
would not be noticed.

## Not gaps, checked and correct

- Star a company and Take a company off your list reach a route that only
  verifies who you are. That store holds one list per person and writes only
  to the caller's own row, so there is no workspace write to gate.
- A Solutioning Member is refused by the agent outright, entities and converse
  both 403, so they cannot reach any of this.
