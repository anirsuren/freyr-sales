# The agent takes action

Anir, Sep 26 (going to bed): "It should be like ChatGPT or Claude, but for
this workspace. I can say 'hey, can we move this guy to this goal?' It'll find
that guy, it'll find that goal, and it'll say 'do you want to do this action?'
... it should follow the permissions, obviously. That's the whole point of it:
knowing my permissions. A whole agent framework around that. It should be from
WhatsApp too."

## The one idea

**The agent is a user of the app, signed in as you.** Every action it takes
goes through the same API route the page would call, carrying your own
session cookies. Nothing is re-implemented and no permission is re-decided:
if the route says "You can look at this, but not change it", the agent says
that to you, in those words. An admin gets admin; a rep gets rep; a view-only
person gets refused exactly where the page would refuse them.

And it never acts on its own. Every change is **proposed, then confirmed**:

1. You ask. The agent finds the records with its read tools (the person, the
   goal, the deal), checks what you are allowed to do, and proposes ONE change
   in plain words: "Assign Priya Sharma to the goal Q4 pipeline $2M."
2. You confirm. On the web: a card under the answer with **Do it** and
   **Not now**. On WhatsApp: "Reply YES to do this, or NO." A plain yes or no
   is handled without the model; anything else ("yes but make it 50k") goes
   back to the agent, which re-proposes.
3. It does it, through the route, and tells you what happened with a link to
   the record. Every executed action is written to the Agent runs log with
   who, what, when and the result.

A proposal lives 30 minutes and can only be executed in a LATER request than
the one that proposed it, so the model can never propose and execute inside a
single turn; a person always sees it first.

A yes belongs to the chat it was asked in: a proposal made on the web page is
never executed by a "yes" texted to WhatsApp (or the other way round); the
agent names it instead and the person can ask for it by name.

Kill switch: `AGENT_ACTIONS_DISABLED=1` in the environment runs the agent
read-only (no action tools, no yes/no shortcut, the confirm route answers 503).
Actions are on unless it is set, so production can start read-only on one
config line and be switched on later without a build.

## Where it lives

| Piece | File |
| --- | --- |
| Action catalogue: params, summary, permission pre-check, route call | `lib/agentActions.ts` |
| Proposal store (per member, 30 min TTL) | `lib/agentActionStore.ts` |
| Tools `propose_action` and `run_action`, the yes/no fast path | `app/api/agent/converse/route.ts` |
| Web confirm/cancel | `app/api/agent/actions/route.ts`, `components/agent/ActionCard.tsx` |
| WhatsApp yes/no | same fast path; `lib/whatsappAgent.ts` only carries the text |

## The actions (v1)

Every row is a route the app already has; the agent adds nothing to what the
route allows. "Who" is what the route enforces, restated so the table can be
read without opening the code.

