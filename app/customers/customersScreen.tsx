/**
 * ONE CUSTOMERS SCREEN, THREE ADDRESSES.
 *
 * Anir, Aug 31: "can u create different pages for these tabs... i thought i
 * already told u to do that." Accounts, Customer groups and Targets were one
 * page with local state, so the URL never moved off /customers and Back walked
 * out of the module. Every route below renders this with its own tab; the data
 * read is the same whichever room you land in, so it lives here once.
 */
import { getDb } from "@/lib/db";
import type { CustomerRouteTab } from "@/lib/customerTabs";
import { CustomersWorkspace } from "@/components/customers/CustomersWorkspace";
import { getRole } from "@/lib/role";
import { isManagerOrAdmin } from "@/lib/moduleAccess";
import { readTargets } from "@/lib/targets";
import { readCustomerGroups } from "@/lib/customerGroups";
import { readOpportunities } from "@/lib/opportunities";
import { listOfferings } from "@/lib/offerings";
import { opportunityValue } from "@/lib/opportunitiesShared";
import { meetingsForCustomer, readMeetings } from "@/lib/meetings";
import { buildDeals, formatMoney, STAGES, STAGE_COLOR, type Stage } from "@/lib/pipeline";
import { accountHealth, accountHealthSeries } from "@/lib/health";
import { formatDateTime, OUTCOME_META, OUTCOME_CHART_COLOR } from "@/lib/utils";
import type { TipItem } from "@/components/charts/Charts";
import { getDataMode } from "@/lib/dataMode";
import { requireModuleAccess, moduleCreateRefusal, moduleWriteRefusal } from "@/lib/moduleAccessServer";
import { listWorkspaceAccess } from "@/lib/accessStore";


