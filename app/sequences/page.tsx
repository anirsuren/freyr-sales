import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { buildDeals, ROTTING_DAYS } from "@/lib/pipeline";
import {
  SequencesView,
  type Enrollment,
} from "@/components/sequences/SequencesView";
import { SequenceAgentBanner } from "@/components/sequences/SequenceAgentBanner";
import { SEQUENCES } from "@/lib/sequences";

export const metadata = { title: "Sequences" };
export const dynamic = "force-dynamic";

const REENGAGE = SEQUENCES.find((s) => s.id === "reengage")!;

export default async function SequencesPage() {
  const db = getDb();
  const [sessions, customers, contacts, interactions, persisted] =
    await Promise.all([
      db.pitchSessions.list(),
      db.customers.list(),
      db.contacts.list(),
      db.interactions.list(),
      db.sequenceEnrollments.list(),
    ]);

  // Active accounts (engaged / qualified / meeting booked) are modeled as
  // enrolled in the primary cadence; the step is derived from days of activity.
  const deals = buildDeals(sessions, customers, contacts, interactions);
  const steps = SEQUENCES[0].steps.length;
  const seen = new Set<string>();
  const derived: Enrollment[] = deals
    .filter(
      (d) =>
        d.stage === "Engaged" ||
        d.stage === "Qualified" ||
        d.stage === "Meeting Booked"
    )
    .filter((d) => (seen.has(d.customerId) ? false : (seen.add(d.customerId), true)))
    .map((d) => ({
      customerId: d.customerId,
      company: d.company,
      stage: d.stage,
      stepIndex: Math.min(steps - 1, Math.floor(d.staleDays / 3)),
      sequenceId: "reg-exec",
    }));

  // Persisted enrollments the agent created (any cadence).
  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const persistedEnrollments: Enrollment[] = persisted.map((e) => ({
    customerId: e.customer_id,
    company: custById[e.customer_id]?.company_name || "Account",
    stage: "Enrolled",
    stepIndex: e.step_index,
    sequenceId: e.sequence_id,
    enrollmentId: e.id,
    managed: true,
  }));
  const enrollments = [...derived, ...persistedEnrollments];

  // Candidates for the agent: cooling deals not yet in the re-engagement cadence.
  const inReengage = new Set(
    persisted.filter((e) => e.sequence_id === "reengage").map((e) => e.customer_id)
  );
  const candSeen = new Set<string>();
  const candidateCount = deals.filter(
    (d) =>
      d.staleDays > ROTTING_DAYS &&
      d.stage !== "Closed Lost" &&
      !inReengage.has(d.customerId) &&
      (candSeen.has(d.customerId) ? false : (candSeen.add(d.customerId), true))
  ).length;

  // Accounts already enrolled in re-engagement who are due a next touch.
  const dueCount = persisted.filter(
    (e) => e.sequence_id === "reengage" && e.step_index < REENGAGE.steps.length - 1
  ).length;

  return (
    <div>
      <PageHeader
        title="Sequences"
        subtitle="A sequence is a step-by-step outreach plan — emails and calls spaced over days — and which accounts are working through it."
        action={
          <HowItWorks title="How sequences work">
            <p>
              The agent preps each step for you — it drafts the emails and sets
              reminders for the calls — then you review, approve, and send.
            </p>
            <p>
              <span className="font-semibold text-text-primary">
                It never emails or dials on its own.
              </span>{" "}
              Every message goes out from you, only to contacts who&apos;ve agreed
              to hear from you — so you stay in control and compliant.
            </p>
          </HowItWorks>
        }
      />
      <SequenceAgentBanner
        candidateCount={candidateCount}
        dueCount={dueCount}
        sequenceId={REENGAGE.id}
        sequenceName={REENGAGE.name}
      />
      <SequencesView enrollments={enrollments} />
    </div>
  );
}