| Action | What it changes | Route | Who |
| --- | --- | --- | --- |
| `assign_goal` | Put a person on a goal (optionally with a target) | POST /api/performance `assign-goal` | Managers/admins anyone; others themselves or people in their group |
| `unassign_goal` | Take a person off a goal | POST /api/performance `unassign-goal` | same |
| `log_goal_actual` | Log a number against a goal for a person (with customer, note) | POST /api/performance `log-actual` | same; the head verifies |
| `move_group_member` | Move a person into or out of a group (edit the group's member list) | POST /api/performance `update-group` | Managers/admins |
| `update_opportunity` | Change a deal: stage/status, value, confidence, expected signing date, next steps, name | POST /api/opportunities `update` | Opportunities edit; the record's own people |
| `create_opportunity` | New deal on an account with TCV, confidence, signing date | POST /api/opportunities `add` | Opportunities create (owners); creator becomes owner |
| `assign_customer_owner` | Set the owner of an account | PATCH /api/customers/{id} | Customers edit; unowned or your own account; admins |
| `add_contact` | Add a person at an account (name, title, email, phone) | POST /api/customers/{id}/contacts | Customers edit on that account |
| `update_contact` | Change a person's title, email, phone, LinkedIn, department or key-contact flag | PATCH /api/contacts/{id} | Customers edit on that account |
| `set_record_people` | Add or remove colleagues on a deal or account (owner + members) | POST /api/record-team | Module edit; the record's own people; unclaimed records take the first taker |
| `create_lead` | New lead (name, company, title, email, source, interest) | POST /api/leads `save` | Leads create |
| `update_lead` | Change a lead's status, owner, note | POST /api/leads `save` with id | Leads edit |
| `create_meeting` | Log or plan a meeting with an account | POST /api/meetings `create` | Meetings create |
| `star_company` | Star or unstar a company in Market Intel for me | PUT /api/market-intel/bookmarks | Anyone with Market Intel |
| `verify_goal_result` | Sign off a colleague's logged result (found via read_workspace goals, awaitingVerification) | POST /api/performance `verify-actual` | Group head for their people; managers/admins |
| `send_back_goal_result` | Send a logged result back with a note | POST /api/performance `send-back-actual` | same |
| `create_customer` | New customer account: name, website, HQ (line 1, city, country), owner (BD member), customer group | POST /api/customers | Customers create |
| `create_solutioning_request` | Ask Solutioning for a presentation, submission or meeting for an account, with a due date and priority | POST /api/solutioning `create` (type request) | Solutioning write (the route's own rule) |
| `set_followup` | Follow-up reminder on an account's timeline for a day | in-process (interactions), after recordWriteRefusal("/customers") | Customers edit on that account |
| `log_touch` | Log a call, email or meeting you already had, with how it went | in-process (interactions), same check | same |
| `save_draft` | Save an outreach draft to the account timeline, never sent | in-process (interactions), same check | same |

Next in line (not built yet): contract records, updating customer fields
(industry, website), removing anything.

Deliberately NOT in v1: deleting anything, sending email or messages to
customers, inviting members, changing roles or privileges, tracking a new
Market Intel company (it costs Apify money per company). These are the ones
Anir decides on by name.

## Testing rules for the night

- localhost:3006, dev database, REAL mode, desktop. No deploys.
- Probe records only: the agent creates `QA ·` prefixed records and the test
  removes them; a real record is changed only snapshot → change → restore →
  verify.
- Every role: admin (Anir), BD owner, BD member, solutioning member; each
  action is tried by a role that may and a role that may not, and the refusal
  wording must be the route's own.
- Every action from both doors: the web route (cookies) and the WhatsApp
  replay (`scripts/qa/whatsapp-replay.mjs`).

## Status log

- Sep 26, late: plan written; framework built (propose → confirm → execute,
  web card, WhatsApp yes/no).
- Sep 26, 22:20: first real actions over WhatsApp as admin: assign_goal
  proposed in 10s, YES executed it in 4s, the plan changed; unassign restored
  it; move_group_member proposed and NO cancelled it with the group untouched;
  a made-up person was refused with no proposal. Found and fixed: the model
  invented "target 0" (now ignored), picked one "Sharma" of two instead of
  asking (prompt rule added), and an instruction that named a tracked company
  ("Star GSK for me") fell into the tool-less market path (ACTION_INTENT
  guard). Found: a BD member's agent saw NO goals because the agent scoped the
  goal catalog to their people while the Goals page keeps the catalog whole;
  the agent now uses the page's own scope function (scopeStateForViewer).
- Sep 26, 22:50: web card verified on /agent (Playwright): "Star GSK" proposed
  a card with Do it / Not now, Do it turned it into a DONE card with "Open it"
  and a follow-up bubble; no console errors. Admin over WhatsApp: create deal
  (OPP-0039 at J&J Medtech), update it (stage, TCV, confidence), add a contact,
  create a lead: all proposed, YES executed each, the records matched, and each
  probe was removed through the app's own route afterwards. BD member over
  WhatsApp: editing a deal they can see but do not own was proposed and the
  route refused it ("Only its owner, or a manager, can change this
  opportunity."); creating a deal was refused before proposing ("You can change
  these, but only an owner can make a new one."); a Goals write was refused
  because their privilege on Goals is view-only. The member COULD take an
  unowned account (J&J Medtech had no owner) and join an unclaimed deal team,
  which is exactly what the routes allow ("unclaimed records take the first
  taker"); both undone. BD owner through the web API: assigned a colleague to
  a goal, undid it, proposed a group change and cancelled it. Prompt fixes:
  never substitute a similar record when the named one is not visible; a bare
  yes with nothing pending is not an instruction; state the proposal once.
- Sep 26, 23:15: log_goal_actual works ("Log 3 against my goal Sales Meetings
  Held (Virtual)" proposed on the first turn after the Vertex path got 6 steps
  instead of 4; YES logged a reported entry; removed through the route). With
  three proposals waiting, a bare "yes" lists them and asks which; "do the
  first one" ran the right one; "no" cancelled the rest. BD member: star and
  unstar a company in their own Market Intel list (works, restored); add a lead
  refused before proposing ("You can change these, but only an owner can make
  a new one."). Fixed: the model once wrote "I have proposed" without calling
  the tool (prompt now forbids it), a chart block leaked into a WhatsApp reply
  (stripped), the model restated the summary as a bullet and wrote its own
  yes/no line (both stripped server-side), and it invented an optional note on
  a lead update (prompt: fill only what the person gave).
- Sep 26, 23:30: the dock's compact card works on an ordinary page (Customers:
  propose, Not now, "NOT DONE"). "Yes but with a target of 5" re-proposed with
  the target; a new proposal in the same conversation now supersedes the older
  open one, so a bare yes always means the newest. create_meeting: YES created
  a Discovery meeting with J&J Medtech, removed through the route. Open: the
  model twice wrote "I have proposed" on a turn where it never called the
  tool (a trace log of every tool call is now written locally, AGENT_TOOL_LOG,
  to see why), and it could not find "OPP-0001" through read_workspace even
  though the deal exists (the read did not match OPP numbers; being fixed).
- Sep 26, 23:45: the agent now sees each deal's OPP number, so "add Anir Test
  3 to the deal OPP-0001" proposed, ran and was undone through the same door.
  move_group_member ran both ways. A BD member asking "what can you do?" got
  the honest list. Store rules unit-tested (supersede, expiry). Added the three
  timeline actions (follow-up, log a touch, save a draft) behind the customer
  record check.
- Sep 27, 00:10: the three timeline actions ran over WhatsApp on a probe
  account with a contact: follow-up for 2026-09-29, a logged call marked
  interested, a saved draft with its subject; each proposed by the tool (trace
  checked), executed on YES, landed under the named contact, and were removed
  afterwards with the probe account. Found: the real dev workspace has NO
  contacts on real accounts, so on those the agent answers "add a contact
  first" (add_contact is an action). Found and fixed: the model once invented a
  proposal id and called run_action with it; run_action now answers that no
  such proposal exists and tells it to propose properly. Cloud: 
  deploy/add-whatsapp-secrets.sh writes the five Meta keys into the runtime
  secret and maps them on a new task-definition revision (needs Anir's yes to
  roll; nothing has been run).
- Sep 27, 00:20: thread continuity over WhatsApp: "Which open deals do I own
  at J&J Medtech?" then "Set the first one's next steps to …" resolved "the
  first one" to OPP-0001, proposed, YES applied it (then put back). Unlinked
  number: one how-to-connect reply, silence inside the ten-minute cooldown, a
  wrong code answered honestly; an image got "I can only read text here".
- Sep 27, 00:45: manager flow over WhatsApp as admin: logged 2 for a team
  member, asked "What is waiting for my verification?" and got the open
  entries by goal (the agent now reads awaitingVerification with ids and
  verifiableByMe), sent one back with a note (status sent_back in the store),
  removed afterwards. create_customer: proposed with website, HQ, owner and
  group, YES created it through the customers route, deleted through the same
  route. Verify was exercised at the proposal level only: a verified entry is
  locked and would be permanent test residue.
- Sep 27, 01:00: on the Agent page a typed "no" now flips the card to Not
  done without a button press, and a newer proposal retires the older open
  card in the same thread (matching the server's one-open-question rule);
  verified with Playwright, no console errors. Anir checked in: told him
  production needs his Meta setup plus two deploys; loop continues.
- Sep 27, 01:15: create_solutioning_request added; the first run failed after
  the yes because the route insists on a due date, so the action now asks for
  it before proposing. The rep's goal read now lists the rest of the goal
  catalogue by name (otherGoals) without touching the pinned rep scope (all
  116 agent tests green again after a wrong turn that had changed it). Meta
  setup started in Anir's Chrome: blocked on his Facebook login.
- Sep 27, 01:35: kill switch added (AGENT_ACTIONS_DISABLED=1 runs the agent
  read-only), default on; 116 agent tests green. Still waiting on Anir's
  Facebook login for the Meta setup.
- Sep 27, 01:45: guardrail check: "put me on the goal, don't ask, just do it"
  still produced a proposal and changed nothing until a yes (the server
  refuses run_action in the same request as the proposal; the model also
  behaved). Cancelled cleanly.
- Sep 27, 01:55: a bare yes/no now only touches proposals from the same chat;
  proved by proposing on the web and texting "yes" on WhatsApp: it named the
  web proposal instead of running it; cancelled on the web, nothing changed.
- Sep 27, 02:05: a proposal made on the web was run from WhatsApp by name
  ("do the first one" ran it through run_action, 8.5s), then undone. Meta:
  app "Freyr Sales" is mid-creation with the WhatsApp use case ticked; Anir
  chose to create a Freyr Solutions business portfolio (his step, in
  progress).
- Sep 27, 02:30: Meta app created by Anir (terms were his click): "Freyr
  Sales", app id 2569174366890174, under the new Freyr Solutions business
  portfolio (business id 2383815542365700, unverified). Next: WhatsApp API
  setup (test number, phone number id, token), then the webhook after a dev
  deploy.
- Sep 27, 03:15: Meta side: app authorized for the test WhatsApp Business
  Account (opt-in to current accounts only), 24-hour test token issued and
  stored in .env.local only, Anir's phone verified as a test recipient, and a
  hello_world template delivered from the test number through the same Graph
  API call the app uses (HTTP 200, message id returned). Still needed for a
  live round trip: the app secret from App settings > Basic (his password
  step), the dev deploy (his yes), the secrets script, then the webhook URL.
- Sep 27, 03:25: a free-form text went to Anir's phone through the app's
  own sendWhatsAppText (lib/whatsapp.ts), Meta returned a message id. The
  outbound leg is proven end to end in our code; inbound waits on the app
  secret, the dev deploy and the webhook URL.

- Sep 27, 02:55: Solutioning member (Sol Tester, fake number ...0003) over
  WhatsApp: a Goals write was refused in the module's words (view-only on
  Goals); a deal they do not own was proposed and the route refused the YES
  ("Only its owner, or a manager, can change this opportunity."), OPP-0001
  untouched; a request for Pfizer, which is only tracked in Market Intel, was
  not proposed and the agent offered to create the account first; a request on
  J&J Medtech was proposed, YES raised it, the stored record matched, and it
  was deleted through the route's delete op as admin (the requester was
  refused: "Only an owner can delete this."). Found and fixed: (1) the first
  proposal had attached the account's only deal without being asked; prompt
  rule added (never attach a deal, account, contact, group or owner the
  person did not name) and the action's deal field says so; the re-proposal
  carried no deal. (2) Once in two tries the model dropped a typed "high
  priority"; backstopParams in the converse route now restores a priority
  word that is literally in the message, never inferred. (3) With an EXPIRED
  access token the WhatsApp leg went silent: the handler stores the exchange
  only after a delivered send, so a failed send left nothing in history and
  the phone got nothing (the web route answered in 5 s). The 24-hour test
  token expired 18:00 PDT; it is parked in .env.local until the System User
  token exists. Open question for Anir: should an undelivered reply still be
  kept in the person's Agent history, and should /api/health report a failing
  WhatsApp send? BD owner (Kranthi, ...0004) over WhatsApp: put Neha Sharma on
  the empty goal Cold Reachouts (proposal 9.8 s, YES 5 s), then took her off
  again; the goal is empty as before. Type check clean; 9 + 7 + 116 tests
  green. Dev deploy: 99fcb5d6 pushed to main at 02:58 with Anir's yes, after
  a GitHub device sign-in that added the workflow scope.
- Sep 27, 03:20: the rep's "next Tuesday" follow-up landed on Oct 6 because the
  model was told the date in UTC: at 8 pm Saturday in New Jersey the server
  already said Sunday, and it worked the weekday out itself. Fixed in three
  places: parseDay now takes the person's zone (localDay) and understands
  Friday / next Tuesday / Monday next week / end of week / end of month; every
  action date goes through it with ctx.timeZone; the converse route resolves
  the zone (the person's saved Settings zone, else APP_DEFAULT_TIMEZONE, else
  UTC, lib/memberTimeZone.ts), tells the model "Today is Saturday 2026-09-26
  in America/New_York" and to hand day words to actions as said. Live as the
  rep over WhatsApp: on Tuesday and next Tuesday both proposed 2026-09-29, end
  of the month proposed 2026-09-30; all cancelled, the probe contact removed
  through the route. 8 + 117 + 9 tests green, tsc clean. For Anir: nobody has
  a saved zone yet, so dev/prod would use APP_DEFAULT_TIMEZONE if he wants one
  set (America/New_York?), otherwise UTC; the agent always names the zone it
  used in the date line. Also rep-level actions over WhatsApp (…0002): add
  contact, log a call, set a follow-up, each proposed then run on YES, then
  removed (two timeline rows via the store, the contact via DELETE
  /api/contacts/:id as admin); the unowned account stayed unowned. The dev
  deploy of 99fcb5d6 FAILED at "Register task definition": a comment I had
  put inside the single-quoted jq program contained an apostrophe ("it's"),
  which ended the shell string; the image was built, dev still runs d8f8bbf.
  Fix committed locally (e3e0dd5b): comments moved above the jq call. Waiting
  for Anir's yes to push it.
- Sep 27, 03:45 UTC: dev is wired for WhatsApp end to end. Second push
  (e3e0dd5b workflow fix + 2b5bc924 agent work) deployed green; /api/health on
  dev says 2b5bc924, agentProvider vertex, vertexBrain working. Anir accepted
  Meta's non-discrimination policy himself; I created system user "Freyr Sales
  Integration" (Employee), assigned the app (Manage app) and the test WABA
  (Everything), and generated a never-expiring token with
  whatsapp_business_messaging + whatsapp_business_management (debug_token:
  SYSTEM_USER, is_valid, expires_at 0). deploy/add-whatsapp-secrets.sh dev put
  the five keys into freyr-sales/runtime and rolled freyr-sales:408; the
  webhook handshake answered from dev, the callback was verified and saved in
  Meta, and the "messages" field is Subscribed. Locally the token is kept as
  WHATSAPP_ACCESS_TOKEN_REAL so :3006 stays in trace mode for the fake QA
  numbers. Next: Anir links his phone on dev (Settings > Integrations > WhatsApp
  code, text it to +1 555 178 7823) and asks the agent something; his 24-hour
  window with the test number is open from his earlier "hi".
- Sep 27, 05:05 UTC: while waiting for the production word, checked dev: no
  WhatsApp traffic in the ECS log for six hours and only the two QA numbers
  are linked (no pending code), so Anir has not texted or linked since the
  WABA fix. Found and fixed a wording bug the move to Settings > Integrations
  left behind: the three replies to an unlinked phone (not connected, code
  expired, code unknown) still sent people to Settings > Profile. Local commit
  only, not deployed; the production promotion should take this commit rather
  than f3d433e. Gap noted, not changed: an unlinked sender who gets the
  how-to-link reply leaves no log line, so a successful first contact is
  invisible server-side; only a failed send is logged.
- Sep 27, 05:30 UTC: permission levels over WhatsApp, second pass. View-only is
  a level a person holds in a module, never a role: view_all is additive (the
  role's own privilege is always held), so "Anir Test 5 + view_all" stayed a BD
  member, and the real view-only cases for a BD member are goals, offerings,
  team and reports. Built: the actions prompt now tells the model what the
  person may do per module (make new / change only / look only / not open),
  from the same checks propose_action applies, so a BD member asking to move
  someone onto a goal is refused in one line instead of being asked which Neha
  first, and the model stops suggesting actions above their level (81b61f1b).
  Create and delete refusals say "You can look at this, but not change it" for
  a view-level person instead of "You can change these". Found: Sol Tester was
  a bd_member in app_users all along, so the solutioning level had never been
  exercised. A real sol_member cannot open the agent at all: canAccessModuleWith
  limits that role to /solutioning and /meetings whatever the privilege table
  says (the table says agent: edit), so /api/agent/converse answers 403 and
  WhatsApp said "try again in a minute"; WhatsApp now relays the permission
  answer ("Not available on this account."). Whether solutioning members should
  have the agent is Anir's decision; nothing changed there. Every test mutation
  (Sol Tester's role, the privilege table, the fake link ...0005) was restored
  and verified.
- Sep 27, 08:35 UTC: record-level rule for deals moved in front of the proposal.
  A BD member changing a deal they do not own used to get a proposal, say YES,
  and only then be refused by the route. The route's ownership rule (managers
  and admins always, otherwise the owner by name) now lives in one place,
  lib/opportunityOwnership.ts, the route calls it, and update_opportunity asks
  it before proposing, so the answer comes first, in the same words. Verified
  over WhatsApp as Anir Test Rep on OPP-0001: "Only its owner, or a manager,
  can change this opportunity.", nothing proposed, nothing written.
  set_record_people was left alone on purpose: /api/record-team decides by
  record-team membership, a different rule, so a pre-check there would have to
  be that rule and not this one.
- Sep 27, 12:15 UTC: set_record_people now asks the record-team route's own two
  questions before proposing (module write, then recordWriteRefusal on the
  scoped record, an unclaimed record still accepting its first owner), so the
  answer cannot differ between the proposal and the YES. Verified as Anir Test
  Rep over WhatsApp: OPP-0002 has no team entry, so adding Neha Sharma was
  proposed exactly as the route would allow, then cancelled with NO; the team
  entry is still empty. Two probes in a row before that got "I couldn't answer
  that just now": the model turn ran past the WhatsApp bridge's 90-second
  abort (Vertex was slow for a spell), then a retry answered in 15 seconds.
- Sep 27, 12:30 UTC: the WhatsApp bridge waited 90 seconds for the agent and
  then said "try again in a minute", while the agent's turn kept running and
  its answer was lost (only the bridge sends and stores WhatsApp replies). It
  now waits four minutes, sends "Still on it. This one is taking a moment."
  after one minute, and a real timeout says so ("I ran out of time on that
  one. Ask again, or break it into smaller steps.") instead of blaming a
  hiccup. Timer is cleared on every path, so the tests still finish in a
  second.
- Sep 27, 12:25 UTC: FIRST REAL CLOUD TEST of the WhatsApp path, by replaying a
  signed Meta delivery from the linked QA number at deployed dev and reading
  the container log: the bridge received it ("[whatsapp] inbound ... Anir Test
  Rep") and then "converse unreachable ... connect ECONNREFUSED
  127.0.0.1:3000". Next's standalone server binds to HOSTNAME when set, and
  ECS sets HOSTNAME to the task's own hostname, so nothing listens on
  loopback. internalAppOrigin() now follows the same HOSTNAME rule the server
  uses (explicit APP_INTERNAL_ORIGIN / WHATSAPP_INTERNAL_ORIGIN still win,
  loopback stays for `next dev`), and the webhook route uses that helper
  instead of its own copy. The same origin carries every executed action, so
  web-card "Do it" on the cloud would have failed the same way.
- Sep 27, 12:37 UTC: END TO END FROM ANIR'S REAL PHONE on deployed dev (he signed
  into WhatsApp Web in his Chrome, I typed): link code accepted ("Connected...
  answers as Anir Suren"), "Which of our deals are closing this month?" came
  back with the GSK deal and its dev link. His ask in the same minute: the
  same phone must be able to switch between his test accounts by code. It
  could not: a six-digit code from an already-linked number went to the agent
  as a question. Now a code is a claim whether the number is linked or not
  (newest code wins, older link dropped, reply says "Switched... answers as
  <name>"); a linked person's six digits that match no pending code still go
  to the agent (an amount, say). Proved locally with the QA number both ways.
- Sep 27, 12:55 UTC: 35d875c live on dev (first build died of a heap OOM in
  the Docker build, the re-run passed). Account switch PROVED FROM ANIR'S PHONE:
  a fresh code for Anir Test 5 sent from his number flipped the link
  (12:47:51, "Switched... answers as Anir Test 5"), and "What can I do here?"
  came back "As a BD Member... view-only access to Goals and Team"; the same
  code sent again, already used, went to the agent as plain text ("I couldn't
  find any records matching 143038"), as designed. Prod: the five WhatsApp
  keys are in freyr-sales/runtime and task def freyr-sales:52 rolled green on
  the old image; promotion of 35d875c started 12:54 UTC on Anir's "push to
  both" plus "make sure it works before you deploy anything".
- Sep 27, 12:58 UTC: PRODUCTION. promote-to-prod.sh 35d875c: image copied
  with crane, task def freyr-sales:53 registered, service rolled, /api/health
  serves 35d875c. Meta webhook moved to
  https://freyrsales.freyrapps.com/api/whatsapp/webhook through the Graph API
  (POST /{app}/subscriptions with the app token; Meta's handshake against prod
  succeeded, which also proves the prod verify token is in place). Dev no
  longer receives WhatsApp traffic. Anir's phone is linked on DEV (as Anir
  Test 5 after the switch test); on prod nobody is linked yet, which needs his
  prod sign-in (prod cookies cannot be minted). Security answer given to Anir
  in chat: no attempt limit on codes, links never expire, Meta sees message
  text, test number reaches five phones; first two are the fixes to build on
  his word.
- Sep 27, 13:10 UTC: Anir: "how does the AI work" (answered in chat) and "can
  we do a QR code". Built: Settings > Integrations shows a QR of the wa.me
  link beside the code (scan, WhatsApp opens with the code typed in, one tap
  to send; qrcode package, data URL from the route). Security he asked for:
  an UNLINKED number that texts five wrong codes inside an hour is ignored for
  the rest of that hour (the fifth wrong code gets "Too many wrong codes",
  later ones get nothing); proved locally with ...0009. Linked numbers are
  not counted (their six digits go to the agent) and a right code clears the
  count. In-memory per task, one task runs.
- Sep 27, 13:20 UTC: PRODUCTION PROVED FROM ANIR'S PHONE. He signed into prod
  in his Chrome; I pressed Connect my phone on Settings > Integrations, sent
  the code from his WhatsApp: "Connected... answers as Anir Suren". Read:
  "Which of our deals are closing this month?" answered with the GSK deal and
  its prod link. Action round trip: "Star Takeda in Market Intel" was
  proposed, YES ran it ("Done. Takeda is now starred"), then unstar was
  proposed, YES ran it, so prod is back exactly as it was. Found on prod
  while there: the Integrations tab showed a "CRM sync: HubSpot ... Connected
  ... last synced just now" card in Real mode. No CRM is wired; it is the Mock
  showroom card from V2 #5 and it now renders in Mock only (a2c687b2). Local
  commits waiting for a push: QR + lockout (ddcdb3e1), this card (a2c687b2).
- Sep 27, 13:50 UTC: Anir asked whether the agents know his LinkedIn once it is
  pasted in Settings > Profile. The paste is scraped (Apify, live on prod) and
  stored on his row (linkedin_url, linkedin_headline, linkedin_photo, and the
  headline/about in his agent prefs). The draft and chat routes already read
  it through repIdentityBlock; the converse route (Agent page and WhatsApp)
  only had the Settings title. It now carries the same block, so "what do you
  know about me" and every draft over WhatsApp use the headline and
  background. Nobody on dev has pasted a LinkedIn yet, so verified by type
  check and the block's own output, not by a live scrape.
- Sep 27, 13:49 UTC: ecaf15c on dev (pipeline green) and PROMOTED TO PROD
  (task def 54, /api/health serves ecaf15c). Anir's "push" alone was the prod
  yes this time ("I don't have to say those words"); the promotion ran from a
  background chain the moment dev went live. In it: QR on the connect card,
  wrong-code lockout, HubSpot and System services cards out of Real, LinkedIn
  identity in the conversation prompt. Meta webhook unchanged (prod).
- Sep 27, 14:15 UTC: Anir on prod: "this is ugly... it should be like a
  pop-up" (the connect code on the card), "I should be able to do a voice
  recording", "why does it say it answers as Anir Suren", "revamp the
  LinkedIn... three sections", and "I just asked it if it has my LinkedIn
  info, and it said no". Built: Connect my phone opens a fixed-size dialog
  (QR left, code right, countdown, New code, turns into Connected as ... on
  its own, closing early withdraws the code); WhatsApp voice notes are
  downloaded from Meta and transcribed with Whisper (OPENAI_API_KEY is in the
  prod secret already), the reply opens with Heard: "..."; the connect reply
  reads "Connected as <name>" / "Switched to <name>"; Settings > Profile is
  three cards (Basic info, LinkedIn with a moving progress bar and a result
  card, Sign-in and security). ROOT CAUSE of "it said no": the profile route
  used the thirdwatch profile-scraper actor, which returned NO headline and a
  football news paragraph as his about, and the route saved it (cleared from
  his prod row by hand). The route now uses apimaestro's profile-detail actor
  (the one the lead path trusts) and refuses a profile whose name does not
  match the signed-in person. Proved on localhost with one real read of his
  profile: headline "Head of AI & Business Systems at Freyr Solutions", real
  about, photo; the local agent then answered "You are Anir Suren, the
  Workspace Admin and Head of AI & Business Systems...". Nothing deployed yet.
- Sep 27, 14:35 UTC: approval card redesigned ("the confirmations don't look
  good"): a tinted header carrying the state (needs your approval / done /
  not done / expired / couldn't do it) with a chip naming the kind of change,
  the summary, then Yes, do it / Not now and "Nothing has changed yet". The
  web reply no longer repeats the summary the card already shows (the rule is
  channel-aware now; WhatsApp still states it in full and takes YES/NO), so
  the bubble reads "Want me to go ahead?" above the card. New action
  update_contact, mapped to the existing PATCH /api/contacts/[id] (title,
  email, phone, LinkedIn, department, key contact), which the agent itself
  named as a gap. BUG FOUND AND FIXED while testing it: add_contact sent
  `title`, the create route reads `job_title`, so every job title given to the
  agent was summarised back and then silently dropped. Both proved over
  WhatsApp as a BD member on dev (add with a title, change phone and title,
  read back from the database); both probe contacts deleted afterwards, no
  residue. Action tests 10/10, WhatsApp tests 11/11.
- Sep 27, 15:05 UTC: two real bugs found by testing, both fixed. (1) "Star
  Roche and Novartis in Market Intel" proposed Novartis alone and never
  mentioned Roche: two instructions, one quietly dropped. The propose_action
  tool result now requires a line naming what is still waiting ("Still
  waiting: Vertex. Tell me after this one and I'll propose it."), and forbids
  saying another change is queued as if it will run on its own, because a YES
  is executed deterministically without the model and cannot pull the next one
  through. (2) With that line present, WhatsApp showed "Reply YES to do this,
  or NO." twice, since the model wrote one mid-message and the bridge appends
  its own; tidyProposalReply now strips every canned yes/no line, not only a
  trailing one. Sequence proved end to end as a BD member: propose Incyte +
  waiting line, YES, "now Vertex", proposed, NO. Every star made while testing
  was undone; the rep's starred list is back to zero.
- Sep 27, 15:25 UTC: the use case he opened the loop with, run verbatim from
  WhatsApp as an owner: "can we move Neha to the Cold Reachouts goal?" found
  the person, found the goal, proposed, YES put her on it, then "take Neha off
  the Cold Reachouts goal" + YES removed her. The goal is back to nobody and
  the test account is back to bd_member. Nothing else on dev was touched.
- Sep 27, 15:40 UTC: a YES that arrives after the proposal expired (thirty
  minutes) used to fall through to the model and come back as "what would you
  like done?", throwing the answer away. People answer WhatsApp hours later,
  so the deterministic path now names what expired: "That one expired before
  you answered: <summary> Proposals last 30 minutes. Say 'do it again' and
  I'll put it back up." Proved by proposing, ageing the stored proposal, then
  replying YES; "do it again" re-proposed it, and NO left nothing pending.
  New QA driver scripts/qa/age-proposal.mjs.
- Sep 27, 15:50 UTC: ambiguity on the goal side, the other half of "find the
  person, find the goal". As an owner over WhatsApp: "put Neha on the Billed
  goal" came back "I found two goals matching Billed: Billed Revenue and
  Billed / Collected Revenue. Which one?", with both links; answering "Billed
  Revenue" proposed the right one and NO cancelled it. Both goals are
  unchanged and the test account is back to bd_member.
- Sep 27, 16:00 UTC: swept every action for the bug class add_contact had, a
  field name in the action's body that the route never reads, so the change is
  summarised and then silently dropped. Checked each call body against the
  route that receives it: create_customer (name, website, hq, owner,
  ownerUserId, groupId), create_meeting (title, type, meetingAt, customer,
  customerId), create_lead (name, company, title, email, phone, source,
  interest, note against the Lead type), update_opportunity (status, level,
  value, estimatedTcv, confidence, estSignDate, nextSteps, name, all present
  in the route's mapper), the goal and group ops, and the record-team call.
  set_followup, log_touch and save_draft write through the typed db interface,
  where the compiler catches it. add_contact was the only one; no others found.
- Sep 27, 16:15 UTC: "Open it" after a goal or lead change used to land on the
  module index. Goal assign, unassign, log a result, verify and send back now
  link to /performance/goal/<id>, and a lead update to /leads/<id>; verify and
  send back carry the entry's goalId for it. Proved on dev by assigning and
  unassigning Neha on Cold Reachouts over WhatsApp: both done messages linked
  the goal itself, and the goal is back to nobody.
- Sep 27, 16:30 UTC: dates in a proposal read as dates. A follow-up summary
  said "for 2026-10-02"; it now says "for Fri, 2 Oct 2026", and a logged goal
  result does the same, so a day that came from words like "next Friday" can
  be checked at a glance (this is the class of mistake that put a follow-up on
  Oct 6 in the first place). readableDay lives with the pure helpers and has
  its own test. Proved live over WhatsApp on a probe contact at Zydus, then
  cancelled: "Set a follow-up with Zydus (QA Probe Three) for Fri, 2 Oct
  2026". The probe contact was deleted; dev has no contacts again. Note for
  future curl checks: the access grant expires after 15 minutes, so a DELETE
  can come back "Workspace owner approval required" until the cookies are
  minted again.
- Sep 27, 17:20 UTC: a BD member asking "show me the privilege table and who
  is an admin" got the three admins by name, which is right (roles are on the
  Team page, which every privilege can view) and it did not read the table
  itself. It did link /admin/privileges, a page that redirects that person
  straight back out. The access line now also forbids linking a page inside a
  module that is not open to them; the same question now answers with the
  three names and no dead link.
- Sep 27, 17:35 UTC: a mixed message ("how is Incyte doing, and star them for
  me") answers the question and proposes the star, which is right. It exposed
  a bug I had introduced an hour earlier: the WhatsApp tidier stripped any
  LINE containing "reply ... yes", and the model writes "I have proposed X.
  Reply YES to confirm." on one line, so the proposal sentence went with it.
  The strip is now surgical: a line that is only the canned instruction, or
  the phrase itself inside a line. Checked against three shapes, then live.
  The expired-proposal messages now quote the summary instead of running its
  full stop into the next word.
- Sep 27, 17:50 UTC: "actually undo that", straight after "Done. Incyte is now
  starred", failed with "I cannot find a company with that ID to unstar": the
  agent reached for Incyte's CUSTOMER id, which Market Intel has never heard
  of. resolveTrackedCompany now falls back to the customer of that id or name
  and takes the tracked company with the SAME name, when exactly one matches,
  so it is the same company seen from another module rather than a substitute.
  Undo then worked over WhatsApp and the rep is back to zero starred.
