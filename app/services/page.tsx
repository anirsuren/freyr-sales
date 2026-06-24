import { Package } from "lucide-react";
import { getDb } from "@/lib/db";
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

  return (
    <div>
      <PageHeader
        title="Service Catalog"
        subtitle="The Freyr services the system matches against — searchable and editable."
      />
      {services.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={Package}
            title="No services indexed yet"
            description="Run a knowledge-base crawl in Admin to populate the catalog."
          />
        </Card>
      ) : (
        <ServiceCatalog services={services} />
      )}
    </div>
  );
}
