# Claude handoff, Oct 1 2026 (freyr-sales)

## State of the repo
- Branch `main`: **14 local commits ahead of `origin/main`, not pushed** (`git log origin/main..HEAD`). All 14 are Claude's.
- ChatGPT's own work is still uncommitted in the tree and was left untouched. I committed only my own changes, by replaying my recorded edits onto HEAD, so none of ChatGPT's hunks are inside these commits.
- Nothing of mine is left uncommitted. (`components/onboarding/OnboardingHub.tsx` is ChatGPT's.)
- Checks already run:
  - Every commit checked on its own in a clean worktree: `npx tsc --noEmit -p .` 0 errors, `npx eslint --quiet` 0 errors on its files.
  - Whole working tree (my commits + ChatGPT's uncommitted work): tsc 0 errors; eslint 0 errors on all 250 changed files.
  - Unit tests (`tests/*.test.mjs`): 340/375 pass. The 35 failures are identical on `origin/main` (environment and loader issues, e.g. missing Supabase URL, `cookies` outside a request). Nothing new fails. ChatGPT's new tests pass.

## Commits, oldest first
1. **124d755e** FDL: the remove button sits on each customer card again, red (`components/fdl/FdlComponentDetail.tsx`). Check: `/components/<id>`, the card's bin is visible and red; the confirm says the account stays in Freyr.
2. **40cf8357** WhatsApp: one phone, one account. A code texted from a phone already linked to another account is refused instead of moving the phone; the setup pop-up says "That phone is already connected to another Freyr account". Proved with signed fake webhook messages (7 checks).
3. **41c63b2b** Deleting is easy everywhere: red bins with a confirm on every record type (`DeleteRecordButton` + customers, deals, accruals, offerings, FDL, Market Intel, meetings, goals, admin, agent-chat bins).
4. **6f86aaae** Account edit pop-up; shared `Input`/`Textarea`/`MoneyInput`/`PeopleSelect` at 40px; add-contact phone prefix 108px; "View on Google Maps" removed; Customers Summary/List and Tiles/Rows are dropdowns.
5. **40ac70b2** Pie/donut click highlights the slice in place (no isolating); "?" hints sit beside titles; Goals: banner faces, whole-row hover glow linked to the chart, Sub-goals box, subgoal row spacing, Close all keeps the open goal; goal-type icons instead of dots.
6. **60fb6545** `PersonFan`/`CompanyFan`: hover is on the circle itself (lift + blue ring); no white box or ring behind.
7. **205ae848** Onboarding rewrite: welcome card first (Begin onboarding / Not now), animated chapters (Getting around, Your agent, Knowledge, Selling, Performance, Your team, Settings), steps filtered by role and privilege, Settings covered, notifications panel step, `?setup=phone` opens the phone pop-up, local in-memory tour store for no-sign-in dev. `lib/productTourCatalog.ts` is append-only (saved progress = array index). Tests: `tests/product-tour-access.test.mjs`.
8. **1714bd95** Faces/logos in expanded chart detail rows; "Ready for a refresher" only when a finished tour is replayed from Settings.
9. **5600633c** Customer Offerings tab: Sales materials fold, and names preview on hover (`MaterialPeek`).
10. **99be791d** Rep pages never say "Rep not found" (workspace members + showroom names; redirect keeps the mock prefix); `EntityLink` nested span carries `data-href`; Market Intel row arrow shows only when hovering the name.
11. **d48e6889** Agent dock: minimum height 260, no snap when resizing, shrinks to the conversation.
12. **555c1ba2** Big batch (139 files):
    - Every confirm names the exact record (customer, offering, goal, person). New confirms on one-click destructive or overwriting actions (offering "no longer in use", contact removal, transcribe again, imports, bulk moves, passkey reset, access rejection, etc.). `Modal` gained `wrapTitle`. **Agent screens excluded** (see Reverted).
    - Remove where you add: hover X + named confirm on chips/rows: offering customer types, markets, related offerings, competitors; customer key contacts, in-use offerings, activity documents; meeting and request people/deals; deal-linked requests and contracts (unlink only); contract links; lead owner and LinkedIn; Market Intel divisions and companies; FDL "Part of"; a result's deal link. New `components/ui/UnlinkButton.tsx`; permission flags computed on the server pages where the existing flag did not match the route.
    - Faces/logos beside names across admin, team, notifications, settings, performance, offerings, FDL, reports, forecast, dashboard, leads, customers.
    - Document names preview on hover (meetings, requests, contracts, activities, evidence, FDL files; `DocumentNamePeek` in `components/ui/DocumentPeek.tsx`); `MaterialPeek` raised to z-240 so it shows above dialogs.
    - Sticky goal bar: `components/performance/PinnedGoalBar.tsx`. The open goal pins as a frozen row while its breakdown scrolls; a sub-goal or person you are inside is named under it.
    - Remaining form fields at 40px (DateField and dialogs).
    - Notifications (`lib/notifications.ts`): interactions whose customer was deleted are skipped; the "Account" stand-in is never a logo link (its `/companies/Account` link created a customer called "Account").
13. **224277f7**
    - Face/logo rings hug the circle: an initials face sat on a 24px line inside a `block` link, so the ring drew an oval. The link is `flex` now (`PersonFan`, `CompanyFan`).
    - Offering tabs at zero (Opportunities, Customers, Competition, and the whole-tab "Nothing is running") keep their card and title; the message sits centred in the dashed box (new `components/ui/DashedEmpty.tsx`).
    - **WhatsApp after the tour (Anir's decision):** the tour no longer has the `whatsapp-agent` and `settings-integrations` stops (catalog slots kept, filtered by display order); the finish card offers "Finish your profile"; the phone pop-up (`WhatsAppOnboarding`) opens once the tour is completed or skipped, never if the phone is connected, a skip was saved, or the workspace has no number; same gate as the tour (real mode + approvals). Tour tests updated (17/17 pass).
14. **ff960a09** Agent cost and accuracy, measured with the real model on hard questions:
    - One rule in the agent instructions ("ONE ROUND OF LOOKUPS": plan and request all lookups together as parallel calls; take another round only when a result reveals something new).
    - `lib/agentWorkspace.ts` deals lookup: summary adds `openValueByOffering` (exact over every open deal before paging) and `filteredValueByCurrency` for the overdue/upcoming filters. The agent used to add up whichever 50 records it was shown, so totals drifted ($2.9M vs "over $10M" for the same question). `nextStepsMeaning` and the solutioning `ownerMeaning` are now said once per result instead of on every record.
    - Development only, never in production: `lib/vertex.ts` appends one line per model call to `/tmp/freyr-agent-usage.jsonl` (prompt, cached, output tokens); captures the exact request to `/tmp/freyr-agent-request-*.json` only while `/tmp/freyr-capture-agent` exists; the converse route logs prompt-part sizes to `/tmp/freyr-agent-prompt-parts.jsonl`.
    - Hovered face/logo wrappers rise above their neighbours, so a ring is never hidden under the next circle (`PersonFan`, `CompanyFan`, goal-banner faces in `EntryCards`).
    - Results (same questions, before -> after): GSK briefing 4-5 calls 9-12c -> 2 calls 4.9c; pipeline risks 3 calls 12c -> 2 calls 5.8c; follow-up 3.5c -> 2.9c. Totals now exact and identical across runs (GRI $5,830,423; 22 overdue deals, $2,955,783). How-to and two-step questions still answer correctly (a two-step question still takes its second round).

## Reverted or not kept
- Confirm dialogs added inside agent screens (`components/agent/*`, `app/agent/inbox/page.tsx`, `lib/appManual.ts`): reverted to HEAD, because ChatGPT owns the agent. Not committed.
- Reordering the agent instructions for caching: no measurable saving; reverted.
- Cheaper models, tested on identical captured requests: Gemini 3 Flash (preview) and 2.5 Flash gave worse answers (vaguer, skipped part of the question); as the "which data to fetch" step they made worse choices (3 Flash claimed there were no deals). 2.5 Flash-Lite did not answer. Model stays `gemini-3.5-flash`.

## Changes outside the code
- Google Cloud (owner **anirudhsuren@gmail.com**, billing account `01ACF7-385C1C-5D84A0`, project `sound-fastness-480519-a6`): created budget **"Freyr agent AI $10 a month"**, alerts only, at 50/90/100%. Its immediate 100% email covered **September** ($38.22), not October.
- Dev data: Anir's `app_users.agent_interactions` restored to 674 after testing (verified).
- Anir's agent history has about 13 test chats from today (GSK briefing, pipeline risks, follow-ups, how-to, biggest deal). Not deleted.
- `/tmp/freyr-agent-usage.jsonl`, `/tmp/freyr-agent-prompt-parts.jsonl`, `/tmp/freyr-agent-request-*.json` hold dev workspace data from the tests; safe to delete.
- A test server on :3007 was started and stopped; its build folder was removed, and the `tsconfig.json` include line Next added for it was taken back out.
- Not mine: customer "Reserved QA Lead 1790883382919" (created 19:36 UTC by ChatGPT's QA) is still in dev.

## AI spend today (Claude's own testing): $1.18
From exact token counts: 41 agent calls through the app + 8 direct model tests. September's bill was $38.22, of which $18.44 was Claude's agent file-reading tests on the night of Sep 30 (230 questions).

## Please verify / known issues
- `app/api/agent/converse/route.ts` and `lib/agentWorkspace.ts` contain my small hunks plus ChatGPT's uncommitted edits.
- Onboarding: ChatGPT's notes in `AGENTS.md` describe phone setup before the tour; the code now does WhatsApp after the tour, per Anir. Align the notes.
- `middleware.ts` (ChatGPT's uncommitted change): `accessGrantMemberIsActive` makes an uncached Supabase call on every page and API request, and a transient failure bounces or 403s the request. Consider a short cache.
- Intermittent agent "The connection stopped before the answer finished" (seen twice today: once after 2 model calls, once before the prompt was built). Existed before these changes.
- "Single biggest deal" questions pick one deal without mentioning ties (J&J Medtech and BMS are both $1M).
- Reported, not changed (Anir's call): offering owner X shown to BD Owners though the route needs admin; offering competition editable by anyone who can view; some customer page tab gates differ from their routes; deal edit controls shown to non-owner team members; FDL remove-customer checks a different permission than the server; a person who added a Market Intel company cannot delete it.
- Bugs reported, not fixed: clearing a field in the contract edit form does not save; files attached in the New/Edit meeting dialog never reach the meeting.
- Not done: the full every-privilege click-through test (on hold); @/slash tagging in the agent chat (Anir's new ask, spec pending); remaining faces gaps (opportunities summary, pipeline board logo click opens the deal instead of the account, Market Intel post authors, "added by" on meetings and requests, mock-only modules); remaining remove-where-add gaps (goal assigned/sub-goal people, deleting a deal's accrual plan from the deal page, FDL list "Included in" chips, Market Intel people pop-up); `tests/onboarding.spec.ts` still expects the old two-click flow.

## How to check
- `npx tsc --noEmit -p .` and `npx eslint --quiet <files>`.
- Unit tests import `.ts` sources with extensionless imports; plain `node --test` fails on those the same way on `origin/main`. A resolver that tries `.ts`/`.tsx`/`.js` makes them load.
- To check a commit on its own: `git worktree add /tmp/wt <sha>`, symlink `node_modules`, copy `next-env.d.ts`, run tsc there.
