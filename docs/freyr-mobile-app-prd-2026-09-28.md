# Freyr Sales mobile app — product requirements document

- **Status:** Draft for product decision
- **Date:** September 28, 2026
- **Owner:** Freyr Sales Intelligence
- **Platforms:** iPhone first; Android after the iPhone pilot, using the same product contract
- **Product boundary:** Real Freyr workspace data. Mock mode is excluded from employee builds.

## 1. Executive decision

Build a focused mobile companion to the existing Freyr Sales web application. It should help an employee prepare for a customer interaction, find an offering or account, review and update an authorized opportunity, act on a Solutioning request, and respond to work that needs attention. The mobile app uses the existing Freyr backend and permission model, but has its own touch-first interface. It is not a web view of the desktop site.

The proposed first release is **iPhone**, with an online-first design and no offline editing. The proposed distribution route is **Apple Custom App** if Freyr manages employees' devices or Apple Business assignments. In that route the app is made available to Freyr's organization ID in Apple Business and does not appear in the public App Store. Freyr then assigns installs to users or devices. If most employees use unmanaged personal phones and Freyr cannot or will not distribute through Apple Business, the alternative is an **unlisted App Store app**: easy to install from a link, but anyone with that link can reach the download page. In either case, Freyr sign-in and server permissions protect data. Apple confirms these are distinct distribution methods, and that changing a privately distributed app to public/unlisted later requires a new app record and resubmission. [Apple distribution methods](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods), [Apple unlisted distribution](https://developer.apple.com/support/unlisted-app-distribution).

**Decision needed before publishing:** company-managed/Apple Business distribution versus unmanaged personal-phone installs. Do not register the final App Store distribution method until that is decided.

## 2. Why build it

The web app contains broad desktop workflows and dense tables. On a phone, employees need quick actions in context: check the next meeting, find the latest material, brief themselves on an account, update a deal after a call, or pick up a request. A phone-sized rendering of all desktop screens would make common work slow and risks Apple's minimum-functionality rule for apps that are merely repackaged websites. [Apple App Review Guidelines §4.2](https://developer.apple.com/app-store/review/guidelines/).

The mobile app should reduce time between a customer event and an accurate Freyr record, without creating a second source of truth.

### Product outcomes

1. An authorized employee can find a customer, offering, or opportunity in seconds while away from a desk.
2. The employee can finish the most common follow-up actions on the phone without losing work or crossing a permission boundary.
3. Solutioning members can see and act on requests assigned to them without navigating sales-only modules.
4. The app earns repeat use because it has a clear mobile purpose, dependable notifications, fast navigation, and readable light/dark interfaces.

### Non-goals for the initial release

- Recreating every desktop table, chart, admin console, report, bulk import, or long document editor on iPhone.
- Enabling Mock mode or exposing demo fixtures to normal employees.
- Editing customer records offline or silently queueing writes that might later conflict with server state.
- Bypassing existing web release gates, group scoping, or privilege rules.
- Exposing backend service keys or AI-provider credentials to the app.

## 3. Current product facts and implications

The repository is a **Next.js 15 / React 19 / TypeScript** web app with many server-rendered pages and API routes. It has routes for Offerings, FDL Components, Leads, Opportunities, Customers, Solutioning, Meetings, Contracts, the Agent, Goals, Notifications, and more. Several APIs already exist, but a mobile client cannot directly reuse a server-rendered page or assume every UI action already has a mobile-ready API. The first engineering milestone is an API and permission audit, not screen drawing.

The existing roles are **admin, BD owner, BD member, and Solutioning member**. Freyr also resolves per-module privileges with `none`, `view`, `edit`, and `create`; `create` includes the ability to delete. The Solutioning role is limited to Solutioning and Meetings. The app must obtain current permissions from the server and enforce them on every request. A hidden button is never authorization. The current web code also distinguishes released Real-mode modules from Mock-only work; mobile must inherit the Real-mode release boundary.

The current login flow exchanges a Supabase access token for a browser session cookie. A native client needs a separately designed mobile session flow and secure token storage. Existing browser cookies must not be treated as a complete mobile authentication design. Existing in-app notifications are not equivalent to remote phone push notifications; device registration, delivery, preferences, and token revocation must be added if push is included.

## 4. Users and jobs

| Persona | Main mobile job | Access principle |
|---|---|---|
| BD member | Prepare for a call, ask the Agent, consult offerings, work their authorized opportunities, review personal goals | Show only modules and records they can currently access |
| BD owner | Same as BD member plus broader team/account review and authorized updates | Respect per-module privileges and record scope |
| Solutioning member | See assigned requests, submissions, presentations, and meetings; read source context that is explicitly allowed; update permitted work | No automatic access to sales, customers, or admin just because a request references them |
| Admin | Triage cross-team work and use authorized record actions | Administrative configuration stays primarily on desktop in V1 |

An employee may hold multiple privileges. The mobile app must render the *effective* privilege set from the backend rather than hard-code these examples.

## 5. Core journeys

### J1 — Before a customer meeting

Open the app, see the next relevant meeting or opportunity, open its account context, review recent activity and linked offerings, ask the Agent a question if permitted, then open a relevant sales material. Every hop keeps the employee in the same account context. Missing or forbidden linked records are shown as unavailable, without a broken link or leaked title.

### J2 — After a call

Search for the appropriate authorized opportunity, add a concise note or permitted status update, verify the save, and see the updated value immediately on web and mobile. If another person changed the record in the meantime, show the newer state and ask the employee to reconcile their edit rather than overwrite silently.

### J3 — Solutioning handoff

A Solutioning member opens their assigned queue, filters to the request type, reads scope and due dates, opens attachments they are allowed to see, and updates the permitted request status or note. Links to inaccessible customer or opportunity modules remain plain context rather than navigation that ends in an access error.

### J4 — Notification to action

An employee receives a meaningful alert for an assigned item, taps it, authenticates if necessary, and lands on the exact authorized record. If access was revoked after delivery, the app explains that the item is no longer available and does not display stale sensitive data.

### J5 — First install

An employee installs the app through the chosen Apple distribution route, signs in to the Freyr workspace, sees an onboarding explanation of the mobile scope, and reaches a useful home screen. A pending or unapproved account sees the same access state as on the web, with no bypass.

## 6. Navigation and information architecture

**Bottom navigation, role-aware:** Home, Search, Work, Agent (only if allowed), and Profile. Work opens a short module list permitted for that employee; it is not a replica of the desktop sidebar. The top level should never contain dead destinations. Universal search scopes results to authorized records and labels result types clearly. Back navigation preserves list position and search/filter state.

**Home:** a compact view of assigned or recently relevant work, next meeting, unread items, and recent records. If a role has no such data, show clear empty states, not fabricated counts. All dates use the user's time zone and explicit ranges where ambiguity matters.

**Record detail:** summary first, then activity, related records, materials, and allowed actions. Long tables become cards, sections, or focused lists. A record deep link is stable and resolves through authorization on open.

## 7. Release scope

| Capability | V1 requirement | Later / desktop-first |
|---|---|---|
| Authentication and profile | Sign in/out, session recovery, pending-access state, current role/privileges | Full account administration |
| Home and search | Role-specific actionable home; global search across authorized entities | Advanced cross-module saved searches |
| Offerings | Search, browse, detail, attached material preview/download where permitted | Bulk catalogue editing, imports, long-form material management |
| Opportunities | List, search/filter, detail, authorized small updates and notes | Complex forecasting and multi-step deal setup |
| Customers | Authorized list/detail, contact and offering context | Full customer configuration and large reports |
| Solutioning and Meetings | Assigned queue, request detail, permitted notes/status/attachments; meeting details | Complex submission authoring and bulk file operations |
| Agent | Existing grounded conversation experience adapted to mobile, with clear answer sources and an explicit action confirmation | Autonomous multi-step actions until mobile safety is proven |
| Notifications | In-app inbox with deep links; targeted push for opted-in, actionable events if the delivery service is ready | Broad marketing or high-volume push |
| Goals | Personal goal summary for permitted users | Goal-master management and dense analytics |
| Leads, Contracts, FDL Components, Market Intel | Read-only or narrow actions only after the API/role audit validates each flow; otherwise visible only through an explicitly supported handoff | Full desktop parity |
| Admin, Reports, Revenue Accruals, bulk exports | No mobile authoring in V1 | Evaluate demand after pilot |

The V1 backlog should be cut by actual role usage and API readiness. “Included” means the named journey passes role, state, and device tests; an incomplete screen does not ship behind a visible menu item.

### 7.1 V1 screen specifications

| Screen | Must show | Primary actions | Required states |
|---|---|---|---|
| Sign-in / access | Freyr identity, clear sign-in route, help for pending access | Sign in, sign out, retry | Invalid credentials, expired session, approval pending, account disabled, service unavailable |
| Home | User's next relevant work, recent authorized records, notification count | Open item, search, resume work | No assigned work, no network, partial feed error, permission changed |
| Search | One query field, recent searches stored locally without sensitive payloads, typed results | Search, open result, clear query | No results, partial results, denied item, slow connection |
| Offerings list/detail | Name, category, current availability, owner where authorized, material list | Search, filter, preview/download material | No material, expired file link, unavailable material, loading |
| Opportunity list/detail | Account, owner, stage/status, value, next action, recent activity, linked solutioning | Search/filter, note or permitted field update | Read-only privilege, stale edit, validation failure, deleted record |
| Customer detail | Account summary and permitted contacts, deals, offerings | Open linked records and contact method | Restricted account, empty section, stale data |
| Solutioning queue/detail | Assignment, type, status, due date, source context, documents | Filter, update allowed fields, add note, preview document | Unassigned item, permission changed, upload interrupted |
| Meetings | Schedule, participants, account context, outcome/notes where allowed | Open meeting, add permitted note | Canceled meeting, missing time zone, past-due item |
| Agent | Conversation, sources, visible action approval | Ask, follow source, approve/decline a proposed action | Streaming interruption, no source, revoked source, action timeout |
| Inbox / notifications | What changed, when, and which record it concerns | Open, mark read, change push preference | Already resolved, record inaccessible, push permission denied |
| Profile / settings | Identity, role, appearance, notification settings, privacy/help | Change preference, sign out, account action | Sync failure, unsupported device setting |

The design should be reviewed as a connected flow, not isolated screens. For example, a push may open a request detail, then its attachment, then return to the same request. The app should never reset to Home between those steps.

### 7.2 Permission-by-action contract

The backend privilege model is more detailed than a simple “admin or not.” The mobile app must use the same meaning:

| Effective privilege | May list/open records in scope | May edit existing record | May create new record | May delete |
|---|---:|---:|---:|---:|
| None | No | No | No | No |
| View | Yes | No | No | No |
| Edit | Yes | Yes | No | No |
| Create | Yes | Yes | Yes | Yes, where the module supports deletion |

The server additionally decides which *specific* records are in scope. A `view` privilege for Opportunities does not automatically grant access to every opportunity. Admin behavior follows existing server rules; the mobile client does not create a new superuser shortcut.

## 8. Functional requirements and acceptance criteria

### 8.1 Authentication and access

- Use Freyr's existing identity and approval system. Mobile sign-in must not establish a second, independent member directory.
- Store only session secrets in platform secure storage. Refresh or re-authenticate on expiry. Revoke mobile session and device push registration on sign-out or account removal.
- On every cold start and foreground return, refresh effective role, module privileges, release availability, and account status before exposing protected data.
- Every API mutation validates the authenticated person, the workspace, module permission, record scope, and allowed action server-side.
- A user whose privilege changes during a session loses the affected navigation and data without needing to reinstall.
- Support role combinations and pending, disabled, and removed users. Never derive permissions from a local role label alone.

**Acceptance:** automated API checks show that unauthorized list, detail, deep-link, attachment, and mutation requests are denied for every role; manual tests confirm that a role change takes effect on the phone after refresh/foregrounding.

### 8.2 Search and lists

- Search is global from one entry point and can also be scoped within a module.
- Lists support a short, mobile-appropriate filter set. Filters are visible, removable, and preserved when moving into a record and back.
- Search and filter results have loading, empty, error, and permission-changed states.
- Pagination or incremental loading avoids loading full enterprise tables onto the phone.

**Acceptance:** searching a known permitted record opens it; a forbidden record is absent from suggestions and results; leaving and returning preserves the query and list position.

### 8.3 Records and edits

- A detail screen shows the same source-of-truth value as the web app after refresh.
- Edits show save progress and explicit success or failure. No silent save and no optimistic success when the server rejects a write.
- Use a version/updated-at check for any field where concurrent editing could overwrite a colleague's work.
- Destructive actions require an explicit confirmation and are absent unless the effective privilege permits them.
- File previews open through short-lived authorized URLs or an authenticated streaming endpoint; no public permanent document URLs.

**Acceptance:** phone-to-web and web-to-phone changes agree; a deliberately stale edit cannot silently overwrite a newer edit; unauthorized attachment links cannot be opened outside the session.

### 8.4 Agent

- Preserve the existing grounded answer behavior and source attribution while adapting conversation and source cards to narrow screens.
- Show which action the Agent proposes and request explicit approval before any write or external action.
- Agent responses must respect the same document and record permissions as normal mobile screens.
- Handle slow responses, cancellation, network loss, and interrupted app sessions without duplicate actions.

**Acceptance:** the Agent can answer an authorized catalogue question, cannot cite inaccessible records, and never performs a write twice after retry.

### 8.5 Notifications

- Start with actionable, role-scoped events: assignment, due-soon/overdue work, request updates, and explicitly relevant approval items.
- Let users set push preferences per category and quiet hours. A push should contain minimal sensitive text; the full record is fetched after authentication.
- Deduplicate events and avoid sending a notification for a record the recipient can no longer see.
- Tapping a push opens the matching record or a clear unavailable state.

**Acceptance:** end-to-end device tests cover foreground, background, app-closed, permission-denied, duplicate, and revoked-access cases. Expo can provide a unified push layer over APNs/FCM, but device registration and server-side fan-out still need implementation. [Expo push overview](https://docs.expo.dev/push-notifications/overview/).

### 8.6 Appearance and accessibility

- Native-feeling touch controls; no hover-only affordances, tiny tap targets, horizontal table overflow, or tooltips stranded away from their trigger.
- Light and dark color tokens must be reviewed screen by screen, including selected, pressed, disabled, error, and empty states. Color cannot be the only status cue.
- Support Dynamic Type, VoiceOver labels and reading order, reduced motion, keyboard focus where applicable, and clear error text.
- Treat brand colors as accents; prioritize legibility. Apple's dark-mode guidance calls for at least 4.5:1 foreground/background contrast and encourages stronger contrast for small text. [Apple Dark Mode guidance](https://developer.apple.com/design/human-interface-guidelines/dark-mode).

**Acceptance:** core journeys work with VoiceOver and larger text, and every screen/state is visually checked in light and dark mode on a small and a large iPhone.

## 9. Technical approach

### Recommended client

Use **React Native with Expo** for one mobile codebase and familiar TypeScript skills. This is a recommendation, not a claim that the web UI can be copied over: navigation, tables, inputs, overlays, charts, and file handling need mobile implementations. Expo's build tooling supports distributable iOS and Android binaries, and its secure-store and notification integrations address common mobile needs. [Expo build documentation](https://docs.expo.dev/build), [Expo secure storage](https://docs.expo.dev/develop/user-interface/store-data/), [Expo push notifications](https://docs.expo.dev/push-notifications/overview/).

Use the existing Next.js application as the backend initially. Put mobile-specific, versioned API contracts in front of the existing data/domain logic; do not screen-scrape rendered pages. Web and mobile share the underlying database, permissions, and business rules. Publish a schema for list, detail, filter, mutation, and error responses. The API should return only data the viewer is authorized to receive.

**Architecture sketch:**

```text
iPhone app (Expo / React Native)
  -> mobile session + versioned Freyr API
  -> existing Freyr authorization and domain services
  -> existing development or production Supabase/data services

Apple Push Notification service <- notification delivery service <- Freyr events
```

### Engineering discoveries to resolve in the first spike

1. Map each V1 screen/action to an existing API or a needed endpoint. Some current experiences rely on Next.js server components or browser cookies.
2. Define native authentication and refresh/revocation without embedding Supabase service credentials. The current `/api/auth/session` is browser-cookie oriented.
3. Verify API enforcement for the `none/view/edit/create` model and record-level scope; do not trust client-side menu filtering.
4. Decide whether the app calls a Freyr API gateway exclusively or a carefully scoped Supabase client for any reads. Default: Freyr API gateway for consistent authorization and auditing.
5. Define upload/download limits, content types, and secure file previews. Large desktop uploads remain desktop-only until proved necessary.
6. Define a push event source and token lifecycle. The existing web notification route is not a push service.
7. Keep dev and production mobile builds visually and technically distinct. No production secrets or real customer data in review/demo builds.

### Data and reliability

- Online-first. Display a clear offline state; retain only the minimum recent non-sensitive UI state. Do not queue writes in V1.
- Encrypt session secrets with platform secure storage. Avoid storing customer documents or Agent transcripts unencrypted on the device.
- Use structured, redacted diagnostics; never log tokens, full customer documents, or private Agent prompts to mobile analytics.
- Build crash reporting, request tracing, and feature flags before pilot. A rollback should disable a broken mobile-only feature server-side without blocking web users.
- Define supported iOS versions based on employee devices before build; test real devices, not simulator alone.

### 9.1 API contract and error behavior

The phase-0 API inventory should produce a table for every V1 action: endpoint, read/write operation, role check, record-scope check, request/response schema, rate limit, and web/mobile parity owner. Mobile endpoints should use stable identifiers and explicit pagination rather than returning whole collections. Avoid placing customer names or private document titles in URLs, analytics event names, or push payloads.

Standardize failures so the phone can give the right response: unauthenticated (sign in), forbidden (access changed), missing (record removed), conflict (newer version exists), validation (correct fields), rate limit (retry later), and temporary server error (retry safely). Mutations that can be retried should use an idempotency key. This is particularly important for notes, Agent actions, and uploads after a mobile connection drops.

### 9.2 Sensitive data handling

| Data | Mobile treatment |
|---|---|
| Session tokens | Secure device storage; never analytics or plaintext logs; revoke on sign-out |
| Customer/contact details | Fetch only when authorized; avoid persistent bulk caches; clear on sign-out |
| Documents and transcripts | Authorized short-lived access; no public link; remove temporary copies when no longer needed |
| Push payloads | Minimal metadata by default; full context only after app authentication |
| Search history | Prefer on-device query-only storage; clear on sign-out; no cross-user carryover |
| Diagnostics | Redact personal and customer data; record request IDs and error categories instead |

The actual data-collection inventory must be checked against every included SDK before completing Apple's App Privacy disclosure. [Apple privacy guidance](https://developer.apple.com/app-store/user-privacy-and-data-use/).

## 10. Distribution, review, and privacy

### Chosen route A — private Custom App

1. Freyr enrolls or verifies its organization in Apple Business and obtains its Organization ID.
2. The development team enrolls in the Apple Developer Program and creates the iOS app in App Store Connect.
3. Before first approval, select **Private** distribution and enter Freyr's Organization ID.
4. Upload the binary, screenshots, privacy details, review notes, and a review account/sample dataset. Apple reviews the build.
5. After approval, Freyr finds the app in Apple Business **Apps and Books** and assigns it to its users/devices through device management or Apple Business redemption codes. The app is not discoverable by the public in the App Store. [Apple distribution methods](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods), [Apple Apps and Books distribution](https://support.apple.com/en-us/103264).

**Important nuance:** private distribution controls who can obtain the app; Freyr authentication controls who can use it. The person does not simply search the ordinary App Store for “Freyr” and see a private listing because their email domain matches.

### Alternative route B — unlisted app

Apple reviews and hosts the app, but it is absent from App Store search. Freyr sends employees a direct App Store link. This works well for unmanaged personal phones, but the link is not private; anyone with it can reach the download page. Access to Freyr data must still be restricted by Freyr sign-in. Choose this route only if ease of installation outweighs private listing visibility. [Apple unlisted distribution](https://developer.apple.com/support/unlisted-app-distribution).

### Review requirements

- The binary must be stable and complete. Apple requires access to account-based features through a working review account or a fully featured demo mode, and backend services must be available during review. For a private app, use sanitized review data, not live customer content. [Apple App Review Guidelines, Before You Submit and §2.1](https://developer.apple.com/app-store/review/guidelines/).
- Submit an accessible privacy policy and accurate App Privacy disclosures covering the app and included SDKs. [Apple privacy guidance](https://developer.apple.com/app-store/user-privacy-and-data-use/).
- If the mobile app allows users to create an account, it must also offer a way to initiate account deletion in the app. Whether Freyr's invitation/approval flow counts as account creation needs review before submission; design for compliance rather than assuming an exception. [Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app).
- Explain in review notes that this is a role-based internal sales tool, how the reviewer reaches each role's features, and which features require sample data. Apple states that a mere web wrapper is insufficient. [Apple App Review Guidelines §4.2](https://developer.apple.com/app-store/review/guidelines/).

## 11. Measurement and rollout

### Pilot metrics

- Weekly active employees among invited employees, segmented by role.
- Percentage of first-time installers who complete sign-in and reach a useful record.
- Median time from app open to opening an intended record or material.
- Percentage of allowed mobile edits that save successfully on first attempt.
- Crash-free sessions; API error rate; p95 time to first useful content on normal mobile connection.
- Notification open-to-action rate and opt-out rate.
- Permission-denied incidents and any unauthorized-data incident (target: zero).
- Qualitative feedback from at least one BD member, BD owner, Solutioning member, and admin.

**Initial targets, to confirm after baseline:** 95%+ successful first sign-in for valid approved pilot accounts; 99.5%+ crash-free sessions; 0 known authorization bypasses; no unrecoverable lost edits. Set adoption and speed targets only after observing the pilot's real work patterns.

### Rollout phases

| Phase | Deliverable | Exit gate |
|---|---|---|
| 0 — discovery / spike | Device/distribution decision, prioritized role journeys, API inventory, security design, clickable prototype | Freyr approves scope and installation route; API gaps estimated |
| 1 — internal build | Native shell, sign-in, permissions, Home, Search, Offerings, Opportunity detail, Solutioning queue, basic Agent | Core journeys pass on real iPhones in dev with representative roles |
| 2 — pilot | Limited employee test, notifications, file previews, quality fixes | No critical security or data-loss issues; light/dark and accessibility checks pass |
| 3 — Apple submission | Privacy and review package, sanitized review tenant, App Store Connect distribution setup | Apple approval and employee installation path validated |
| 4 — expansion | Fill observed workflow gaps; Android or additional modules | Pilot metrics and support load justify it |

An illustrative planning range is **10–16 weeks for a narrow iPhone pilot** and additional time for broader parity/Android. This is an estimate, not a commitment: authentication and API gaps, review readiness, and device management can materially change it. The phase-0 spike should replace this range with a sized plan.

### Dependencies and risk register

| Risk | Why it matters | Mitigation / decision gate |
|---|---|---|
| Distribution choice made late | Private versus public/unlisted cannot be switched on the same approved app record | Decide device policy before App Store Connect submission |
| Cookie-oriented web auth reused as-is | Native session expiry and revocation may fail or expose tokens | Design and test a dedicated mobile session contract first |
| UI permission filtering mistaken for security | Hidden items can still be requested directly | Negative API tests for every role/action/record scope |
| Desktop-only APIs | Screen development stalls or duplicates business logic | API inventory and one end-to-end vertical slice in phase 0/1 |
| Sensitive push text on lock screen | Customer or deal information could be shown to others | Generic default push copy and authenticated deep link |
| Overwide mobile scope | Quality and App Review readiness suffer | Pilot only the named journeys; defer bulk/admin work |
| Web/mobile data conflict | An employee may overwrite another's update | Version checks, conflict UI, no offline write queue in V1 |
| Review account lacks role coverage | Apple cannot inspect the submitted experience | Sanitized reviewer tenant and clear review notes |
| Dark mode or accessibility debt | The app is hard to use and may repeat web UI problems | Per-state design tokens and physical-device sign-off |

**Resourcing assumption for estimation:** one product/design owner, one mobile engineer, one backend engineer with authorization expertise, and part-time QA/security/release support. This is a planning model, not an approved staffing request. Phase 0 should estimate SDK/build-service costs, Apple program costs, device management, push delivery, observability, and support separately from engineering time.

## 12. Test matrix and launch gates

Test the four roles and representative privilege combinations against both permitted and forbidden records. Cover new/pending/disabled accounts, session expiry, permission revocation, deep links, attachment URLs, simultaneous web/mobile edits, slow or absent network, time-zone boundaries, notification opt-out, and app reinstalls. Test light/dark, large text, VoiceOver, small/large iPhone sizes, and native permission dialogs. Use separate dev and production backends; never test destructive flows on production records.

Do not ship until:

1. Every V1 route and API has a documented server-side permission check and passing negative tests.
2. No visible mobile navigation leads to an unimplemented or unreleased screen.
3. The sign-in, foreground refresh, logout, and revocation flows work on physical iPhones.
4. A user can complete J1–J5 in both light and dark appearance without clipped content, low-contrast text, or hover-dependent controls.
5. The App Review account/demo exposes the submitted feature set with sanitized data and all required privacy metadata is complete.
6. Freyr can install, update, and revoke the app through the selected distribution path.

## 13. Open product decisions

1. **Device ownership/distribution:** managed company phones/Apple Business versus unmanaged personal phones/unlisted link. This is the most consequential decision because Apple's private/public distribution method cannot simply be flipped after approval.
2. **Pilot audience:** exact named users in each role and their actual on-the-go tasks.
3. **First-release actions:** which opportunity and Solutioning edits are important enough to support on a phone, rather than read-only detail.
4. **Push scope:** which events merit an interruptive phone notification, quiet hours, and whether previews may include customer names on locked screens.
5. **Android timing:** simultaneous with iPhone or after the pilot; the suggested default is after the iPhone pilot.
6. **Account policy:** invitation-only versus in-app account creation and the corresponding account-deletion flow.
7. **Device policy:** minimum iOS version, managed-device requirements, and whether biometrics are required for reopening the app.

## 14. Source notes

Product facts above were checked against the Freyr repository on September 28, 2026: `package.json`, `app/layout.tsx`, `lib/release.ts`, `lib/moduleAccess.ts`, `lib/privileges.ts`, `lib/viewerAccess.ts`, `components/layout/navItems.ts`, and `app/api/auth/session/route.ts`. The product proposal and timelines are recommendations; they are not current implementation claims. External policy/technical references are linked beside the relevant requirements and should be rechecked at submission time.
