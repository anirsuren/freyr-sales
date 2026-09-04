"use client";

import { useState } from "react";
import {
  Check,
  File,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  Trash2,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";
import { tint } from "@/lib/tint";

/**
 * ATTACH DOCUMENTS TO THE THING YOU ARE CREATING.
 *
 * Anir, Aug 31: "I'm pretty sure all of these things have to have documents,
 * like the ability to add documents to" — and then, sharper: "where I can't
 * add documents? Why are you saying this? Why the fuck would it not take
 * attachments? All of them need attachments."
 *
 * ALL of them. Contracts, submissions, presentations, requests and meetings
 * each had their own answer to that, which is how meetings ended up with a
 * `docs` field, an upload endpoint and no way to reach either from the form
 * that makes one. One component, one behaviour, so the next record type that
 * gets a create form cannot quietly ship without attachments again.
 *
 * FILES UPLOAD AS YOU PICK THEM, not on submit: by the time you press Create
 * the signed PDF is already stored, and a file that will not upload says so
 * while there is still something you can do about it. The parent gets back
 * only the ones that actually landed — carrying a failed row would attach a
 * document with nothing behind it.
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
    KINDS.find((k) => k.match.test(name)) ?? { color: "var(--ink-bright-blue)", icon: File }
  );
}

export const DOC_ACCEPT =
  ".pdf,.doc,.docx,.rtf,.txt,.xls,.xlsx,.csv,.ppt,.pptx,.key,.zip";

export type StagedDoc = {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  docsPath?: string;
  fileName?: string;
  error?: string;
};

/** The ones that actually landed, in the shape every record's `docs` uses. */
export function landedDocs(
  docs: StagedDoc[],
  idPrefix: string
): { id: string; name: string; docsPath: string; fileName: string; addedBy: string; addedAt: string }[] {
  return docs
    .filter((d) => d.status === "done" && d.docsPath)
    .map((d) => ({
      id: `${idPrefix}-${d.key}`,
      name: d.name,
      docsPath: d.docsPath as string,
      fileName: d.fileName ?? d.name,
      /* Stamped by the server from the session, never by the browser: a
         client-supplied author is a claim, not a fact. */
      addedBy: "",
      addedAt: new Date().toISOString(),
    }));
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentDrop({
  docs,
  setDocs,
  uploadUrl,
  label = "Documents",
  hint,
}: {
  docs: StagedDoc[];
  setDocs: React.Dispatch<React.SetStateAction<StagedDoc[]>>;
  /** Where the file goes. Each module has its own namespace and its own
   *  permission check, so the endpoint is the caller's to name. */
  uploadUrl: string;
  label?: string;
  /** What belongs here, in this record's own words. */
  hint?: string;
}) {
  const [dragging, setDragging] = useState(false);

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
        const res = await fetch(uploadUrl, { method: "POST", body: fd });
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

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-semibold text-text-primary">{label}</span>
        {hint && (
          <span className="text-[11.5px] text-text-tertiary">{hint}</span>
        )}
      </div>
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
            accept={DOC_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              void stageFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {docs.length > 0 && (
          /* Fixed height, scrolls inside itself: a shelf that grows with every
             file walks the Create button down under the cursor. */
          <div className="max-h-[126px] overflow-y-auto border-t border-border-light/70 px-2 py-1">
            {docs.map((d) => {
              const meta = kindOf(d.name);
              const Icon = meta.icon;
              return (
                <div key={d.key} className="flex items-center gap-2.5 px-1.5 py-1.5">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                    style={{ background: tint(meta.color, 8), color: meta.color }}
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
  );
}
