import Link from "next/link";
import { History, GraduationCap } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { LinkedInLink } from "@/components/ui/LinkedInLink";
import { SIZE_TIER_LABEL } from "@/lib/utils";
import type { Customer, Contact, RecommendedService } from "@/lib/types";

function MatchBar({ pct }: { pct: number }) {
  return (
    <div className="h-1 rounded-full bg-border-light overflow-hidden">
      <div
        className="h-full bg-blue-primary rounded-full"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function IntelligenceRail({
  customer,
  contact,
  services,
}: {
  customer: Customer;
  contact: Contact | null;
  services: RecommendedService[];
}) {
  return (
    <section className="hidden lg:block w-[320px] shrink-0 bg-surface border-r border-border-light overflow-y-auto p-4 space-y-5">
      <h2 className="text-[17px] font-semibold text-text-primary">
        Intelligence
      </h2>

      {/* Account card */}
      <div className="bg-white border border-border-light rounded-xl p-4 shadow-card">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1">
              Account
            </p>
            <Link
              href={`/customers/${customer.id}`}
              className="text-[15px] font-semibold text-text-primary leading-tight hover:text-blue-primary"
            >
              {customer.company_name}
            </Link>
          </div>
          <CompanyLogo
            name={customer.company_name}
            className="w-10 h-10 text-[13px] rounded-lg"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {customer.size_tier && (
            <span className="bg-blue-light text-blue-primary text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-[0.04em]">
              {SIZE_TIER_LABEL[customer.size_tier] || customer.size_tier}
            </span>
          )}
          {customer.industry && (
            <span className="bg-surface border border-border-light text-text-secondary text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-[0.04em]">
              {customer.industry}
            </span>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-border-light">
          {/* Stacked so a long location wraps cleanly instead of glitching onto
              two right-aligned lines (Suren: "can never glitch out like this"). */}
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1">
            Geography
          </p>
          <p className="text-[13px] font-medium text-text-primary">
            {customer.geography || "—"}
          </p>
        </div>
      </div>

      {/* Persona card */}
      {contact && (
        <div className="bg-white border border-border-light rounded-xl p-4 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <Avatar name={contact.full_name} className="w-12 h-12 text-[15px]" />
            <div>
              <span className="flex items-center gap-1.5">
                <Link
                  href={`/contacts/${contact.id}`}
                  className="text-[15px] font-semibold text-text-primary leading-none hover:text-blue-primary"
                >
                  {contact.full_name}
                </Link>
                <LinkedInLink url={contact.linkedin_url} size={14} />
              </span>
              <p className="text-[13px] text-text-secondary mt-1">
                {contact.job_title}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {contact.role_bucket && (
              <div className="flex items-center gap-2 text-[13px]">
                <History size={16} strokeWidth={1.5} className="text-blue-primary" />
                <span className="text-text-secondary">{contact.role_bucket}</span>
              </div>
            )}
            {contact.career_summary && (
              <div className="flex items-start gap-2 text-[13px]">
                <GraduationCap
                  size={16}
                  strokeWidth={1.5}
                  className="text-blue-primary mt-0.5 shrink-0"
                />
                <span className="text-text-secondary leading-relaxed">
                  {contact.career_summary}
                </span>
              </div>
            )}
            {contact.enrichment_summary && (
              <div className="p-2.5 bg-surface rounded-lg border-l-2 border-blue-primary text-[13px] text-text-secondary italic leading-relaxed">
                {contact.enrichment_summary}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recommended solutions */}
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary mb-3">
          Recommended Solutions
        </h3>
        <div className="space-y-3">
          {services?.map((s, i) => {
            const pct = Math.max(
              0,
              Math.min(100, Math.round((s.relevance_score || 0) * 10))
            );
            return (
              <div
                key={i}
                className="bg-white p-3 rounded-lg border border-border-light hover:border-blue-subtle transition-colors"
              >
                <div className="flex justify-between items-center mb-2 gap-2">
                  <span className="text-[14px] font-semibold text-text-primary">
                    {s.service_name}
                  </span>
                  <span className="text-blue-primary font-bold text-[12px] tnum">
                    {pct}%
                  </span>
                </div>
                <MatchBar pct={pct} />
                {s.pitch_angle && (
                  <p className="text-[12px] text-text-secondary mt-2 leading-relaxed">
                    {s.pitch_angle}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
