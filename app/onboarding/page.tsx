import { PageHeader } from "@/components/layout/PageHeader";
import { OnboardingHub } from "@/components/onboarding/OnboardingHub";
import { getDataMode } from "@/lib/dataMode";
import { isOfferingsOnly } from "@/lib/release";

export const metadata = { title: "Get started" };
export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  const offeringsOnly = isOfferingsOnly(getDataMode());
  return (
    <div>
      <PageHeader
        title="Product tour"
        subtitle={
          offeringsOnly
            ? "A guided, hands-on walkthrough of every feature currently available in this workspace."
            : "A guided, hands-on walkthrough of every Freyr workspace feature."
        }
      />
      <OnboardingHub offeringsOnly={offeringsOnly} />
    </div>
  );
}
