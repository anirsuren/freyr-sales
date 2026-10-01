"use client";

import {
  Check,
  File as FileIcon,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Mail,
  Music,
  Presentation,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PendingAttachment, SentAttachment } from "@/components/agent/useAgentAttachments";

/* Each kind has its own mark and tint (category chips are colour plus icon), never a status colour:
   red, green and yellow mean something else in this app. */
const KIND: Record<string, { icon: typeof FileIcon; tint: string; label: string }> = {
  pdf: { icon: FileText, tint: "bg-pink-50 text-pink-600", label: "PDF" },
  word: { icon: FileText, tint: "bg-blue-light text-blue-primary", label: "Document" },
  slides: { icon: Presentation, tint: "bg-fuchsia-50 text-fuchsia-600", label: "Slides" },
  sheet: { icon: FileSpreadsheet, tint: "bg-teal-50 text-teal-700", label: "Spreadsheet" },
  image: { icon: ImageIcon, tint: "bg-violet-50 text-violet-600", label: "Picture" },
  audio: { icon: Music, tint: "bg-sky-50 text-sky-600", label: "Recording" },
  video: { icon: Film, tint: "bg-indigo-50 text-indigo-600", label: "Video" },
  archive: { icon: FileArchive, tint: "bg-purple-50 text-purple-600", label: "Archive" },
  email: { icon: Mail, tint: "bg-cyan-50 text-cyan-700", label: "Email" },
  text: { icon: FileText, tint: "bg-blue-light text-blue-primary", label: "Text" },
};

/** The kind before the server has read it, from the name and type. */
export function guessKind(name: string, type = ""): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "pdf";
  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)) return "image";
  if (type.startsWith("video/") || ["mp4", "mov", "webm", "mkv", "avi", "m4v"].includes(ext)) return "video";
  if (type.startsWith("audio/") || ["mp3", "m4a", "wav", "ogg", "aac", "flac", "opus", "amr"].includes(ext)) return "audio";
  if (["docx", "doc", "odt"].includes(ext)) return "word";
  if (["pptx", "ppt", "odp"].includes(ext)) return "slides";
  if (["xlsx", "xls", "csv", "tsv", "ods"].includes(ext)) return "sheet";
  if (ext === "zip") return "archive";
  if (ext === "eml" || ext === "msg") return "email";
  if (["txt", "md", "json", "html", "xml"].includes(ext)) return "text";
  return "file";
}

const size = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(bytes >= 10 * 1048576 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function Mark({ kind }: { kind: string }) {
  const k = KIND[kind] ?? { icon: FileIcon, tint: "bg-blue-light text-blue-primary", label: "File" };
  const Icon = k.icon;
  return (
    <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", k.tint)} aria-hidden="true">
      <Icon size={15} strokeWidth={2} />
    </span>
  );
}

function detail(f: PendingAttachment): string {
  if (f.status === "uploading") return `${size(f.size)} · uploading ${f.progress}%`;
  if (f.status === "reading") return `${size(f.size)} · reading…`;
  if (f.status === "failed") return f.error || "Could not read it";
  const bits = [size(f.size)];
  if (f.durationSeconds) bits.push(`${Math.max(1, Math.round(f.durationSeconds / 60))} min`);
  if (f.pages) bits.push(`${f.pages} page${f.pages === 1 ? "" : "s"}`);
  return bits.join(" · ");
}

/** Files waiting to go with the next message. */
export function PendingAttachmentChips({ files, onRemove }: { files: PendingAttachment[]; onRemove: (localId: string) => void }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2" aria-label="Files to send">
      {files.map((f) => (
        <div
          key={f.localId}
          className={cn(
            "relative flex items-center gap-2.5 max-w-[280px] rounded-xl border bg-white pl-2 pr-8 py-1.5 overflow-hidden",
            f.status === "failed" ? "border-error/40" : "border-border-light"
          )}
        >
          <Mark kind={f.kind ?? guessKind(f.name, f.type)} />
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-text-primary truncate" title={f.name}>{f.name}</div>
            <div className={cn("text-[11.5px] truncate flex items-center gap-1", f.status === "failed" ? "text-error" : "text-text-secondary")}>
              {f.status === "reading" && <Loader2 size={11} className="animate-spin" aria-hidden="true" />}
              {f.status === "ready" && <Check size={11} className="text-blue-primary" aria-hidden="true" />}
              {detail(f)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(f.localId)}
            aria-label={`Remove ${f.name}`}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-blue-light/60"
          >
            <X size={12} />
          </button>
          {f.status === "uploading" && (
            <span className="absolute left-0 bottom-0 h-[3px] bg-blue-primary transition-[width] duration-200" style={{ width: `${f.progress}%` }} aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  );
}

/** Files that went with a message, shown on its bubble. */
export function SentAttachmentChips({ files, align = "right" }: { files: SentAttachment[]; align?: "left" | "right" }) {
  if (!files.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5 mb-1.5", align === "right" ? "justify-end" : "justify-start")}>
      {files.map((f) => (
        <div key={f.fileId} className="flex items-center gap-2 max-w-[240px] rounded-lg border border-border-light bg-white px-1.5 py-1">
          <Mark kind={f.kind ?? guessKind(f.name)} />
          <div className="min-w-0 pr-1">
            <div className="text-[12px] font-medium text-text-primary truncate" title={f.name}>{f.name}</div>
            <div className="text-[11px] text-text-secondary truncate">
              {(KIND[f.kind ?? guessKind(f.name)]?.label ?? "File")}{f.bytes ? ` · ${size(f.bytes)}` : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
