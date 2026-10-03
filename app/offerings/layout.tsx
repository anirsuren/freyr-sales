import { requireModuleAccess } from "@/lib/moduleAccessServer";

export default async function OfferingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModuleAccess("/offerings");
  return children;
}
