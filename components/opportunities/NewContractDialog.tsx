"use client";

import { useState } from "react";
import { Check, File, FileSpreadsheet, FileText, Loader2, Plus, Presentation, Trash2, UploadCloud, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ColorSelect } from "@/components/ui/ColorSelect";
import type { Opportunity } from "@/lib/opportunitiesShared";

/**
 * A CONTRACT, MADE WHERE THE DEAL IS.
 *
 * Anir, Aug 31: "why are you fucking taking me to the page? ... I can add it
 * from the edit page, or I can add it by actually going to that tab and then
 * adding it. Both ways have to be there... Pretty simple, just a pop-up, and I
 * can obviously create new ones there."
 *
 * So this is a dialog and nothing else — no route, no page, no losing what you
 * were doing. It is opened from the deal's Contracts tab AND from the Contracts
 * section inside Edit deal, and it behaves identically from both, because they
 * are the same component opened by the same state.
 *
 * WHY A FORM OF ITS OWN. The full contract form lives inside ContractsModule,
 * welded to that page's state across four hundred lines. What a deal needs is
 * the half of it that identifies the contract; the money schedule and the
 * delivery hand-off belong on the contract's own page, where there is room for
 * them. This creates a real contract through the same endpoint and leaves the
 * rest to be filled in there.
 */

/** Colour and icon by file type — the standing rule that a chip is never a
 *  plain grey row you have to read the filename to identify. */
const KINDS: { match: RegExp; color: string; icon: LucideIcon }[] = [
  { match: /\.pdf$/i, color: "#C4342B", icon: FileText },
  { match: /\.(docx?|rtf|txt)$/i, color: "#2B579A", icon: FileText },
  { match: /\.(xlsx?|csv)$/i, color: "#1D6F42", icon: FileSpreadsheet },
  { match: /\.(pptx?|key)$/i, color: "#D24726", icon: Presentation },
];
function kindOf(name: string) {
  return (
    KINDS.find((k) => k.match.test(name)) ?? { color: "#0071E3", icon: File }
  );
}
const ACCEPT = ".pdf,.doc,.docx,.rtf,.txt,.xls,.xlsx,.csv,.ppt,.pptx,.key,.zip";

type Staged = {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  docsPath?: string;
  fileName?: string;
  error?: string;
};

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const INPUT =
  "h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[12px] font-semibold text-text-primary">{label}</span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

