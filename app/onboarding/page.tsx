import { PageHeader } from "@/components/layout/PageHeader";
import { OnboardingHub } from "@/components/onboarding/OnboardingHub";

export const metadata = { title: "Get started" };
export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return (
    <div>
      <PageHeader
        title="Product tour"
        subtitle="A guided, hands-on walkthrough of every Freyr workspace feature."
      />
      <OnboardingHub />
    </div>
  );
}
