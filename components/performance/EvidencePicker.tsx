"use client";

/**
 * ATTACH THE PROOF, WHEREVER YOU ARE ASKED FOR IT.
 *
 * This uploader was written inside the log-a-result form and stayed there, so
 * the one screen where proof is most likely to be MISSING — the form a rep
 * opens after a group owner sent their claim back asking for the contract —
 * had no way to attach anything at all (Anir, Aug 20: "do they have to upload
 * a doc here or no"). One component now, used by both.
 */

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { InfoHint } from "@/components/ui/InfoHint";
import { cn } from "@/lib/utils";

type EvidenceUpload = {
  name: string;
  percent: number;
  status: "uploading" | "done" | "failed";
  error?: string;
};

export type EvidenceFile = { name: string; url: string };

export function EvidencePicker({
  value,
  onChange,
  onUploadingChange,
  max = 5,
}: {
  value: EvidenceFile[];
  onChange: (next: EvidenceFile[]) => void;
  /** So a form can refuse to submit while a file is still in flight. */
  onUploadingChange?: (busy: boolean) => void;
  max?: number;
}) {
  const [uploading, setBusy] = useState(false);
  /** One row per file being sent, so a big contract shows a moving bar rather
   *  than a frozen "Uploading…" with nothing behind it. */
  const [uploads, setUploads] = useState<EvidenceUpload[]>([]);
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const setUploading = (busy: boolean) => {
    setBusy(busy);
    onUploadingChange?.(busy);
  };
  /** Reads the freshest list every time: two files finishing back to back
   *  through a stale closure would drop the first. */
  const latest = useRef(value);
  latest.current = value;
  const add = (file: EvidenceFile) => {
    latest.current = [...latest.current, file];
    onChange(latest.current);
  };

  /**
   * THE FALLBACK, and today it is the one that actually runs.
   *
   * FreyaFusion's bucket has no CORS policy, so a browser's preflight is
   * refused and the direct PUT never sends a byte — while the identical
   * signed PUT succeeds from a server. Sales materials hit this on Aug 13 and
   * solved it the same way: reroute through our own server, which writes into
   * the SAME bucket server-side. The rep just sees the upload finish.
   *
   * XHR rather than fetch so this path shows a real percentage too, instead of
   * a bar that only appears on the route we cannot use yet.
   */
  function uploadThroughServer(file: File): Promise<{ name: string; url: string }> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/performance/evidence");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploads((prev) =>
            prev.map((u) =>
              u.name === file.name && u.status === "uploading"
                ? { ...u, percent }
                : u
            )
          );
        }
      };
      xhr.onload = () => {
        let data: { name?: string; url?: string; error?: string } = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* a proxy or the framework answered with HTML */
        }
        if (xhr.status >= 200 && xhr.status < 300 && data.url) {
          resolve({ name: data.name || file.name, url: data.url });
        } else {
          reject(
            new Error(
              data.error ||
                (xhr.status === 413 || xhr.status === 0
                  ? "That file is too large to attach here yet."
                  : "Upload failed")
            )
          );
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(form);
    });
  }

  /** Straight to storage with a real percentage, exactly like a sales
   *  material. Resolves false when the browser is refused, which is what
   *  happens today. */
  function putWithProgress(
    url: string,
    headers: Record<string, string>,
    file: File
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      for (const [k, v] of Object.entries(headers || {}))
        xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploads((prev) =>
            prev.map((u) =>
              u.name === file.name && u.status === "uploading"
                ? { ...u, percent }
                : u
            )
          );
        }
      };
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.onabort = () => resolve(false);
      xhr.send(file);
    });
  }

  /**
   * ATTACHING EVIDENCE NEVER LEAVES THE POPUP (Anir, Aug 15: "don't take me
   * off the pop-up"). Progress shows per file and the finished ones stay
   * listed; a failure writes its reason under the row instead of throwing a
   * browser alert over the whole form.
   *
   * The file goes browser → storage, so there is NO SIZE LIMIT. The old code
   * posted it through our own server, which is why anything from 10 MB up came
   * back as "Attach a file" on a file that was very much attached.
   */
  async function attachEvidence(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, max - value.length);
    setUploading(true);
    setUploads((prev) => [
      ...prev,
      ...picked.map((f) => ({
        name: f.name,
        percent: 0,
        status: "uploading" as const,
      })),
    ]);
    const mark = (name: string, patch: Partial<EvidenceUpload>) =>
      setUploads((prev) =>
        prev.map((u) => (u.name === name ? { ...u, ...patch } : u))
      );

    for (const file of picked) {
      try {
        const signed = await fetch("/api/performance/evidence/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || "application/octet-stream",
          }),
        });
        const grant = await signed.json().catch(() => ({}));

        // No Docs credentials on this deployment: straight to the proxy.
        if (signed.status === 503) {
          const stored = await uploadThroughServer(file);
          add(stored);
          mark(file.name, { percent: 100, status: "done" });
          continue;
        }
        if (!signed.ok || !grant.uploadUrl) {
          throw new Error(grant.error ?? "Could not start that upload");
        }

        const sent = await putWithProgress(
          grant.uploadUrl,
          grant.uploadHeaders,
          file
        );
        if (!sent) {
          // The browser was refused (no CORS on the bucket). Reroute rather
          // than telling the rep to try again at something that cannot work.
          mark(file.name, { percent: 0, status: "uploading" });
          const stored = await uploadThroughServer(file);
          add(stored);
          mark(file.name, { percent: 100, status: "done" });
          continue;
        }

        const done = await fetch("/api/performance/evidence/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: grant.path, name: file.name }),
        });
        const data = await done.json().catch(() => ({}));
        if (!done.ok) throw new Error(data.error ?? "Upload failed");
        add({ name: data.name, url: data.url });
        mark(file.name, { percent: 100, status: "done" });
      } catch (error) {
        mark(file.name, {
          status: "failed",
          error: error instanceof Error ? error.message : "Upload failed",
        });
      }
    }

    setUploading(false);
    if (evidenceInputRef.current) evidenceInputRef.current.value = "";
    // Clear the finished rows once they have been seen; failures stay until
    // the person retries or closes the form.
    window.setTimeout(
      () => setUploads((prev) => prev.filter((u) => u.status !== "done")),
      2500
    );
  }

  return (
    <div>
      <label className="flex items-center gap-1 text-[12px] font-semibold text-text-primary">
        Evidence
        <InfoHint text={"The proof behind the claim: the signed contract, SOW or opportunity summary.\nThe group owner opens it before verifying, and money claims cannot be submitted without it."} />
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {value.map((e, i) => (
          <span
            key={e.url}
            className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11.5px] font-semibold text-blue-primary"
          >
            📎 {e.name}
            <button
              type="button"
              aria-label={`Remove ${e.name}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="cursor-pointer text-blue-primary/70 hover:text-blue-primary"
            >
              <X size={11} strokeWidth={2.6} />
            </button>
          </span>
        ))}
        <button
          type="button"
          disabled={uploading || value.length >= max}
          onClick={() => evidenceInputRef.current?.click()}
          className="cursor-pointer rounded-full border border-border-light bg-white px-3 py-1.5 text-[11.5px] font-semibold text-text-secondary transition-colors hover:text-blue-primary disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "＋ Attach a file"}
        </button>
        <input
          ref={evidenceInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => attachEvidence(e.target.files)}
        />
      </div>
      {/* The bar the sales-material uploader shows, for the same reason:
          a large contract takes a while, and a frozen label reads as
          broken (Anir, Aug 15). */}
      {uploads.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {uploads.map((u) => (
            <div key={u.name + u.status}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-text-secondary">
                  {u.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-semibold tnum",
                    u.status === "failed"
                      ? "text-error"
                      : u.status === "done"
                        ? "text-success"
                        : "text-text-tertiary"
                  )}
                >
                  {u.status === "failed"
                    ? "Failed"
                    : u.status === "done"
                      ? "Attached ✓"
                      : `${u.percent}%`}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-200",
                    u.status === "failed"
                      ? "bg-error"
                      : u.status === "done"
                        ? "bg-success"
                        : "bg-blue-primary"
                  )}
                  style={{
                    width: `${u.status === "failed" ? 100 : u.percent}%`,
                  }}
                />
              </div>
              {u.error && (
                <p className="mt-1 text-[10.5px] text-error">{u.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {/* No standing helper line under Evidence (Anir, Aug 17: "you can
          remove this text"). The rule still holds — submit refuses a money
          claim without a file and says so then — and the hint icon beside
          the label already explains it to anyone who asks. */}
    </div>
  );
}
