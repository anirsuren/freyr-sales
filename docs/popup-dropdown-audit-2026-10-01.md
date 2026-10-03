# Popup dropdown audit — October 1, 2026

Local changes only; no deployment. Browser checks used localhost:3006 and a reserved development administrator. Supabase was verified as `ebyoefeikqxxxxifgjxk` before fixture creation. Business API writes and external browser requests were blocked. Existing records were only read; forms were discarded.

## Reproduced problems and fixes

1. **Inline people lists did not reliably dismiss.** Added capture-phase outside-interaction and Escape handling to the inline MultiPicker used in Admin group forms. Removed its blur timer so clicks into its own list do not race with dismissal.
2. **Escape dismissed the form underneath a picker.** Fixed folder, calendar, performance person, and compact view pickers to consume Escape. Stacked modals now let the picker handle the key first; only the front modal handles subsequent Escape/Tab. Verified the FDL stacked version-date dialog, material folder dialog, Goals person picker and compact view fixture.
3. **Closing a list could close the whole resized form.** A group form shrank and recentered between pointer-down and click, causing the release to hit the backdrop. Modal dismissal now requires a press that actually began on the backdrop. Verified that genuine backdrop clicks still close the form.
4. **Clicking inside an inline menu could close it.** Clicking menu padding can focus the surrounding dialog. The shared outside-interaction helper distinguishes pointer-induced focus from keyboard focus leaving the picker. Corrected nested labels around Account Plan owner pickers. Inside clicks stay open; outside clicks and keyboard focus leaving close the list.
5. **Full-screen editor menus opened behind the editor.** Standardized floating picker layers above full-screen and docked dialogs. Verified all seven heat-map activity pickers using visible hit testing, outside click, Escape and trigger toggle.

The screenshot's New contract Owner was checked directly, together with Status and both dates. Switching to another picker closes the first. Selecting a status closes its list and preserves the form.

## Browser coverage

Each applicable field was opened and checked for an outside click within the form, Escape preserving the parent form, and trigger toggle. Later checks also confirmed the menu was above the dialog with `elementFromPoint`. Text lookups were tested with typed queries; clicking an empty lookup alone does not open a list. These are UI dismissal checks, not permission or saved-record lifecycle certification.

| Area | Forms and fields checked | Evidence mode |
|---|---|---|
| Opportunities | New opportunity, expanded offering/value/status/goal/activity sections; New contract owner/status/dates | Real dev |
| Opportunity reviews | Add person, third party and agreed action; competitor form inspected | Real dev |
| Contracts | New contract, dates/signature, booking goal/person; existing contract edit | Real dev + Mock |
| Offerings | New offering classification/availability; nested sales material; component group; add/edit material folder, audience, stage and division; competition material | Real dev + Mock |
| FDL | Add version, stacked expected-date calendar, Add customer version; connect-offering chooser inspected at desktop and mobile width | Real dev |
| Customers | Add customer classifications/owner/group/countries; company and both address lookups; account details; key contact; interaction; customer group | Real dev + Mock |
| Customer account plan | Plan status/owner/dates and all action owner/date/status fields; inside padding and keyboard focus | Mock |
| Customer offering | Revenue type/start/end; activity/status/start/end/linked deals/currency | Mock |
| Customer deal/account | New deal offering/stage/contact/date/owner; account owner | Mock |
| Leads | New/edit lead; source chart source/status/owner/sort; expanded intake chart selector | Real dev + Mock |
| Meetings | New and edit; type/date/customer/contacts/deals/owner/presenters/attendees | Real dev + Mock |
| Solutioning | Submission/presentation/meeting requests; account-dependent selectors; edit request priority/date; document worker; request/document linking | Real dev + Mock |
| Goals | Log result including financial booking/currency/customer/deal/person/date; new goal; person/group assignment; subgoal owner; edit result; expanded goal period; log result inside expanded chart | Real dev + Mock |
| Admin/Team | New/edit group type/owner/inline people; invite starting role (no invite sent) | Real dev |
| Customer types | Add family/size | Real dev |
| Feedback | Feedback type | Real dev |
| Pipeline/Campaigns | Add deal size/stage; campaign objective/offering | Mock |
| Accruals | Plan deal selector before/after selecting a deal | Mock |
| Heat map | Normal activity editor and full-screen editor; activity/status/currency/three dates/linked deals | Mock |
| Pitch email | Email template menu; review response stubbed to expose compose UI; no email sent | Mock + stub |
| Conditional components | Agent Insert snippet, activity credit person, compact tile/list menu inside Modal | Actual components mounted in temporary local UI fixture; not business end-to-end |

The conditional fixture route was limited to development localhost, then removed. Its source is retained only in the ignored audit backup. The snippet data was stubbed. No Agent actions, activity credit, or sends were executed.

## Source inventory and limits

The initial inventory found 49 files containing both modal and picker references. This does not mean every picker in those files is in a popup. The inventory was reconciled against the actual rendered forms:

- Targets is hidden and its old route redirects. OfferingReleasesTab/OfferingContacts, RecordTeamButton and OpportunityActivities have no reachable rendered caller in the current app. They were classified, not falsely marked as live browser passes.
- Recordings upload, material-folder rename, connected component choosers, tracked-people popup, accrual version history, new master activity, new FDL component and version preview contain text/file/checklist controls rather than the dropdowns found elsewhere in those files.
- Existing record variants and conditional fields were tested as listed. This is not an exhaustive statement about every possible record, role, viewport, native browser date widget or future workflow state. The separate full role/privilege audit is not certified by this UI audit.
- Early audit entries include actual pre-fix failures and harness mistakes. In particular, the first New opportunity scan incorrectly included accordion disclosures. Later overlay-only checks supersede it. Empty address inputs were later retested with typed queries. Folder, stacked-date, person, reflow, and compact-view failures have explicit passing retests.

Raw field evidence: `.qa-backups/popup-dropdown-coverage.jsonl`. Reconciled source inventory: `.qa-backups/popup-dropdown-inventory.json`. These ignored files include intermediate checks and repeats and must not be treated as a count of unique dialogs.

## Validation

- `npm run test:popup-dismissal-ui` passed. It is an isolated guarded browser script, not the Playwright suite. It verifies the contract controls and option selection, material folder, stacked FDL date, group inline people/backdrop reflow, Goals person, account-plan owners and inside padding/focus, and full-screen heat-map pickers.
- Type-check passed after the final compact-view change. That change also passed its browser fixture retest.
- Focused lint: no errors; existing hook-dependency and unused-symbol warnings remain in shared files. Final ViewSelect/test-script lint is clean.
- Fixture cleanup and temporary-route removal are verified before handoff; see the journals under `.qa-backups/popup-dropdown-fixture.json` and `popup-dismissal-test-fixture.json`.
