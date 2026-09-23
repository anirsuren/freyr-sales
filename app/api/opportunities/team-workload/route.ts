import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { canOpenModule } from "@/lib/moduleAccessServer";
import { readOpportunities } from "@/lib/opportunities";
import { readRecordTeams, teamFor } from "@/lib/recordTeams";
import { privilegesForPerson, readPrivileges } from "@/lib/privileges";
import { readSolutioning } from "@/lib/solutioning";

export const dynamic = "force-dynamic";

const same = (a?: string, b?: string) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

type WorkItem = {
  id: string;
  title: string;
  customer: string;
  role: string;
  status: string;
  due: string | null;
  dateLabel: string;
  href: string;
};

export async function GET(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope || !(await canOpenModule("/opportunities"))) {
    return NextResponse.json({ error: "Opportunities are not available." }, { status: 403 });
  }

  const person = request.nextUrl.searchParams.get("person")?.trim().slice(0, 100);
  const excludeDeal = request.nextUrl.searchParams.get("excludeDeal")?.trim();
  if (!person) return NextResponse.json({ error: "Choose a teammate." }, { status: 400 });

  const [opportunities, teams, solutioningAllowed] = await Promise.all([
    readOpportunities(),
    readRecordTeams(),
    canOpenModule("/solutioning"),
  ]);

  const deals: WorkItem[] = opportunities.opportunities
    .filter((deal) => deal.id !== excludeDeal && !["Won", "Lost"].includes(deal.status ?? ""))
    .flatMap((deal) => {
      const team = teamFor(teams, "opportunity", deal.id);
      const owner = same(deal.owner, person) || same(team?.owner, person);
      const member = team?.members.some((name) => same(name, person));
      if (!owner && !member) return [];
      return [{
        id: deal.id,
        title: deal.name,
        customer: deal.customer,
        role: owner ? "Owner" : "Team member",
        status: deal.status ?? "Open",
        due: deal.estSignDate || null,
        dateLabel: "Est. signing",
        href: `/opportunities/${encodeURIComponent(deal.id)}`,
      }];
    });

  let solutioning: WorkItem[] = [];
  if (solutioningAllowed) {
    const [state, me, privileges] = await Promise.all([
      readSolutioning(),
      getCurrentUser(),
      readPrivileges(),
    ]);
    const held = privilegesForPerson(privileges, me.name);
    const limitedToOwn =
      (me.role === "sol_member" || held.includes("sol_member")) &&
      !(me.role === "admin" || held.includes("admin") || held.includes("sol_owner"));
    solutioning = state.requests
      .filter((item) => {
        if (limitedToOwn && !same(item.owner, me.name)) return false;
        if (["completed", "cancelled"].includes(item.status)) return false;
        if (["Finalized", "Submitted to customer", "Cancelled"].includes(item.deliverableStatus ?? "")) return false;
        return true;
      })
      .flatMap((item) => {
        const team = teamFor(teams, item.type === "request" ? "solutionRequest" : item.type, item.id);
        const roles = new Set<string>();
        if (same(item.owner, person) || same(team?.owner, person)) roles.add("Owner");
        if (team?.members.some((name) => same(name, person))) roles.add("Team member");
        for (const stream of item.workstreams ?? []) {
          if (same(stream.lead, person)) roles.add("Division lead");
          if (same(stream.primaryAssignee, person)) roles.add("Assignee");
          if (stream.contributors.some((name) => same(name, person))) roles.add("Contributor");
        }
        if (item.docs.some((doc) => same(doc.assignedTo, person))) roles.add("Document assignee");
        if (roles.size === 0) return [];
        return [{
          id: item.id,
          title: item.title,
          customer: item.customer,
          role: [...roles].join(" · "),
          status: item.type === "request" ? item.status.replaceAll("_", " ") : item.deliverableStatus ?? item.status.replaceAll("_", " "),
          due: item.neededBy || null,
          dateLabel: "Needed",
          href: `/solutioning/${encodeURIComponent(item.id)}`,
        }];
      });
  }

  const sort = (a: WorkItem, b: WorkItem) =>
    (a.due || "9999").localeCompare(b.due || "9999") || a.title.localeCompare(b.title);
  return NextResponse.json({
    person,
    deals: deals.sort(sort),
    solutioning: solutioning.sort(sort),
    solutioningAvailable: solutioningAllowed,
  });
}
