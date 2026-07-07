import Link from "next/link";
import {
  Mail,
  Phone,
  ExternalLink,
  Clock,
  CalendarClock,
  Users,
  Brain,
  CheckCircle2,
  XCircle,
  SearchX,
  ArrowLeft,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { ContactSessions } from "@/components/sessions/ContactSessions";
import { InteractionTimeline } from "@/components/customers/InteractionTimeline";
import { ContactAgentCard } from "@/components/agent/ContactAgentCard";
import { BriefingCard } from "@/components/agent/BriefingCard";
import { personaFor } from "@/lib/persona";
import { suggestForContact, buildContactBriefing } from "@/lib/agent";
import { RecordView } from "@/components/RecordView";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Contact" };
export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const db = getDb();
  const contact = await db.contacts.get(params.id);

  if (!contact) {
    return (
      <EmptyState
        icon={SearchX}
        title="Contact not found"
        description="The link may be out of date, or this contact was removed. Head back to your contacts to find them."
        className="py-24"
        action={
          <Link
            href="/contacts"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            Back to contacts
          </Link>
        }
      />
    );
  }

  const customer = await db.customers.get(contact.customer_id);
  const sessions = await db.pitchSessions.list(undefined, params.id);
  const interactions = await db.interactions.list(undefined, params.id);
  const siblings = customer
    ? (await db.contacts.list(customer.id)).filter((c) => c.id !== params.id)
    : [];

  const linkedin = contact.raw_linkedin_data || {};
  const experience: any[] = linkedin.experience || [];
  const skills: string[] = linkedin.skills || [];
  const about: string = linkedin.about || contact.career_summary || "";

  const persona = personaFor(contact.role_bucket);
  const lastContacted = interactions[0]?.created_at || null;
  const nextStep = interactions.find((i) => i.follow_up_date)?.follow_up_date || null;

  // Pre-call contact briefing (#74) — the agent's read on this individual.
  const contactSuggestion = suggestForContact({
    fullName: contact.full_name,
    company: customer?.company_name || "this account",
    hasFollowUp: !!nextStep,
    everContacted: interactions.length > 0,
    siblingCount: siblings.length,
  });
  const contactBriefing = buildContactBriefing({
    fullName: contact.full_name,
    jobTitle: contact.job_title,
    company: customer?.company_name || "this account",
    buyingStyle: persona.label,
    engageTip: persona.engage[0],
    lastContacted: lastContacted ? formatDate(lastContacted) : null,
    nextStep: nextStep ? formatDate(nextStep) : null,
    siblingCount: siblings.length,
    everContacted: interactions.length > 0,
    recommendation: contactSuggestion.title,
  });

  return (
    <div>
      <RecordView
        type="Contact"
        label={contact.full_name}
        sublabel={contact.job_title || ""}
        href={`/contacts/${contact.id}`}
      />
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Avatar name={contact.full_name} className="w-12 h-12 text-[16px]" />
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
              {contact.full_name}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {contact.role_bucket && (
                <Badge
                  label={contact.role_bucket}
                  bg="rgba(0,113,227,0.10)"
                  color="#0040A0"
                  className="!normal-case tracking-normal"
                />
              )}
              {customer && (
                <Link
                  href={`/customers/${customer.id}`}
                  className="text-[13px] text-blue-primary hover:underline"
                >
                  {customer.company_name} →
                </Link>
              )}
            </div>
          </div>
        </div>
        {/* Quick actions */}
        <div className="flex gap-2 shrink-0">
          <a
            href={contact.email ? `mailto:${contact.email}` : "#"}
            aria-disabled={!contact.email}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-[13px] font-medium text-text-secondary hover:bg-surface transition-colors"
          >
            <Mail size={16} strokeWidth={1.5} /> Email
          </a>
          <a
            href={contact.phone ? `tel:${contact.phone}` : "#"}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-[13px] font-medium text-text-secondary hover:bg-surface transition-colors"
          >
            <Phone size={16} strokeWidth={1.5} /> Call
          </a>
          {contact.linkedin_url && (
            <a
              href={contact.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-primary text-white text-[13px] font-medium hover:bg-blue-hover transition-colors"
            >
              <ExternalLink size={16} strokeWidth={1.5} /> LinkedIn
            </a>
          )}
        </div>
      </div>

      {/* Pre-call contact briefing (#74) */}
      <div className="mb-8">
        <BriefingCard briefing={contactBriefing} label="Pre-call brief" />
      </div>

      {/* Stat row: last contacted / next step / buying style */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary flex items-center gap-1.5">
            <Clock size={13} strokeWidth={1.5} /> Last contacted
          </p>
          <p className="text-[15px] text-text-primary mt-1.5 tnum">
            {lastContacted ? formatDate(lastContacted) : "No contact yet"}
          </p>
        </Card>
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary flex items-center gap-1.5">
            <CalendarClock size={13} strokeWidth={1.5} /> Next step
          </p>
          <p className="text-[15px] text-text-primary mt-1.5 tnum">
            {nextStep ? formatDate(nextStep) : "Not scheduled"}
          </p>
        </Card>
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary flex items-center gap-1.5">
            <Brain size={13} strokeWidth={1.5} /> Buying style
          </p>
          <p className="text-[15px] text-text-primary mt-1.5">
            <span className="font-semibold">{persona.code}</span> · {persona.label.split(" — ")[0]}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* LinkedIn profile */}
        <Card>
          <h2 className="text-[17px] font-semibold text-text-primary mb-3">
            LinkedIn Profile
          </h2>
          {about && (
            <p className="text-[14px] text-text-secondary leading-relaxed mb-5">
              {about}
            </p>
          )}
          {experience.length > 0 && (
            <>
              <h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-[0.04em] mb-3">
                Experience
              </h3>
              <ol className="border-l border-border-light pl-4 space-y-4 mb-5">
                {experience.map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-blue-primary" />
                    <p className="text-[14px] font-medium text-text-primary">{e.title}</p>
                    <p className="text-[13px] text-text-secondary">
                      {e.company}
                      {e.duration ? ` · ${e.duration}` : ""}
                    </p>
                    {e.description && (
                      <p className="text-[13px] text-text-tertiary mt-1 leading-relaxed">
                        {e.description}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
          {skills.length > 0 && (
            <>
              <h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-[0.04em] mb-3">
                Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {skills.map((s, i) => (
                  <span
                    key={i}
                    className="text-[12px] px-2.5 py-1 rounded-md bg-surface text-text-secondary border border-border-light"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Agent + persona + multi-thread */}
        <div className="space-y-8">
          {customer && (
            <ContactAgentCard
              customerId={customer.id}
              fullName={contact.full_name}
              company={customer.company_name}
              hasFollowUp={!!nextStep}
              everContacted={!!lastContacted}
              siblingCount={siblings.length}
            />
          )}
          <Card>
            <h2 className="text-[17px] font-semibold text-text-primary mb-1 flex items-center gap-2">
              <Brain size={18} strokeWidth={1.75} className="text-blue-primary" />
              How to engage
            </h2>
            <p className="text-[12px] text-text-tertiary mb-3">
              Inferred buying style: <span className="font-semibold text-text-secondary">{persona.label}</span>
            </p>
            <p className="text-[14px] text-text-secondary leading-relaxed mb-4">{persona.blurb}</p>
            <div className="space-y-2 mb-4">
              {persona.engage.map((e, i) => (
                <div key={i} className="flex gap-2 text-[13px] text-text-primary">
                  <CheckCircle2 size={15} className="text-success mt-0.5 shrink-0" strokeWidth={1.75} />
                  {e}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {persona.avoid.map((a, i) => (
                <div key={i} className="flex gap-2 text-[13px] text-text-secondary">
                  <XCircle size={15} className="text-error mt-0.5 shrink-0" strokeWidth={1.75} />
                  Avoid: {a}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-[17px] font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Users size={18} strokeWidth={1.75} className="text-blue-primary" />
              Multi-thread map
            </h2>
            {siblings.length === 0 ? (
              <p className="text-[13px] text-text-secondary">
                No other contacts mapped at {customer?.company_name || "this account"} yet — worth widening the thread.
              </p>
            ) : (
              <ul className="space-y-2">
                {siblings.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/contacts/${s.id}`}
                      className="flex items-center gap-3 p-2 -m-2 rounded-lg hover:bg-surface transition-colors"
                    >
                      <Avatar name={s.full_name} className="w-8 h-8 text-[12px]" />
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium text-text-primary truncate">
                          {s.full_name}
                        </span>
                        <span className="block text-[12px] text-text-tertiary truncate">
                          {s.job_title}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Pitch sessions */}
      <div className="mt-8">
        <h2 className="text-[17px] font-semibold text-text-primary mb-3">
          Pitch Sessions
        </h2>
        <ContactSessions sessions={sessions} />
      </div>

      {/* Interaction timeline */}
      <div className="mt-10">
        <h2 className="text-[17px] font-semibold text-text-primary mb-4">
          Interaction History
        </h2>
        <InteractionTimeline interactions={interactions} />
      </div>
    </div>
  );
}
