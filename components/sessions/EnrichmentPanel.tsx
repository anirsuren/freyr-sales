import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SizeBadge, Badge } from "@/components/ui/Badge";
import type { Customer, Contact, RecommendedService } from "@/lib/types";

function RelevanceDots({ score }: { score: number }) {
  // score is 0-10 → 5 dots
  const filled = Math.max(0, Math.min(5, Math.round(score / 2)));
  return (
    <div className="flex items-center gap-1" title={`Relevance ${score}/10`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: i < filled ? "#0071E3" : "#D2D2D7" }}
        />
      ))}
    </div>
  );
}

export function EnrichmentPanel({
  customer,
  contact,
  services,
}: {
  customer: Customer;
  contact: Contact | null;
  services: RecommendedService[];
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Customer */}
      <Card>
        <div className="flex items-center justify-between gap-3 mb-3">
          <Link
            href={`/customers/${customer.id}`}
            className="text-[17px] font-semibold text-text-primary hover:text-blue-primary"
          >
            {customer.company_name}
          </Link>
          <SizeBadge tier={customer.size_tier} />
        </div>
        <dl className="text-[13px] space-y-1.5">
          <div className="flex gap-2">
            <dt className="text-text-tertiary w-20 shrink-0">Industry</dt>
            <dd className="text-text-primary">{customer.industry || "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-text-tertiary w-20 shrink-0">Geography</dt>
            <dd className="text-text-primary">{customer.geography || "—"}</dd>
          </div>
        </dl>
        <p className="text-[14px] text-text-secondary leading-relaxed mt-3">
          {customer.enrichment_summary}
        </p>
      </Card>

      {/* Contact */}
      {contact && (
        <Card>
          <div className="flex items-center justify-between gap-3 mb-1">
            <Link
              href={`/contacts/${contact.id}`}
              className="text-[17px] font-semibold text-text-primary hover:text-blue-primary"
            >
              {contact.full_name}
            </Link>
          </div>
          <p className="text-[13px] text-text-secondary">{contact.job_title}</p>
          <div className="mt-2">
            {contact.role_bucket && (
              <Badge
                label={contact.role_bucket}
                bg="rgba(0,113,227,0.10)"
                color="#0040A0"
                className="!normal-case tracking-normal"
              />
            )}
          </div>
          <p className="text-[14px] text-text-secondary leading-relaxed mt-3">
            {contact.career_summary}
          </p>
          {contact.linkedin_url && (
            <a
              href={contact.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[13px] text-blue-primary hover:underline mt-3"
            >
              View LinkedIn
              <ExternalLink size={13} strokeWidth={1.5} />
            </a>
          )}
        </Card>
      )}

      {/* Recommended services */}
      <div>
        <h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-[0.04em] mb-3">
          Recommended Services
        </h3>
        <div className="flex flex-col gap-3">
          {services?.map((s, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-[15px] font-semibold text-text-primary">
                  {s.service_name}
                </span>
                <RelevanceDots score={s.relevance_score} />
              </div>
              <p className="text-[13px] text-text-secondary leading-relaxed">
                {s.pitch_angle}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
