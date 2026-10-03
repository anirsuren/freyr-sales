# Agent record and sales-material mentions

Implemented locally on October 1, 2026; not deployed.

Both full chat and the dock accept `@` or `/` to open a searchable, categorized record picker. It covers offerings, sales materials, contacts, team, customers, Market Intel companies and articles, opportunities, components, solutioning, leads, contracts, goals and reports. Enter selects the highlighted option; arrows move the selection; Escape dismisses the picker. Selected records become atomic inline pills. Company/title context distinguishes duplicate person names. Backspace removes a complete pill. Sent messages and saved conversations preserve the chosen identities.

The request carries kind/ID pairs. The server resolves them against the current permission-checked index, rejects inaccessible or removed references, and supplies exact identities to the agent. Selecting a record does not grant change permissions or bypass confirmation. Document retrieval is scoped to selected offerings/materials after normal access filtering. Material IDs are matched together with offering destinations; missing text never expands the retrieval scope to unrelated documents. Selected extracted text is supplied directly so a question about evidence need not guess the document's keywords.

## Verification

- Type-check passed. Focused lint: no errors, one existing unused-provider warning.
- 27 focused entity, inline-link and selected-source tests passed.
- `npm run test:agent-mentions-ui` passed. It verifies duplicate-name selection, slash categories, multiple pills, Enter, Escape and the transmitted IDs with browser-only source and agent transport fixtures. It creates one confirmed disposable development account, journals it before mutation, and verifies cleanup. It refuses any Supabase project other than `ebyoefeikqxxxxifgjxk`.
- Separate guarded development browser/API checks verified genuine indexed materials, inaccessible-ID rejection (403), whole-pill deletion, conversation persistence after reload, and light/dark/mobile layouts. The final run's reserved conversation, profile, account and Auth fixtures were removed and checked.
- Five substantive real-development agent questions covered document evidence, missing implementation details, buyer objections and procurement discovery. The Fresenius Kabi enterprise proposal answer cited its slides, $50,000 fees, $2,250 additional-user pricing, customization exclusions and the 20-hour training cap. Those figures and section markers were checked against its stored PowerPoint text.

## Limitations and remaining checks

The tested Freya.Label white paper and 500 MB test video had no usable indexed text/transcript. The agent disclosed that limitation; this is not successful full-document analysis for those files. No WhatsApp delivery, existing customer mutation, exhaustive role audit, or all-document ingestion claim is made. UI transport fixtures are explicitly distinguished from actual provider answers in `.qa-backups/agent-loop-coverage.jsonl`.

The first failed browser attempts predated explicit profile-fixture journaling: account/Auth cleanup was verified, but every incidental profile from those earliest attempts was not traced by retained ID. Unknown/shared profile rows were not deleted. Later runs journal and verify both profile and conversation cleanup.
