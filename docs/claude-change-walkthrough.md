# Claude change walkthrough — September 15, 2026

This records the last parallel pass attributed to Claude. Claude worked in the
same uncommitted working tree rather than a separate branch or commit, so Git
does not preserve a perfect author-by-author boundary. The list below is based
on the assigned scope, the resulting diff, and the implementation comments.

## Opportunity editing

- Mock mode now supports the same opportunity create, edit, and delete controls
  as Real mode. Mock writes still remain in mock persistence.
- The opportunity API no longer rejects a write merely because the current data
  mode is Mock. Authentication, ownership, and privilege checks still apply.
- The unsaved-change bar reacts while a person types instead of waiting for the
  field to lose focus. This covers the opportunity name, TCV, ACV, owner, and
  next steps.
- Required fields are still validated on blur, so temporarily emptying a field
  while retyping does not immediately replace the user's text.
- TCV edits use one shared conversion patch for both the typing and blur paths,
  keeping local-currency and USD values consistent.
- The offering picker is wider so long offering names remain readable.
- Save retries once when the short-lived workspace approval has expired and
  reports an explicit message when the network request fails.
- The empty deal-team state is clickable: “Nobody else is on this deal. Add
  somebody.” opens the same person picker as the plus button.
- Opportunity owner changes now have a separate `mayChangeOwner` permission
  passed through both edit entry points.

Open locally: [Opportunities](http://localhost:3006/mock-mode/opportunities)

## Offering editing and parity

- The Save button is disabled before submission when the offering name is
  missing, a sales-material row has only a label or only a URL, or nothing has
  changed.
- The page displays the exact reason beside the Save button instead of waiting
  for a failed submission.
- Offering reports and competition controls render in Mock and Real modes.
- Mock mode may add competition rows through its isolated persistence rather
  than receiving a mode-only API rejection.
- Offering Market Intel reads through the shared Market Intel read layer.

Open locally: [Offerings](http://localhost:3006/mock-mode/offerings)

## Market Intel parity and shared Real-mode preparation

- Mock and Real now render the same Market Intel dashboard, company cards,
  detail briefing, search, filters, sorting, tracking, and management controls.
- Sample bookmarks and deleted-story tombstones persist in Mock mode, while
  Mock refresh/tracking remains blocked from starting paid collection jobs.
- An opt-in shared database selector was added so development and production can
  use production as the canonical **Real-mode Market Intel** store after the
  server-only settings are configured.
- Shared access matches an authenticated local user to an active production
  workspace member by verified email and fails closed when the match is missing
  or ambiguous.
- Automatic collection remains production-only. Development may perform an
  explicit onboarding or manual refresh against the shared store after it is
  configured.
- This configuration has not been activated and no production data was changed.
- The previously reported LinkedIn people showing zero collected posts remains
  a separate collection audit; the parity work does not claim to repair it.

Open locally: [Customer Intelligence](http://localhost:3006/mock-mode/market-intel)
or [Competitor Intelligence](http://localhost:3006/mock-mode/market-intel?tab=competitors).

## Revenue tabs: what Claude did not newly create

The three Opportunity tabs — Est. Booked Revenue, Est. Accrual Revenue, and
Deviations — were already in the repository from September 10. Claude preserved
and checked that structure; this pass did not originate those tabs.

After Claude finished, Codex added the opportunity-scoped **View deviations**
link and scope banner. Codex also completed the Solutioning Requests table,
forms, statuses, and permission rules. Those are not attributed to Claude.

Open locally: [Accrual revenue](http://localhost:3006/mock-mode/opportunities?tab=accrual)
and [Deviations](http://localhost:3006/mock-mode/opportunities?tab=deviations).

## Verification

- TypeScript compilation passed.
- Revenue and business-rule tests passed: 20/20.
- Market Intel database, parity, and onboarding tests passed: 9/9.
- Focused ESLint completed with zero errors.
- Git whitespace validation passed.
- No deployment, provider collection, production write, or production
  configuration change was performed.
