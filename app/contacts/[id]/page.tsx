import Link from "next/link";
import {
  Mail,
  Phone,
  Clock,
  CalendarClock,
  Users,
  Brain,
  CheckCircle2,
  XCircle,
  SearchX,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  MapPin,
  Target,
  FileText,
  ShieldCheck,
  Award,
  FlaskConical,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { LinkedInLink } from "@/components/ui/LinkedInLink";
import { ContactSessions } from "@/components/sessions/ContactSessions";
import { InteractionTimeline } from "@/components/customers/InteractionTimeline";
import { ContactAgentCard } from "@/components/agent/ContactAgentCard";
import { BriefingCard } from "@/components/agent/BriefingCard";
import { personaFor } from "@/lib/persona";
import { suggestForContact, buildContactBriefing } from "@/lib/agent";
import { RecordView } from "@/components/RecordView";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ContactOutreachPanel } from "@/components/contacts/ContactOutreachPanel";
import { rankOfferingsForContact } from "@/lib/outreach";
import { listCustomerTypes, listOfferings } from "@/lib/offerings";
import { hasElevenLabs } from "@/lib/env";

export const metadata = { title: "Contact" };
export const dynamic = "force-dynamic";

// Color-code + icon a skill by its domain (Suren's standing rule: categories
// like this always get a color and an icon). Keyword-matched so it's robust to
// wording ("Regulatory Strategy", "Reg Affairs", "Submissions Ops", …).
const SKILL_STYLES: { test: RegExp; bg: string; color: string; icon: LucideIcon }[] = [
  { test: /complian|audit|gxp|gvp|inspection/i, bg: "rgba(225,29,72,0.10)", color: "#BE123C", icon: ShieldCheck },
  { test: /submiss|document|dossier|publish|ectd/i, bg: "rgba(124,58,237,0.10)", color: "#6D28D9", icon: FileText },
  { test: /quality|qa\b|cmc|manufactur|gmp/i, bg: "rgba(217,119,6,0.12)", color: "#B45309", icon: Award },
  { test: /clinical|medical|scientif|pharmacovig|safety|drug/i, bg: "rgba(5,150,105,0.12)", color: "#047857", icon: FlaskConical },
  { test: /label|artwork|packag/i, bg: "rgba(15,157,140,0.12)", color: "#0F766E", icon: Tag },
  { test: /regulat|strategy|affairs|intellig|policy/i, bg: "rgba(0,113,227,0.10)", color: "#0040A0", icon: Target },
];
function skillStyle(skill: string): { bg: string; color: string; icon: LucideIcon } {
  const hit = SKILL_STYLES.find((s) => s.test.test(skill));
  return hit ?? { bg: "rgba(100,116,139,0.12)", color: "#475569", icon: Sparkles };
}

