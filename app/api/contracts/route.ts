import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { canAccessModule } from "@/lib/moduleAccess";
import { readContracts, removeContract, saveContract } from "@/lib/contracts";
import { contractCounts, type Contract } from "@/lib/contractsShared";
import { logActual, readPerformance, removeActual } from "@/lib/performance";
import { withPerformanceWrite } from "@/lib/performanceQueue";
import {
  canOpenModule,
  moduleCreateRefusal,
  moduleDeleteRefusal,
  moduleWriteRefusal,
} from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

/**
 * CONTRACTS API. Sales writes here and the delivery platform reads by
 * `reference` (Suren, Aug 25: "this interface should enter the data, because
 * this is where we are logically closing").
 *
 * Admin-only for now, enforced here as well as in the nav.
 */
async function closed(): Promise<NextResponse | null> {
  const me = await getCurrentUser();
  return (await canOpenModule("/contracts"))
    ? null
    : NextResponse.json({ error: "Not available on this account." }, { status: 403 });
}


/**
 * A SIGNED CONTRACT PUTS ITS VALUE ON A GOAL.
 *
 * Suren, Aug 18: a contract is what produces booked revenue, and the value
 * belongs against a goal the moment it is signed. Anir, Aug 26, on which
 * goal: "Yeah, the person picks the goal." Nothing is inferred, so a contract
 * with no goal chosen posts nothing at all.
 *
 * This is the deal's Met flow with the trigger moved: there, a human ticks
 * Met; here, the contract reaching Signed with a date and a value IS the tick.
 * Every hard-won rule from that flow is kept, because they were learned from
 * real double-counts:
 *
 *  - The guard cannot live in the payload. A stale tab that re-saves without
 *    the actualId must not write a second entry, so the entry is found by the
 *    contract's own id rather than by being told.
 *  - Un-signing withdraws the entry only while it is unverified. Once a group
 *    owner has signed it off, the number is theirs and it stays.
 *  - It stands in the same write queue as every other performance write, or a
 *    contract save racing a logged result erases one of them with a 200.
 */
async function settleGoal(
  before: Contract | null,
  after: Contract,
  meName: string
): Promise<Contract> {
  const link = after.goalLink;
  if (!link?.goalId && !before?.goalLink?.goalId) return after;
  return withPerformanceWrite(async () => {
    const person = (link?.person || after.owner || meName).trim();

    /* THE HANDLE IS FOUND, NOT ASSUMED. Same lesson as the deal flow: the
       entries know which contract they came from, so the server can answer
       this without the browser echoing an id back. */
    const standing = await (async () => {
      const perf = await readPerformance();
      return perf.actuals.find((a) => a.contractId === after.id) ?? null;
    })();

    if (contractCounts(after) && link) {
      /* Already counted, and still against the same goal and person: adopt
         it. Nothing to write. */
      if (
        standing &&
        standing.goalId === link.goalId &&
        standing.person.trim().toLowerCase() === person.toLowerCase() &&
        standing.amount === after.value
      ) {
        return standing.id === link.actualId
          ? after
          : { ...after, goalLink: { ...link, actualId: standing.id } };
      }
      /* The goal, the person or the money changed. Take the old one down
         first so the two never stand at once — unless it is verified, in
         which case it stays and this contract stops claiming it. */
      if (standing) {
        try {
          await removeActual(standing.id);
        } catch {
          return {
            ...after,
            goalLink: { ...link, actualId: standing.id, postedAt: link.postedAt },
          };
        }
      }
      try {
        const entry = await logActual({
          goalId: link.goalId,
          person,
          amount: after.value,
          /* The signature date, not today: booked revenue lands in the month
             the contract was signed, which is the whole point of asking for
             a signed date before this posts anything. */
          date: after.signedOn,
          note: `Signed contract ${after.reference}`,
          customer: after.customer,
          customerId: after.customerId,
          opportunityId: after.opportunityId,
          contractId: after.id,
          dealLabel: after.name,
          addedBy: meName,
        });
        return {
          ...after,
          goalLink: {
            ...link,
            actualId: entry.id,
            postedAt: new Date().toISOString().slice(0, 10),
          },
        };
      } catch (error) {
        console.error("[contracts] booked-revenue entry failed:", error);
        return after;
      }
    }

    /* No longer counting: back to Draft, Cancelled, the goal cleared, the
       signed date removed. Withdraw what this contract put there. */
    if (standing) {
      try {
        await removeActual(standing.id);
        return link
          ? { ...after, goalLink: { ...link, actualId: undefined, postedAt: undefined } }
          : after;
      } catch {
        /* Verified and locked. The number stays and the handle stays with it,
           so a future re-sign adopts that entry instead of writing a second. */
        return link ? { ...after, goalLink: { ...link, actualId: standing.id } } : after;
      }
    }
    return after;
  });
}

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const shut = await closed();
  if (shut) return shut;
  return NextResponse.json({ state: await readContracts() });
}

export async function POST(req: NextRequest) {
  /* WRITE IS ITS OWN PERMISSION (Suren, Aug 29). Refuses before the
     handler reads a body, so a person who may READ this module cannot
     change it. Falls through to the old role rules while the privilege
     table is not being enforced. */
  {
    const refusal = await moduleWriteRefusal("/contracts");
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  }

  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const shut = await closed();
  if (shut) return shut;
  /* Mock writes go to the mock row and can never reach real data, so there is
     nothing to refuse (Anir, Aug 26: "all the same functionality (add, edit
     etc.) should be on mock mode, but it shouldn't affect real data"). */
  const me = await getCurrentUser();
  const body = (await req.json().catch(() => ({}))) ?? {};
  const op = String(body.op ?? "");
  try {
    if (op === "save") {
      const wasId = String(body.contract?.id ?? "");
      /* No id means a new contract, and only an owner starts one. */
      if (!wasId) {
        const refusal = await moduleCreateRefusal("/contracts");
        if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
      }
      const before = wasId
        ? (await readContracts()).contracts.find((c) => c.id === wasId) ?? null
        : null;
      const saved = await saveContract(body.contract ?? {}, me.name);
      /* Posting the money is a second write, so it saves again with whatever
         handle came back. A failure here must not lose the contract itself,
         which is why the goal is settled after the contract is safely stored
         rather than inside its transaction. */
      const settled = await settleGoal(before, saved, me.name);
      const contract =
        settled.goalLink?.actualId === saved.goalLink?.actualId &&
        settled.goalLink?.postedAt === saved.goalLink?.postedAt
          ? saved
          : await saveContract(settled, me.name);
      return NextResponse.json({
        ok: true,
        contract,
        state: await readContracts(),
      });
    }
    if (op === "delete") {
      /* A deleted contract takes its unverified booked-revenue entry with it,
         the same rule deals follow. A verified one stays: it is the group
         owner's sign-off, not this contract's, that holds it up. */
      const refusal = await moduleDeleteRefusal("/contracts");
      if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
      const id = String(body.id ?? "");
      const doomed = (await readContracts()).contracts.find((c) => c.id === id);
      if (doomed) await settleGoal(doomed, { ...doomed, goalLink: undefined }, me.name);
      await removeContract(id);
      return NextResponse.json({ ok: true, state: await readContracts() });
    }
    return NextResponse.json({ error: `Unknown op "${op}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That didn't save." },
      { status: 400 }
    );
  }
}
