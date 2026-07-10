import Link from "next/link";
import { getDb } from "@/lib/db";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchX, ArrowLeft } from "lucide-react";
import { IntelligenceRail } from "@/components/sessions/IntelligenceRail";
import { PitchWorkspace } from "@/components/sessions/PitchWorkspace";
import { RecordView } from "@/components/RecordView";
import { SIZE_TIER_LABEL } from "@/lib/utils";
import type { RecommendedService } from "@/lib/types";

export const metadata = { title: "Session" };
export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: { id: string };
}) {
  const db = getDb();
  const session = await db.pitchSessions.get(params.id);

  if (!session) {
    return (
      <EmptyState
        icon={SearchX}
        title="Session not found"
        description="This pitch session doesn't exist yet, or the link is invalid. Head back to your sessions to find it."
        className="py-24"
        action={
          <Link
            href="/sessions"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            Back to sessions
          </Link>
        }
      />
    );
  }

  const customer = await db.customers.get(session.customer_id);
  const contact = await db.contacts.get(session.contact_id);
  const interactions = await db.interactions.list(undefined, session.contact_id);
  const services = (session.recommended_services || []) as RecommendedService[];
  const shortName = customer?.company_name?.split(/\s+/)[0] || "Account";
  const topSvc = services[0]?.service_name || "regulatory support";

  const accountBrief = customer
    ? {
        summary: customer.enrichment_summary || "",
        facts: [
          { label: "Industry", value: customer.industry || "—" },
          { label: "Geography", value: customer.geography || "—" },
          {
            label: "Size",
            value: customer.size_tier
              ? SIZE_TIER_LABEL[customer.size_tier] || customer.size_tier
              : "—",
          },
          {
            label: "Website",
            value: customer.website_url
              ? customer.website_url.replace(/^https?:\/\//, "")
              : "—",
          },
        ],
        contactName: contact?.full_name || "—",
        contactRole: contact?.job_title || "",
        contactBackground:
          contact?.career_summary || contact?.enrichment_summary || "",
      }
    : undefined;

  const objections = [
    {
      q: "We already have a regulatory vendor.",
      a: `Many teams run us alongside an incumbent for ${topSvc} — worth 20 minutes to see where we'd add capacity, especially heading into a filing.`,
    },
    {
      q: "Now isn't the right time.",
      a: `Understood. Given ${shortName}'s upcoming milestones, a short scoping call now de-risks the timeline rather than waiting until it's tight.`,
    },
    {
      q: "How are you different from the big CROs?",
      a: "Former FDA/EMA reviewers on every dossier and 5,000+ submissions completed — agency-side judgment, not just extra hands.",
    },
    {
      q: "What does it cost?",
      a: "It scopes to the work — let me show how we'd approach your filing first, then the pricing conversation is straightforward.",
    },
  ];

  return (
    <div className="flex h-full overflow-hidden">
      <RecordView
        type="Session"
        label={`${shortName} — pitch session`}
        sublabel={contact?.full_name || ""}
        href={`/sessions/${session.id}`}
      />
      {customer && (
        <IntelligenceRail
          customer={customer}
          contact={contact}
          services={services}
        />
      )}

      <div className="flex-1 min-w-0 bg-white overflow-hidden">
        <PitchWorkspace
          sessionId={session.id}
          title={`Executive Briefing: ${shortName} Submission Dossiers`}
          lastActivityAt={
            [...interactions].sort(
              (a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )[0]?.created_at || session.created_at
          }
          pitch5min={session.pitch_5min_script}
          pitchEmail={session.pitch_email}
          pitchCall={session.pitch_call_script}
          accountBrief={accountBrief}
          objections={objections}
          initialReviewStatus={session.review_status || "draft"}
          initialReviewNote={session.review_note || null}
          recipientEmail={contact?.email || ""}
          recipientName={contact?.full_name || ""}
          companyName={customer?.company_name || ""}
        />
      </div>
    </div>
  );
}
