"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// Admin-only "Import from Excel" — uploads Suren's .xlsx and upserts offerings,
// categories, and types so Saras doesn't re-enter the data (Suren's Jun 27 ask).
export function ImportExcel() {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  /**
   * THE WORKBOOK WAITS FOR A YES (Anir, Oct 1: nothing that changes data
   * acts on one click). Importing rewrites the details of every offering the
   * file names, the moment a file is picked, so it asks first and says so.
   * The input is cleared at once, so picking the same file again still works
   * after a Cancel.
   */
  const [pending, setPending] = useState<File | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (file) setPending(file);
  }

  async function importFile(file: File) {
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
      {mounted && (
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={onFile}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Import offerings from Excel"
        className="inline-flex items-center justify-center gap-1.5 text-[13px] font-medium rounded-md px-2.5 py-2 bg-white border border-border-light text-text-secondary hover:bg-surface hover:text-text-primary transition-colors disabled:opacity-60"
      >
        <Upload size={14} strokeWidth={1.8} />
        {busy ? "Importing…" : "Import"}
      </button>
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => {
          const file = pending;
          setPending(null);
          if (file) void importFile(file);
        }}
        title={
          pending
            ? `Import ${pending.name} into Offerings?`
            : "Import this workbook into Offerings?"
        }
        body={
          <>
            Every offering in <b>{pending?.name || "this workbook"}</b> with
            the same name as one already here gets its details replaced by what
            the file says. New names become new offerings, along with any new
            categories and types.
          </>
        }
        detail="Details the file leaves blank keep their current values. This cannot be undone."
        confirmLabel="Import workbook"
      />
    </>
  );
}