export async function CustomersScreen({ tab }: { tab: CustomerRouteTab }) {
  await requireModuleAccess("/customers");
  const db = getDb();
  const customers = await db.customers.list();
  const allContacts = await db.contacts.list();

  const enriched = await Promise.all(
    customers.map(async (c) => {
      const contacts = await db.contacts.list(c.id);
      const interactions = await db.interactions.list(c.id);
      const sessions = await db.pitchSessions.list(c.id);
      const deals = buildDeals(sessions, customers, allContacts, interactions).filter(
        (d) => d.customerId === c.id
      );

      // Hover charts (Suren): the two things a rep wants at a glance —
      // where the money sits (pipeline mix) and whether the relationship is
      // warming or cooling (health trend). Each slice/point carries the real
      // deals/touches behind it, so hover gives MORE, not a restatement.
      const open = deals.filter((d) => d.stage !== "Closed Lost");
      const stage_mix = STAGES.filter((s) => s !== "Closed Lost")
        .map((stage) => {
          const ds = open.filter((d) => d.stage === stage);
          return {
            label: stage as string,
            value: ds.reduce((s, d) => s + d.value, 0),
            color: STAGE_COLOR[stage as Stage],
            // The person carries their own headshot and the offering wears its
            // ServiceTag — this row used to put the contact in `sub` (flat text,
            // no face) and the offering in `name` (flat text, no glyph), which is
            // exactly what TipItem tells call sites not to do.
            tip: ds.map<TipItem>((d) => ({
              avatar: d.contactName,
              name: d.contactName,
              service: d.service,
              value: formatMoney(d.value),
            })),
          };
        })
        .filter((s) => s.value > 0);

      // No open pipeline → fall back to how the logged touches landed.
      const contactName = new Map(contacts.map((ct) => [ct.id, ct.full_name]));
      const outcome_mix =
        stage_mix.length > 0
          ? []
          : Object.keys(OUTCOME_CHART_COLOR)
              .map((o) => {
                const ints = interactions.filter((x) => x.outcome === o);
                const meta = OUTCOME_META[o as keyof typeof OUTCOME_META];
                return {
                  label: meta?.label ?? o,
                  value: ints.length,
                  color: OUTCOME_CHART_COLOR[o as keyof typeof OUTCOME_CHART_COLOR],
                  tip: ints.map<TipItem>((x) => ({
                    avatar: contactName.get(x.contact_id) || "Contact",
                    name: contactName.get(x.contact_id) || "A contact",
                    sub: formatDateTime(x.created_at),
                  })),
                };
              })
              .filter((s) => s.value > 0);

      const series = accountHealthSeries({
        interactions,
        deals,
        contactCount: contacts.length,
      });
      // The touches logged in each of the 5 trend weeks — the "why" behind
      // each health point.
      const WEEK = 7 * 86400000;
      const now = Date.now();
      const trend_tips = Array.from({ length: series.points.length }, (_, idx) => {
        const weeksAgo = series.points.length - 1 - idx;
        const end = now - weeksAgo * WEEK;
        const start = end - WEEK;
        return interactions
          .filter((x) => {
            const t = new Date(x.created_at).getTime();
            return t > start && t <= end;
          })
          .map<TipItem>((x) => ({
            avatar: contactName.get(x.contact_id) || "Contact",
            name: contactName.get(x.contact_id) || "A contact",
            sub: formatDateTime(x.created_at),
            value: x.outcome
              ? OUTCOME_META[x.outcome as keyof typeof OUTCOME_META]?.label
              : undefined,
          }));
      });

      return {
        ...c,
        contact_count: contacts.length,
        contacts_preview: contacts.map((ct) => ({ id: ct.id, name: ct.full_name })),
        last_outcome: interactions[0]?.outcome || null,
        last_session_date: sessions[0]?.created_at || null,
        health: accountHealth({
          interactions,
          deals,
          contactCount: contacts.length,
        }),
        stage_mix,
        outcome_mix,
        health_trend: series.points,
        trend_tips,
      };
    })
  );

  const { targets } = await readTargets();

  /* CUSTOMER GROUPS — named sets over the same accounts, with their numbers
     computed here rather than stored (Suren, Aug 28: "for every group, you can
     actually put these statistics"). A stored total is a total that goes stale
     the first time somebody edits a deal. */
  const [{ groups }, oppState, meetingState, offeringList] = await Promise.all([
    readCustomerGroups().catch(() => ({ groups: [] })),
    readOpportunities().catch(() => ({ opportunities: [] })),
    readMeetings()
      .then((st) => st.meetings)
      .catch(() => []),
    Promise.resolve(listOfferings()).catch(() => []),
  ]);
  const groupCustomers = enriched.map((c) => {
    const mine = oppState.opportunities.filter(
      (o) =>
        (o.customerId && o.customerId === c.id) || o.customer === c.company_name
    );
    /* Open means not yet decided. The "and not Future" that used to be here
       went with the level itself (Suren, Sep 1). */
    const open = mine.filter(
      (o) => o.status !== "Won" && o.status !== "Lost"
    );
    return {
      id: c.id,
      name: c.company_name,
      openValue: open.reduce((s, o) => s + opportunityValue(o), 0),
      openCount: open.length,
      meetings: meetingsForCustomer(meetingState, c.id, c.company_name).length,
    };
  });
  // WHO IS ACTUALLY IN THE APP (Anir, Aug 17: "if the owner is not in the
  // app, you can't just say that — it has to be like real data"). Target
  // owners come from the sheet; only the ones who are real members may wear
  // the member treatment.
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const directory =
    getDataMode() !== "mock" && workspace
      ? await listWorkspaceAccess(workspace).catch(() => null)
      : null;
  const memberNames = [
    ...new Set(
      (directory?.members ?? [])
        .filter((m) => m.active && m.accountType === "real")
        .map((m) => m.name.trim())
        .filter(Boolean)
    ),
  ];
  return (
    <div>
      <CustomersWorkspace
        routeTab={tab}
        customersProps={{
          customers: enriched,
          includeDemoTeam: getDataMode() === "mock",
          /* THE SAME GROUPING THE PIPELINE HAS (Anir, Aug 30: "bring that
             customer also, that kind of a grouping first — all the customers").
             The deals are what carry the money, so the summary reads them and
             counts the accounts. */
          deals: oppState.opportunities,
          customerGroups: groups.map((g) => ({
            id: g.id,
            name: g.name,
            color: g.color,
            customerIds: g.customerIds,
          })),
          offeringNames: Object.fromEntries(
            offeringList.map((o) => [o.id, o.offering_name])
          ),
        }}
        targets={targets}
        groups={groups}
        groupCustomers={groupCustomers}
        memberNames={memberNames}
        live={getDataMode() !== "mock"}
        canEditTargets={isManagerOrAdmin(await getRole())}
        /* THE GROUPS TAB ASKS THE SAME QUESTIONS THE ROUTE ASKS.
           Anir, Sep 1, walking the app as a BD Member: "It looks like I can
           create a new group. Is that right as a BD member? I don't know."

           It was not right. /api/customer-groups refuses `create` without
           CREATE on Customers, and a BD Member has edit — so the button was
           drawn for somebody the server would turn away. Worse, the prop
           behind it read `live ? canEditTargets || true : true`, which is
           `true` in every branch: the groups tab has been unconditionally
           editable for everybody, in both modes, since it was written. */
        canEditGroups={!(await moduleWriteRefusal("/customers"))}
        canCreateGroups={!(await moduleCreateRefusal("/customers"))}
      />
    </div>
  );
}
