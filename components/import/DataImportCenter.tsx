"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Download, FileSpreadsheet, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { downloadCSV, toCSV } from "@/lib/csv";

type Result = { customers: number; contacts: number; skipped: number; errors: string[] };

export function DataImportCenter() {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  function template() {
    downloadCSV("freyr-accounts-contacts-template.csv", toCSV(
      ["company_name", "website_url", "industry", "geography", "size_tier", "owner", "contact_name", "contact_email", "contact_phone", "linkedin_url", "job_title", "role"],
      [["Example Pharma", "https://example.com", "Life Sciences", "United States", "mid", "owner@freyrsolutions.com", "Jane Doe", "jane@example.com", "+1 555 0100", "https://linkedin.com/in/jane-doe", "VP Regulatory Affairs", "Regulatory"]]
    ));
  }

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setResult(null);
    try {
      const body = new FormData(); body.set("file", file);
      const response = await fetch("/api/import/crm", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import failed");
      setResult(data);
      toast(`Imported ${data.customers} accounts and ${data.contacts} contacts`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Import failed", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card>
        <div className="flex gap-3">
          <span className="w-10 h-10 rounded-xl bg-blue-light text-blue-primary flex items-center justify-center shrink-0"><Upload size={19} /></span>
          <div>
            <h2 className="text-[15px] font-semibold">Accounts and contacts</h2>
            <p className="text-[13px] text-text-secondary mt-1 leading-relaxed">Import up to 5,000 rows from CSV. Existing companies are updated by company name; a contact is created when contact_name is present.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => upload(event.target.files?.[0])} />
          <Button onClick={() => input.current?.click()} disabled={busy}>{busy ? "Importing…" : "Choose CSV"}</Button>
          <button onClick={template} className="px-3 py-2 rounded-md border border-border text-[13px] font-medium text-text-secondary hover:bg-surface flex items-center gap-2"><Download size={15} /> Download template</button>
        </div>
        {result && (
          <div className="mt-5 rounded-xl border border-success/30 bg-success/5 p-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold"><CheckCircle2 size={16} className="text-success" /> Import complete</p>
            <p className="mt-1 text-[12px] text-text-secondary">{result.customers} new accounts · {result.contacts} contacts · {result.skipped} skipped</p>
            {result.errors.length > 0 && <div className="mt-3 text-[11px] text-warning"><p className="font-semibold flex items-center gap-1"><AlertTriangle size={13} /> Review these rows</p>{result.errors.map((error) => <p key={error} className="mt-1">{error}</p>)}</div>}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex gap-3">
          <span className="w-10 h-10 rounded-xl bg-blue-light text-blue-primary flex items-center justify-center shrink-0"><FileSpreadsheet size={19} /></span>
          <div>
            <h2 className="text-[15px] font-semibold">Offerings repository</h2>
            <p className="text-[13px] text-text-secondary mt-1 leading-relaxed">Import Freyr’s offering workbook, including offering types, categories, markets, customer types, availability, and owners.</p>
          </div>
        </div>
        <Link href="/offerings" className="mt-5 inline-flex px-4 py-2 rounded-md bg-blue-primary text-white text-[13px] font-semibold hover:bg-blue-hover">Open offering import</Link>
      </Card>

      <Card className="lg:col-span-2">
        <h2 className="text-[15px] font-semibold">Before importing production data</h2>
        <ol className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-[12px] text-text-secondary leading-relaxed">
          <li><strong className="block text-text-primary mb-1">1. Use Clean mode</strong>Settings → Workspace must show Clean workspace active.</li>
          <li><strong className="block text-text-primary mb-1">2. Confirm persistence</strong>The production database must be connected before importing data you need to keep.</li>
          <li><strong className="block text-text-primary mb-1">3. Validate a sample</strong>Import a small file first, check field mapping, then load the full approved dataset.</li>
        </ol>
      </Card>
    </div>
  );
}
