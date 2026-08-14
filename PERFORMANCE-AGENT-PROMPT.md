# Finish the Performance module, then prove it works

You are picking up mid-task on the Freyr Sales Intelligence platform. Someone
before you built two thirds of this and stopped rather than ship untested edit
flows. Your job is the last third and, more importantly, the proof.

Working directory: `/Users/anirudhsuren/Downloads/freyr sales/freyr-sales`

Read `CLAUDE.md` in that directory first. It is short and every line of it is
load-bearing. The rules below do not replace it.

---

## Who you are working for

**Anir** owns the product and gives you instructions. He is technical, moves
fast, and wants the result before the explanation.

**Suren** is the CEO of Freyr and the end customer. He is not technical. He
describes what he wants by talking through it, often via voice notes that Anir
pastes in, so the transcripts contain audio-artifacts and repetition. Read them
for intent, not literally. He judges software by looking at it for five seconds.

Freyr is a global regulatory-affairs company. Eeswar, Saras and Wajeed use this
in production today. The Performance module is where people enter real numbers
about real quotas. Nothing here is a demo.

---

## What is already done

Two local commits, neither pushed:

- `d630056` — Org performance: clicking a goal expands it in place with the
  component cards and the three boxes, instead of navigating to
  `/performance/goal/[id]`.
- `3424174` — Group performance: each person's goal row inside an open group
  toggles the same drill-down.

Production is on `16a782c` and does **not** have either.

### How the inline drill-down works

`components/performance/GoalZoom.tsx` grew an `embedded?: boolean` prop. When
true it renders only the component cards and Suren's three boxes
(`1 · Organization`, `2 · Groups`, `3 · People`), skipping the back link, the
goal header and the verification-queue card, and it appends a link to
`/performance/goal/[id]`.

This was deliberately **not** copied into a second component. One implementation,
two mount points, so the inline view and the standalone page cannot drift.

Mounted in:
- `components/performance/OrgPerformanceTab.tsx` — inside the expanded `<tr>` of
  `GoalRows`. Needed `state` and `meName` threaded down, and `meName` added to
  the tab's props and passed from `PerformanceModule.tsx`.
- `components/performance/GroupPerformanceTab.tsx` — under the `GoalBar` in each
  person's goal row. Note `e.stopPropagation()` on **Log an actual**: the row is
  a toggle now, so without it the button collapses the row instead of opening
  the modal.

---

## What you must do

### 1. People tab

`components/performance/PeopleTab.tsx` already has a `picked` person state and
`onLogActual` wired. Give each of the picked person's goal rows the same
toggle-to-drill-down treatment as the Group tab. Match the existing pattern
exactly; do not invent a third variation.

### 2. The edit and info flow, end to end

Anir: *"wire up so that the entire edit and info flow is good so ppl can edit
and put in info and shit etc."*

Walk every path a real person takes and make each one work and persist:

- Log an actual (from Org, from Group, from People)
- Edit a goal
- Edit a subgoal
- Add a subgoal
- Report a value with evidence
- Verify as a group head
- Whatever else the module exposes that writes data

For each: does it open, accept input, save, survive a reload, and show the new
number in the places that aggregate it?

### 3. Test extensively in REAL mode

This is the part that was not done, and it is the part Anir cares about:

> "it has to be good especially TESTED EXTENSIVELY (to the max) in REAL mode
> (where u should test it)."

**Real mode, not sample mode.** Sample mode is fake data and proves nothing.
In Real mode as Anir you land on People performance with only your own goal,
because the module scopes by role. That is correct behaviour, not a bug, and it
is why the previous run could not reach Org performance in the browser: switch
views with the dropdown next to the page title (Org performance / Group
performance / People performance).

Use the Chrome MCP. Click things. Type into fields. Save. Reload. Read the value
back. A screenshot of a form is not a test; the test is that the number is still
there after a refresh and that it rolled up.

---

## Outstanding design items from Suren

Raised, deliberately not built, still open. Confirm with Anir before doing them,
especially the third.

1. **Halves.** The period buttons are Weeks / Months / Quarters / Years. He asked
   for semiannual as well: *"you also have H1 and H2... semiannual one and
   semiannual two"*.
2. **Yearly as the default.** *"here, the perfect view is a yearly view"*. It
   currently opens on Months.
3. **Who sees which box.** *"this tree should not show for everybody, only for
   me and for some leadership"* — leadership sees Organization, a group head sees
   group and people, an individual sees only their own. **This is a permissions
   change. `CLAUDE.md` forbids you from making it on your own judgement. Report
   it and let Anir decide.**

He also floated combining the all-goals overview with the one-goal drill under
tabs. The inline expansion closes most of that gap already. Look before building.

---

## Hard rules

**Deploying.** A push to `main` fires `.github/workflows/deploy.yml` and rolls
ECS. It needs an explicit yes from Anir for *that specific push*. One "deploy it"
covers one deploy, never the next. Enforced by `.githooks/pre-push`:

```bash
FREYR_DEPLOY_APPROVED=yes git push origin HEAD:main
```

Never export that variable into the shell. Never use `--no-verify`. Committing
locally is fine any time and you should do it, so work is never lost.

**Never run the Playwright suite.** It wiped production data once. If you ever
need it, `PORT=3007 NEXT_DIST_DIR=.next-test`, never his ports.

**Ports.** `:3001` and `:3006` are Anir's own dev servers. Do not restart them
out from under him, and leave `:3006` up for his review.

**Another agent may be working the same checkout.** Never run tree-wide git
commands (`git stash`, `git checkout .`, `git clean`). Before assuming a change
of yours vanished, check whether someone else touched the file. Before committing
a file you did not edit, read the diff: last session a change was nearly
attributed to another agent and turned out to be its own.

**Verification gate before any commit you intend to ship:**

```bash
npx tsc --noEmit
npx next lint --quiet
NEXT_DIST_DIR=.next-build npx next build
git checkout tsconfig.json; rm -rf .next-build
```

Green here means it compiles. It does not mean it works. Say which one you did.

---

## How to report

Anir's standing preferences, learned the hard way:

- Lead with the answer. No preamble, no "I'll now proceed to".
- No em dashes anywhere, including in generated emails and documents.
- Never write "honest caveat". Fix the limitation or give one actionable line.
- Never claim something is verified when it was only compiled. Say plainly which
  it was. "Verified by reading the code, not by exercising it" is acceptable.
  Pretending is not.
- If you broke something, say so in the first line.
- When he asks a follow-up question, it is a question, not an accusation that you
  were wrong. Answer it.
- If he pushes back on a claim you made, **check before defending it**. Last
  session an agent insisted the production agent was broken, twice, because it
  had read one function and stopped. Anir was right both times. When the user says
  it works and the code says otherwise, the code reading is the thing that is
  probably incomplete.

Mid-turn messages join the queue. They are not interruptions to deflect and not
redirections that cancel what you were doing. Fold them in, name the queue in a
line, keep going.

---

## The bar

The previous session stopped rather than hand over unverified edit flows in a
module that takes real quota numbers. Do not undo that by rushing to a "done"
that only means it compiles.

Finish People, walk every write path in Real mode, prove each one persists, then
tell Anir it is done and exactly what you exercised to earn that word.
