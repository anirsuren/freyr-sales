"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

// Admin-only "Import from Excel" — uploads Suren's .xlsx and upserts offerings,
// categories, and types so Saras doesn't re-enter the data (Suren's Jun 27 ask).
export function ImportExcel() {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/offerings/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.ok) {
        const parts: string[] = [];
        if (data.offeringsUpdated)
          parts.push(`${data.offeringsUpdated} updated`);
        if (data.offeringsCreated)
          parts.push(`${data.offeringsCreated} added`);
        if (data.categories) parts.push(`${data.categories} categories`);
        if (data.types) parts.push(`${data.types} types`);
        toast(
          parts.length
            ? `Imported from ${file.name}: ${parts.join(", ")}.`
            : `Read ${file.name}, but found no offerings to import.`
        );
        router.refresh();
      } else {
        toast(data.error || "Couldn't import that file.", "error");
      }
    } catch {
      toast("Couldn't import that file.", "error");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={onFile}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Import offerings from Suren's Excel sheet"
        className="inline-flex items-center justify-center gap-1.5 text-[13px] font-medium rounded-md px-2.5 py-2 bg-white border border-border-light text-text-secondary hover:bg-surface hover:text-text-primary transition-colors disabled:opacity-60"
      >
        <Upload size={14} strokeWidth={1.8} />
        {busy ? "Importing…" : "Import"}
      </button>
    </>
  );
}