// Human "3 days ago" / "in 5 days" for the where-things-stand timeline.
function relDaysLabel(dateStr: string | null, mode: "past" | "future"): string | null {
  if (!dateStr) return null;
  const days = Math.round(
    Math.abs(Date.now() - new Date(dateStr).getTime()) / 86400000
  );
  if (days === 0) return "today";
  const unit = `${days} day${days === 1 ? "" : "s"}`;
  return mode === "past" ? `${unit} ago` : `in ${unit}`;
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;
  const db = getDb();
  const contact = await db.contacts.get(id);

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
  const sessions = await db.pitchSessions.list(undefined, id);
  const interactions = await db.interactions.list(undefined, id);
  const siblings = customer
    ? (await db.contacts.list(customer.id)).filter((c) => c.id !== id)
    : [];

  const linkedin = contact.raw_linkedin_data || {};
  const experience: any[] = linkedin.experience || [];
  const skills: string[] = linkedin.skills || [];
  const about: string = linkedin.about || contact.career_summary || "";

  const persona = personaFor(contact.role_bucket);
  const lastContacted = interactions[0]?.created_at || null;
  const nextStep = interactions.find((i) => i.follow_up_date)?.follow_up_date || null;

  // Contact⇄offering link (Suren, Jul 3): the contact inherits the customer's
  // applicable offerings; their role keywords rank which fit THIS person best.
  const matchedType = customer?.customer_type
    ? listCustomerTypes().find((t) => t.name === customer.customer_type)
    : null;
  const contactApplicable = matchedType
    ? listOfferings().filter((o) =>
        o.customer_type_ids.includes(matchedType.id)
      )
    : [];
  const rankedOfferings = rankOfferingsForContact(contact, contactApplicable).map(
    ({ offering, score, matched }) => ({
      id: offering.id,
      name: offering.offering_name,
      category: offering.offering_category,
      type: offering.offering_type,
      availability: offering.current_availability,
      score,
      matched,
      materials: offering.materials.length,
    })
  );

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
    lastContacted: lastContacted ? formatDateTime(lastContacted) : null,
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
            <div className="flex items-center gap-2">
              <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
                {contact.full_name}
              </h1>
              <LinkedInLink url={contact.linkedin_url} size={18} />
            </div>
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
                  className="group inline-flex items-center gap-1.5 text-[13px] text-blue-primary hover:underline"
                >
                  <CompanyLogo name={customer.company_name} className="w-4 h-4 text-[7px] shrink-0" />
                  {customer.company_name}
                  <ArrowRight size={13} strokeWidth={1.8} className="group-hover:translate-x-0.5 transition-transform" />
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
        </div>
      </div>

      {/* One-line next move (Anir's audit: identity first, no text wall up
          top). The FULL pre-call brief stays — it moved below the working
          area, right where a rep preps before dialing. */}
      <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-blue-subtle bg-blue-light/40 px-4 py-2.5">
        <span className="w-6 h-6 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0">
          <Sparkles size={14} strokeWidth={1.9} />
        </span>
        <p className="text-[13px] text-text-primary min-w-0 truncate">
          <span className="font-semibold">Next move:</span>{" "}
          {contactSuggestion.title}
        </p>
      </div>

      {/* Where things stand — a small timeline: last contacted → today → next
          step (Suren: "I want a whole timeline… where we are right now"). */}
      <Card className="mb-8">
        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            Where things stand
          </h3>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium rounded-full bg-blue-light text-blue-primary px-2.5 py-1">
            <Brain size={13} strokeWidth={1.9} />
            Buying style: {persona.code} · {persona.label.split(" — ")[0]}
          </span>
        </div>
        <div className="flex items-start">
          {/* Last contacted */}
          <div className="flex flex-col items-center text-center flex-1 min-w-0">
            <span className="w-10 h-10 rounded-full bg-surface border border-border-light text-text-secondary flex items-center justify-center">
              <Clock size={17} strokeWidth={1.8} />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mt-2.5">
              Last contacted
            </p>
            <p className="text-[13px] font-semibold text-text-primary mt-0.5 tnum">
              {lastContacted ? formatDateTime(lastContacted) : "No contact yet"}
            </p>
            {lastContacted && (
              <p className="text-[11px] text-text-tertiary mt-0.5">
                {relDaysLabel(lastContacted, "past")}
              </p>
            )}
          </div>

          {/* Past segment — solid, it already happened */}
          <div className="flex-1 mt-[19px] min-w-[24px] h-[3px] rounded-full bg-gradient-to-r from-border to-blue-primary" />

          {/* Today — you are here, with a live pulsing beacon */}
          <div className="flex flex-col items-center text-center flex-1 min-w-0">
            <span className="relative flex items-center justify-center w-10 h-10">
              {/* blinking beacon */}
              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-primary/40 animate-ping" />
              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-primary/15" />
              <span className="relative w-10 h-10 rounded-full bg-blue-primary text-white flex items-center justify-center shadow-[0_4px_12px_rgba(0,113,227,0.45)]">
                <MapPin size={17} strokeWidth={2} />
              </span>
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-blue-primary mt-2.5 inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-primary animate-pulse" />
              You are here
            </p>
            <p className="text-[13px] font-bold text-blue-primary mt-0.5">Today</p>
            <p className="text-[11px] text-blue-primary/70 mt-0.5 tnum">
              {formatDate(new Date().toISOString())}
            </p>
          </div>

          {/* Future segment — dashed, it hasn't happened yet */}
          <div className="flex-1 mt-[19px] min-w-[24px] h-0 border-t-2 border-dashed border-blue-subtle" />

          {/* Next step */}
          <div className="flex flex-col items-center text-center flex-1 min-w-0">
            <span
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                nextStep
                  ? "bg-white border-2 border-dashed border-blue-subtle text-blue-primary"
                  : "bg-surface border border-border-light text-text-tertiary"
              }`}
            >
              <CalendarClock size={17} strokeWidth={1.8} />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mt-2.5">
              Next step
            </p>
            <p className="text-[13px] font-semibold text-text-primary mt-0.5 tnum">
              {nextStep ? formatDate(nextStep) : "Not scheduled"}
            </p>
            {nextStep && (
              <p className="text-[11px] text-text-tertiary mt-0.5">
                {relDaysLabel(nextStep, "future")}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Offerings for this person + on-demand outreach (Suren, Jul 3) — his
          first-level requirement on a contact, so it LEADS the working area;
          the profile/persona reference cards follow below. */}
      <ContactOutreachPanel
        contactId={contact.id}
        customerId={customer?.id || null}
        firstName={contact.full_name.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, "").split(/\s+/)[0]}
        companyName={customer?.company_name || "their account"}
        classified={!!matchedType}
        offerings={rankedOfferings}
        voiceWired={hasElevenLabs()}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start mt-8">
        {/* Left: who they are + who else we know there — the two shorter cards
            pair up so neither column ends in a void. */}
        <div className="space-y-8">
        <Card>
          <h2 className="flex items-center gap-2 text-[17px] font-semibold text-text-primary mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/linkedin.webp"
              alt="LinkedIn"
              width={20}
              height={20}
              className="rounded-[4px] shrink-0"
            />
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
                {skills.map((s, i) => {
                  const st = skillStyle(s);
                  const SIcon = st.icon;
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-md"
                      style={{ background: st.bg, color: st.color }}
                    >
                      <SIcon size={12} strokeWidth={2} />
                      {s}
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </Card>

          <Card>
            <h2 className="text-[17px] font-semibold text-text-primary mb-1 flex items-center gap-2">
              <Users size={18} strokeWidth={1.75} className="text-blue-primary" />
              Who else you know here
            </h2>
            <p className="text-[12.5px] text-text-tertiary mb-3 leading-relaxed">
              The other people you know at {customer?.company_name || "this account"}. Deals stall when
              they hang on one person — the more contacts you&apos;re talking to, the safer it is. Click anyone to open them.
            </p>
            {siblings.length === 0 ? (
              <p className="text-[13px] text-text-secondary">
                {contact.full_name.replace(/^(Dr|Mr|Ms|Mrs|Prof)\.?\s+/i, "").split(/\s+/)[0]} is your only contact at {customer?.company_name || "this account"} right
                now — that&apos;s risky. Find a second person (a peer or their manager) so the deal doesn&apos;t rest on one relationship.
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

        {/* Right: the agent's read — recommendation + how to engage */}
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

        </div>
      </div>

      {/* Full pre-call brief — everything the agent knows, right before the
          rep preps the call (moved down from the top; nothing removed). */}
      <div className="mt-8">
        <BriefingCard briefing={contactBriefing} label="Pre-call brief" />
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
