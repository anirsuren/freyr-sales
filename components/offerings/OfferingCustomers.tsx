import Link from "next/link";
import { Activity, Building2, ChevronRight, Layers } from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { InfoHint } from "@/components/ui/InfoHint";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActivityChip, StatusChip } from "@/components/customers/OfferingActivities";
import type { CustomerOfferingEngagementVersion } from "@/lib/types";

/**
 * WHO IS ON THIS OFFERING, AND ON WHICH VERSION.
 *
 * Suren, Aug 9: "in the offering angle, I want to also know all the customers
 * of this offering. Put a customer tab here… for all the customers, along with
 * which release is going on and all that." The link already existed from the
 * customer's side and from the component's side; the offering was the one
 * place you could not ask the question.
 *
 * An offering is a package of FDL components, so "which release is going on"
 * is per component: the version each account runs of each piece in the
 * package. Accounts with no version recorded are still listed, because the
 * gap is the useful part.
 */

export type OfferingCustomerRow = {
  id: string;
  name: string;
  /** The activity marked current for this offering, if any. */
  current: CustomerOfferingEngagementVersion | null;
  /** One line per component in this offering that the account runs. */
  versions: { component: string; version: string | null }[];
};

export function OfferingCustomers({
  rows,
  offeringName,
}: {
  rows: OfferingCustomerRow[];
  offeringName: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No customer is on this offering yet"
        description={`Log an activity against ${offeringName} on a customer's Activity tab, or connect one of its components to an account, and they appear here.`}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* TWO TABLES, NOT ONE (Suren, Aug 9: "this table is offering activity.
          Next table is versions. We cannot combine both"). They answer
          different questions and mixing them made a row that read as neither:
          where the deal stands is a sales fact, which version they run is a
          delivery fact. */}
      <section className="rounded-xl border border-border-light bg-white p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
          <Activity size={15} strokeWidth={2} className="text-blue-primary" />
          Offering activity
          <InfoHint text="Where each account stands on this offering right now. This is the activity marked Current on their own page." />
        </h2>
        <p className="mt-0.5 text-[12.5px] text-text-secondary">
          {rows.length} {rows.length === 1 ? "account" : "accounts"} on{" "}
          {offeringName}.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left">
            <thead>
              <tr className="border-b border-border-light text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Where it stands</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {rows.map((row) => (
                <tr key={row.id} className="group transition-colors hover:bg-blue-light/30">
                  <td className="py-2.5 pr-4">
                    <Link
                      href={`/customers/${row.id}?tab=activity`}
                      className="flex items-center gap-2.5 text-[13px] font-semibold text-text-primary group-hover:text-blue-primary"
                    >
                      <CompanyLogo name={row.name} className="h-7 w-7 shrink-0" />
                      {row.name}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4">
                    {row.current ? (
                      <ActivityChip activity={row.current.activity} />
                    ) : (
                      <span className="text-[12.5px] text-text-secondary">
                        Nothing logged yet
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    {row.current ? (
                      <StatusChip status={row.current.status} />
                    ) : (
                      <span className="text-[12.5px] text-text-tertiary">Not set yet</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <ChevronRight
                      size={15}
                      strokeWidth={2}
                      className="inline text-text-tertiary transition-colors group-hover:text-blue-primary"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border-light bg-white p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
          <Layers size={15} strokeWidth={2} className="text-blue-primary" />
          Versions they run
          <InfoHint text="The version of each piece of software in this offering that the account is on. It is the same record their Digital components tab writes." />
        </h2>
        <p className="mt-0.5 text-[12.5px] text-text-secondary">
          One row per account, one chip per component.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left">
            <thead>
              <tr className="border-b border-border-light text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Version</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {rows.map((row) => (
                <tr key={row.id} className="group transition-colors hover:bg-blue-light/30">
                  <td className="py-2.5 pr-4">
                    <Link
                      href={`/customers/${row.id}?tab=components`}
                      className="flex items-center gap-2.5 text-[13px] font-semibold text-text-primary group-hover:text-blue-primary"
                    >
                      <CompanyLogo name={row.name} className="h-7 w-7 shrink-0" />
                      {row.name}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4">
                    {row.versions.length === 0 ? (
                      <span className="text-[12.5px] text-text-tertiary">
                        No version recorded
                      </span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {row.versions.map((v) => (
                          <span
                            key={v.component}
                            className="inline-flex items-center gap-1 rounded-full border border-border-light px-2 py-0.5 text-[11.5px] text-text-secondary"
                          >
                            <span className="font-semibold text-text-primary">
                              {v.component}
                            </span>
                            {v.version ?? "not set"}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <ChevronRight
                      size={15}
                      strokeWidth={2}
                      className="inline text-text-tertiary transition-colors group-hover:text-blue-primary"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
