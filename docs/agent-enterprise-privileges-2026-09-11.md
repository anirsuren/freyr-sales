# Agent identity and permission audit — September 11, 2026

## Verified in isolated execution

Run `node --test tests/agent-enterprise-privileges.test.mjs` from the repository root. All 22 cases pass. The harness transpiles the actual route/authentication code, uses real cryptographic session/grant verification, substitutes database and model providers, and rejects all network access. It loads no environment file and creates no production accounts or business records.

- BD Member, BD Owner, Solutioning Member and Admin fixtures resolve their stable member identity and role from signed grants, ignoring browser-supplied identity and provider role claims.
- Ownership uses member IDs, not matching display names; manager/admin exemptions match the existing workflow policy.
- Mismatched login/grant subjects, foreign workspace grants, forged tokens and expired access grants fail closed.
- Conversation create, read, update and delete remain isolated between users, including spoofed user/workspace IDs and identical conversation IDs.
- 2,000 fixture members of mixed roles retain independent durable conversation rows, exercised in batches of 50 concurrent operations. Deleting one member's conversation does not change another's.
- Invalid message roles, excessive histories and oversized payloads are rejected without persistence.
- All tested methods on summary, inbox, draft, chat, ask and briefing refuse denied Customers access before any account read or model invocation.
- Account ask/chat ignore client-supplied company, owner and financial facts, read the selected account server-side, return 404 for a missing account, and never read denied Contacts, Sessions or Opportunities sources.
- Legacy ask and briefing reject invalid authentication before model invocation.

## Local changes

Customer access gates now protect summary, inbox, draft, chat (GET/POST/DELETE), ask and briefing. Contacts, Sessions and Opportunities reads use their own existing module permissions. The latter three sources may therefore contribute only the subset the current member can read. No new role policy was introduced.

Chat, ask and briefing now resolve facts through `lib/agentAccountContext.ts`. Ask/briefing require `customerId` instead of trusting a browser context object; the retained AccountBriefing component sends this ID. No active rendered caller of either legacy standalone component was found. Chat's drafting identity now uses the signed actor, not the account owner.

## Same-name privilege escalation corrected locally

Admin lifting now receives the verified `app_users` member ID, not the display name. Module/View all and opportunity direct-privilege checks use the same member resolver. A paginated workspace directory lookup avoids treating a duplicate beyond Supabase's first 1,000 rows as unique. Missing, inactive, ambiguous or unverifiable legacy identities receive no additional direct privileges; the stored base role remains unchanged, including existing base admins.

The optional `memberPrivileges` map binds privileges to stable member IDs. Existing name assignments remain backward compatible only when the directory identifies one active member. The next authorized admin privilege Save adds these unique bindings, preserves legacy display data, preserves renamed members' existing bindings and applies deliberate unique-name revocations. No global privilege write or migration was executed during this audit. Until that Save occurs, legacy-only bindings are resolved at read time; adding a same-name member can therefore withhold that legacy assignment until an administrator disambiguates it. Once persisted, stable bindings survive renames and duplicates.

A read-only DEV inventory found all 41 current legacy assignments matched unique active directory members, with no ambiguous or unmatched assignment names. All five direct Admin badge assignments are preserved, and all three active base admins retain their role. After the fix, the existing Anir localhost session returned HTTP 200 for privileges, entity index and private conversations. A temporary client/server import-boundary compilation error encountered during implementation was corrected before these checks.

The tests now reject the reproduced same-name admin inheritance and cover unique migration, rename stability, inactive/missing members and deliberate revocation. The broader legacy team-membership model still uses names; this change is specifically the direct-privilege escalation fix, not a team-storage migration.

## Limits

These are isolated application logic tests, not a 2,000-user deployment capacity certification. They do not exercise identity-provider signup/invitation email, real database connection limits, provider concurrency/quotas, browser rendering or distributed requests. Account reads remain workspace-visible wherever the existing module policy permits them, while mutation ownership remains a separate check. Access grants remain valid for up to their existing 15-minute expiry after a role revocation. Conversation whole-history writes still have last-write-wins behavior across simultaneous tabs of the same account; the test does not claim concurrent message merge guarantees.

## Real DEV account lifecycle follow-up

After independently identifying localhost:3006 and the DEV deployment as Supabase project `ebyoefeikqxxxxifgjxk` (production is a different project), user authorization was applied to four temporary DEV accounts. The script explicitly refuses any different database URL or service-key project reference. It used confirmed email/password admin creation with distinctive `anir.s+agent-audit-*` aliases; no invitation or confirmation emails were sent. Existing accounts and the global privilege matrix were untouched.

All four roles — BD Member, BD Owner, Solutioning Member and Admin — passed actual Supabase password login, application session exchange, signed name/member/role checks, summary and entity-index requests, private conversation write/read despite forged body/query IDs, one real agent identity query, and logout with cookie clearing. The agent answered each temporary account's exact name and correct role. Some role labels were raw `bd_owner`/`sol_member` strings rather than friendly names.

All four Auth users, app_users memberships and exact durable conversation rows were deleted in `finally`, then checked absent. A subsequent read confirmed no agent_prefs or agent_chats rows remained for these members. The journal is `.local-backups/agent-enterprise/dev-account-lifecycle.json`; it contains the created IDs and per-step cleanup results, no passwords or tokens.

This follow-up used four model calls: 396 ordinary input tokens, 142 output tokens and 49,311 cache-write input tokens. No web-search or outgoing-message action was requested. These are measured tokens, not a claimed dollar charge.

The current DEV privilege matrix allowed summary/entity access for all four default role fixtures. Denied-module paths were verified by the isolated tests above; this lifecycle did not alter global privileges to manufacture denial. Account creation used the admin test setup, so this does not claim to have tested invitation email delivery or the self-service signup UI. It also remains a four-account lifecycle test, not a 2,000-concurrent-user infrastructure test.