export function NewContractDialog({
  deal,
  onClose,
  onCreated,
}: {
  deal: Opportunity;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState(deal.name ?? "");
  const [value, setValue] = useState(String(deal.value ?? ""));
  const [status, setStatus] = useState("Draft");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [owner, setOwner] = useState(deal.owner ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<Staged[]>([]);
  const [dragging, setDragging] = useState(false);

  /* Uploaded as you pick them, so the signed PDF is already stored by the time
     you press Create and a file that will not upload says so while there is
     still something to do about it. */
  async function stageFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    for (const file of picked) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      setDocs((cur) => [
        ...cur,
        { key, name: file.name, size: file.size, status: "uploading" },
      ]);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/contracts/upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.docsPath)
          throw new Error(data?.error || "That file did not upload.");
        setDocs((cur) =>
          cur.map((d) =>
            d.key === key
              ? { ...d, status: "done", docsPath: data.docsPath, fileName: data.fileName }
              : d
          )
        );
      } catch (e) {
        setDocs((cur) =>
          cur.map((d) =>
            d.key === key
              ? {
                  ...d,
                  status: "error",
                  error: e instanceof Error ? e.message : "That file did not upload.",
                }
              : d
          )
        );
      }
    }
  }

  const uploading = docs.some((d) => d.status === "uploading");

  async function create() {
    if (!name.trim()) {
      setError("Give the contract a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "save",
          contract: {
            name: name.trim(),
            customer: deal.customer,
            ...(deal.customerId ? { customerId: deal.customerId } : {}),
            /* The whole point of making it here: it arrives already attached
               to this deal, which is the link the Contracts tab reads. */
            opportunityId: deal.id,
            opportunityName: deal.name,
            value: Math.round(Number(value.replace(/[^0-9.]/g, "")) || 0),
            status,
            ...(start ? { startDate: start } : {}),
            ...(end ? { endDate: end } : {}),
            ...(owner.trim() ? { owner: owner.trim() } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
            schedule: [],
            /* Only the ones that landed. A row that failed is still on screen
               saying so, and carrying it would attach a document with nothing
               behind it. */
            docs: docs
              .filter((d) => d.status === "done" && d.docsPath)
              .map((d) => ({
                id: `cd-${d.key}`,
                name: d.name,
                docsPath: d.docsPath,
                fileName: d.fileName ?? d.name,
                addedBy: "",
                addedAt: new Date().toISOString(),
              })),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        setError(data?.error || "That did not save.");
        setBusy(false);
        return;
      }
      setBusy(false);
      onCreated();
      onClose();
    } catch {
      setError("That did not save.");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New contract" size="wide">
      <div className="space-y-4">
        <Field label="What is the contract called?">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
            placeholder={deal.name}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Value">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="numeric"
              className={INPUT}
              placeholder="180000"
            />
          </Field>
          <Field label="Status">
            <ColorSelect
              value={status}
              onChange={setStatus}
              ariaLabel="Contract status"
              minWidth={190}
              options={[
                { value: "Draft", label: "Draft", color: "#64748B" },
                {
                  value: "Ready for delivery",
                  label: "Ready for delivery",
                  color: "#0071E3",
                },
                { value: "Signed", label: "Signed", color: "#1A7A35" },
                { value: "Cancelled", label: "Cancelled", color: "#B42318" },
              ]}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Starts">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="Ends">
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={INPUT}
            />
          </Field>
        </div>

        <Field label="Owner">
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className={INPUT}
            placeholder="Nobody yet"
          />
        </Field>

        <Field label="Note">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
            placeholder="Anything worth saying about this contract."
          />
        </Field>

        {/* ATTACHMENTS. A contract is the signed PDF, the statement of work,
            the amendment that came after it — not a single pasted link, which
            is all this record could hold before. */}
        <div>
          <span className="text-[12px] font-semibold text-text-primary">
            Documents
            <span className="ml-1.5 font-normal text-text-secondary">
              The signed contract, the SOW, anything that belongs with it.
            </span>
          </span>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void stageFiles(e.dataTransfer.files);
            }}
            className={`mt-1.5 rounded-lg border border-dashed transition-colors ${
              dragging
                ? "border-blue-primary bg-blue-light/50"
                : "border-border-light bg-surface/40"
            }`}
          >
            <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
                <UploadCloud size={16} strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-text-primary">
                  Choose files, or drop them here
                </span>
                <span className="block text-[11.5px] text-text-secondary">
                  Word, PDF, Excel, PowerPoint — as many as you need.
                </span>
              </span>
              <input
                type="file"
                multiple
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  void stageFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {docs.length > 0 && (
              /* Fixed height, scrolls inside itself: a shelf that grows with
                 every file walks the Create button down under the cursor. */
              <div className="max-h-[126px] overflow-y-auto border-t border-border-light/70 px-2 py-1">
                {docs.map((d) => {
                  const meta = kindOf(d.name);
                  const Icon = meta.icon;
                  return (
                    <div key={d.key} className="flex items-center gap-2.5 px-1.5 py-1.5">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                        style={{ background: `${meta.color}14`, color: meta.color }}
                      >
                        <Icon size={13} strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-text-primary">
                          {d.name}
                        </span>
                        <span
                          className={`block text-[11px] ${
                            d.status === "error" ? "text-error" : "text-text-tertiary"
                          }`}
                        >
                          {d.status === "error"
                            ? d.error
                            : d.status === "uploading"
                              ? "Uploading…"
                              : fileSize(d.size)}
                        </span>
                      </span>
                      {d.status === "uploading" && (
                        <Loader2 size={14} className="shrink-0 animate-spin text-blue-primary" />
                      )}
                      {d.status === "done" && (
                        <Check size={14} strokeWidth={2.6} className="shrink-0 text-success" />
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${d.name}`}
                        onClick={() => setDocs((cur) => cur.filter((x) => x.key !== d.key))}
                        className="shrink-0 cursor-pointer rounded p-1 text-error/70 transition-colors hover:bg-red-50 hover:text-error"
                      >
                        <Trash2 size={13} strokeWidth={2} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* It is FOR this deal, and says so rather than making you trust that
            it worked out which one. */}
        <p className="rounded-lg border border-border-light bg-surface/60 px-3 py-2.5 text-[12.5px] text-text-secondary">
          Created against <b>{deal.name}</b> for <b>{deal.customer}</b>, so it
          lands on this deal&apos;s Contracts tab.
        </p>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="min-w-0 text-[12.5px] text-error">{error}</span>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg border border-border-light bg-white px-4 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || uploading || !name.trim()}
              onClick={create}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-5 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} strokeWidth={2.4} />
              )}
              {uploading ? "Uploading…" : busy ? "Creating…" : "Create the contract"}
            </button>
          </span>
        </div>
      </div>
    </Modal>
  );
}
