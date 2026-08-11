import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CompanyIntel } from "@/components/market-intel/CompanyIntel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Radar } from "lucide-react";
import { miCompany } from "@/lib/marketIntelMock";

export const dynamic = "force-dynamic";

export default async function MarketIntelCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = miCompany(id);
  if (!company) {
    return (
      <div>
        <Link
          href="/market-intel"
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
        >
          <ArrowLeft size={14} strokeWidth={2} /> Market Intelligence
        </Link>
        <EmptyState
          icon={Radar}
          title="This company is on the watchlist"
          description="It is tracked for signals but has no notable activity in the sample window yet. Open one of the companies on the dashboard to see a full briefing."
        />
      </div>
    );
  }
  return <CompanyIntel company={company} />;
}
