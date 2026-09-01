import { Package } from "lucide-react";
import { getDb } from "@/lib/db";
import { isAdmin } from "@/lib/role";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { ServiceCatalog } from "@/components/services/ServiceCatalog";

export const metadata = { title: "Service Catalog" };
export const dynamic = "force-dynamic";

export default async function ServiceCatalogPage() {
  const db = getDb();
  const kb = await db.freyrKb.get();
  const services: any[] = kb?.structured_kb?.services || [];
  const admin = await isAdmin();

  return (
    <div>
      <PageHeader
        title="Service Catalog"
        subtitle={
          admin
            ? "The Freyr services the system matches against: searchable and editable."
            : "The Freyr services the system matches against."
        }
      />
      {services.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={Package}
            title="No services here yet"
            description="This list is built by reading the Freyr website. An admin can start that from the Admin page, using Re-crawl Freyr Website."
          />
        </Card>
      ) : (
        <ServiceCatalog services={services} admin={admin} />
      )}
    </div>
  );
}
