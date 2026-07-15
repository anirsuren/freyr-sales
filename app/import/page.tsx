import { PageHeader } from "@/components/layout/PageHeader";
import { DataImportCenter } from "@/components/import/DataImportCenter";

export const metadata = { title: "Import data" };

export default function ImportPage() {
  return <div className="max-w-[1100px]"><PageHeader title="Import data" subtitle="Bring approved accounts, contacts, and offerings into Freyr." /><DataImportCenter /></div>;
}
