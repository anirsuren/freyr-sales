"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Folder, Info, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  JOURNEY_STAGES,
  JOURNEY_STAGE_META,
  MATERIAL_FORMATS,
  MATERIAL_FORMAT_META,
  MATERIAL_META,
  FIXED_MATERIAL_FOLDERS,
  isFixedMaterialFolder,
  materialFolderLabel,
  type AccessLevel,
  type JourneyStage,
  type MaterialFormat,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";

// The two CR-3 tag dropdowns — colour-coded options, never a gray <select>.
const STAGE_OPTIONS: ColorOption[] = JOURNEY_STAGES.map((s) => ({
  value: s,
  label: JOURNEY_STAGE_META[s].label,
  color: JOURNEY_STAGE_META[s].color,
  icon: JOURNEY_STAGE_META[s].icon,
}));
const ACCESS_OPTIONS: ColorOption[] = ACCESS_LEVELS.map((l) => ({
  value: l,
  label: ACCESS_LEVEL_META[l].label,
  color: ACCESS_LEVEL_META[l].color,
  icon: ACCESS_LEVEL_META[l].icon,
}));

// Item 9 (Saras / Anant): the picker offers FOUR formats, not nine types. The
// nine asked the owner to categorise the same file twice — the title they type
// ("Cutting registration cycle time") already says it's a case study, so the
// only thing the upload still has to state is what kind of file it is. Four
// equal tiles across one row: symmetric, and the whole choice is one glance.
const FORMATS = MATERIAL_FORMATS;

// Add a sales material to an offering from a POP-UP, right on the offering page
// (Suren: "this should be a pop-up, not take me to some weird edit page"). Saves
// via the offering PATCH and refreshes so it shows immediately.
const FOLDER_OPTIONS: ColorOption[] = FIXED_MATERIAL_FOLDERS.map((folder) => ({
  value: folder,
  label: materialFolderLabel(folder),
  color: "#0071E3",
  icon: Folder,
}));

export function AddMaterialButton({
  offeringId,
  materials,
  variant = "link",
  compact = false,
}: {
  offeringId: string;
  materials: OfferingMaterial[];
  variant?: "link" | "button";
  /** Icon-only "+" trigger for tight toolbars. */
  compact?: boolean;
}) {
  const router = useRouter();
  // Which folder the list is standing in, read from the URL the list writes.
  // The page is a server component and cannot hand this component a callback,
  // so the URL is the channel between the two.
  const openFolder = (useSearchParams().get("mf") || "").trim();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  /**
   * NOTHING TAGS ITSELF (Anir, Jul 30: "you actually have to make the user tag
   * it as a video because it shouldn't auto-tag as anything").
   *
   * This started as "video" and every pasted link inherited it, so a Minerva
   * course page went into the catalogue wearing a video icon. The obvious fix
   * was to guess better — from the file extension, from the URL — but a guess
   * is still a claim the app makes on the owner's behalf, and the wrong ones
   * are invisible precisely because nobody was asked. So: empty until picked,
   * and the form will not submit without it.
   */
  const [kind, setKind] = useState<MaterialFormat | "">("");
  const [folder, setFolder] = useState(
    isFixedMaterialFolder(openFolder) ? openFolder : ""
  );
  const [journeyStage, setJourneyStage] = useState<JourneyStage>("awareness");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("client_facing");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  // THE ACTUAL FILE. Owners upload the deck or video itself, not a link to it
  // (Wajeed, Jul 29: "it's going to be actual files": Eeswar's SharePoint decks
  // land here and the file is stored by the workspace, so the link never rots
  // when a SharePoint folder moves). A pasted link still works as before.
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 0-100 while bytes are moving, null when nothing is uploading. */
  const [progress, setProgress] = useState<number | null>(null);
  /** New uploads teach the assistant unless the owner says otherwise. */
  const [readByAgent, setReadByAgent] = useState(true);

  function reset() {
    setKind("");
    setJourneyStage("awareness");
    setFolder(isFixedMaterialFolder(openFolder) ? openFolder : "");
    setAccessLevel("client_facing");
    setLabel("");
    setDescription("");
    setUrl("");
    setFile(null);
    setDragOver(false);
  }

  // Picking a file fills in what the file already says: its name and format.
  // Both stay editable.
  function takeFile(f: File | null) {
    if (!f) return;
    setFile(f);
    // The NAME is prefilled because it is visible and editable in the same
    // breath. The FORMAT is not: an extension is good evidence, not consent.
    if (!label.trim()) setLabel(f.name.replace(/\.[^.]+$/, ""));
  }


  /**
   * PUT THE FILE STRAIGHT INTO STORAGE FROM THE BROWSER.
   *
   * Three calls: ask our server for a signed URL (it decides you may, and
   * where it lands), send the bytes to S3, tell our server it landed. The file
   * never passes through the app, so THERE IS NO SIZE LIMIT — a full recorded
   * demo uploads the same way a one-pager does.
   *
   * If direct upload isn't configured in this environment the signing call
   * answers 503 and we fall back to posting the file through the server, which
   * still works and is what a laptop without the Docs credentials uses.
   */
  async function uploadFile(f: File) {
    const signed = await fetch(
      `/api/offerings/${offeringId}/materials/upload-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: f.name,
          contentType: f.type || "application/octet-stream",
        }),
      }
    );
    const grant = await signed.json();

    if (signed.status === 503) return uploadThroughServer(f);
    if (!signed.ok || !grant.uploadUrl) {
      toast(grant.error || "Couldn't start that upload", "error");
      return null;
    }

    setProgress(0);
    const sent = await putWithProgress(grant.uploadUrl, grant.uploadHeaders, f);
    if (!sent) {
      // Clear the half-finished path or this same file can never be re-sent.
      await fetch(`/api/offerings/${offeringId}/materials/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: grant.path, failed: true }),
      }).catch(() => undefined);
      setProgress(null);
      toast("The upload didn't finish, try again", "error");
      return null;
    }

    setProgress(100);
    const done = await fetch(
      `/api/offerings/${offeringId}/materials/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: grant.path, filename: f.name }),
      }
    );
    const stored = await done.json();
    setProgress(null);
    if (!done.ok || !stored.url) {
      toast(stored.error || "Couldn't finish that upload", "error");
      return null;
    }
    return stored;
  }

  /** XHR, not fetch: it is the only way to report upload progress, and a
   *  multi-GB file with no progress bar reads as a frozen app. */
  function putWithProgress(
    url: string,
    headers: Record<string, string>,
    f: File
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      for (const [k, v] of Object.entries(headers || {}))
        xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.onabort = () => resolve(false);
      xhr.send(f);
    });
  }

  /** The no-Docs-credentials fallback: through our own server, which has to
   *  hold the file in memory, so this one keeps a cap. */
  async function uploadThroughServer(f: File) {
    const fd = new FormData();
    fd.append("file", f);
    const up = await fetch(`/api/offerings/${offeringId}/materials/upload`, {
      method: "POST",
      body: fd,
    });
    const stored = await up.json();
    if (!up.ok || !stored.url) {
      toast(stored.error || "Couldn't upload that file", "error");
      return null;
    }
    return stored;
  }

  async function save() {
    if (!file && !url.trim() && !label.trim()) {
      toast("Drop in a file, or add a link or a name first", "error");
      return;
    }
    // The format is the owner's to state. Nothing infers it, so nothing saves
    // without it — this is the guard that makes "no auto-tag" real rather than
    // a default sitting one click away from being wrong.
    if (!kind) {
      toast("Pick the file format first — video, presentation, document or other", "error");
      return;
    }
    if (!folder) {
      toast("Choose the folder this material belongs in", "error");
      return;
    }
    const chosenKind: MaterialFormat = kind;
    setBusy(true);
    try {
      // The file's bytes go up first; the material row then references where
      // they landed, through the same PATCH as a pasted link.
      let storedUrl = url.trim();
      let storedPath: string | undefined;
      // Whether the assistant could actually READ the file. Worth saying out
      // loud: an owner uploading a deck so the agent can answer from it needs
      // to know when it was a scan or a video and there were no words to take.
      let wasRead = false;
      let readWords = 0;
      let unsupported = false;
      let readFailed = false;
      if (file) {
        const stored = await uploadFile(file);
        if (!stored) {
          setBusy(false);
          return;
        }
        storedUrl = stored.url;
        storedPath = stored.docsPath;
        readWords = typeof stored.words === "number" ? stored.words : 0;
        wasRead = Boolean(stored.readable);
        unsupported = stored.supported === false;
        readFailed = Boolean(stored.failed);
      }
      // Note: "added by" is NOT sent from here. The PATCH route stamps the
      // uploader from the server session and restores every existing row's
      // attribution from the store, so a client can neither credit itself for
      // someone else's upload nor wipe an existing one.
      const next: OfferingMaterial[] = [
        // Preserve the existing materials verbatim — their original nine-type
        // kind, their tags and their notes all travel back unchanged, so
        // adding one file never re-types, re-tags or un-describes the others.
        ...materials.map((m) => ({
          id: m.id,
          kind: m.kind,
          label: m.label,
          url: m.url,
          docsPath: m.docsPath,
          description: m.description,
          journeyStage: m.journeyStage,
          accessLevel: m.accessLevel,
          readByAgent: m.readByAgent,
          documentType: m.documentType,
          // Without this the siblings come back folderless and one upload
          // would flatten everything Eswar had filed.
          folder: m.folder,
        })),
        {
          id: "",
          kind: chosenKind,
          label: label.trim() || (file ? file.name : MATERIAL_META[chosenKind].label),
          url: storedUrl,
          ...(storedPath ? { docsPath: storedPath } : {}),
          // Optional, and left off entirely when it's blank — an empty note is
          // no note, not an empty line under the title.
          ...(description.trim() ? { description: description.trim() } : {}),
          folder,
          journeyStage,
          accessLevel,
          readByAgent,
        },
      ];
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materials: next }),
      });
      const data = await res.json();
      if (data.ok) {
        // SAY THE TRUE REASON. The old copy blamed the file type for every
        // outcome, so a PDF that extracts perfectly was reported as an
        // unreadable format when the real cause was a failed read-back
        // (Anir, Jul 29: "it literally just gave me a pop-up that said it
        // can't read this file type... that thing should never say that").
        toast(
          !file
            ? "Material added"
            : wasRead
              ? `Material added — the assistant read ${readWords.toLocaleString()} words from it`
              : unsupported
                ? "Material added. There is no text in this kind of file, so the assistant answers from its title and tags."
                : readFailed
                  ? "Material added. The assistant hasn't read it yet — open Edit and save to try again."
                  : "Material added. The assistant found no text inside it.",
          readFailed ? "error" : undefined
        );
        setOpen(false);
        reset();
        router.refresh();
      } else {
        toast(data.error || "Couldn't add that", "error");
      }
    } catch {
      toast("Couldn't add that", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {compact ? (
        // Icon-only "+" — sellers know what it means next to the filter row
        // (Anir: "you don't have to say Add material, just have a plus").
        <button
          onClick={() => setOpen(true)}
          aria-label="Add material"
          title="Add material"
          className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-blue-primary text-white hover:bg-blue-hover transition-colors"
        >
          <Plus size={16} strokeWidth={2.2} />
        </button>
      ) : variant === "button" ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-blue-primary text-white hover:bg-blue-hover transition-colors"
        >
          <Plus size={14} strokeWidth={2.2} /> Add material
        </button>
      ) : (
        // A short, calm trigger. The old link spelled out four formats in a
        // sentence ("Add videos, presentations, white papers or pricing") and
        // read as clutter — the popup's type grid already answers "what kind?"
        // one click later (Anir, Jul 25: "I should be able to press Add, and
        // then choose what type in a pop-up").
        <button
          onClick={() => setOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg border border-border-light text-blue-primary hover:bg-blue-light/50 hover:border-blue-subtle transition-colors"
        >
          <Plus size={14} strokeWidth={2.2} /> Add material
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add a sales material">
        <div className="space-y-4">
          <div>
            <label className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              File format
              {/* Say it up front rather than only at the point of refusal. */}
              {!kind && (
                <span className="font-semibold normal-case tracking-normal text-[color:#B02020]">
                  · pick one
                </span>
              )}
            </label>
            {/* Four equal, colour-coded tiles on one row (item 9). */}
            <div className="grid grid-cols-4 gap-2">
              {FORMATS.map((k) => {
                const { icon: Icon, color, label: short } = MATERIAL_FORMAT_META[k];
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 h-[78px] rounded-xl border text-center px-1.5 transition-all ${
                      active ? "" : "border-border-light hover:border-blue-subtle hover:-translate-y-0.5"
                    }`}
                    style={
                      active
                        ? { borderColor: color, background: `${color}12`, boxShadow: `inset 0 0 0 1px ${color}` }
                        : undefined
                    }
                  >
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${color}1A`, color }}
                    >
                      <Icon size={16} strokeWidth={1.9} />
                    </span>
                    <span className="text-[11px] font-medium text-text-primary leading-tight">
                      {short}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* The approved folder taxonomy now carries what the file is. The
              updated change log explicitly defers a second document-type list. */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
              Folder <span className="text-error">*</span>
            </label>
            <ColorSelect
              value={folder}
              options={FOLDER_OPTIONS}
              onChange={setFolder}
              ariaLabel="Folder"
              minWidth={0}
            />
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              Fixed by the workspace so every offering uses the same structure.
            </p>
          </div>

          {/* CR-3: every material carries its buyer's-journey stage + who may
              see it. Two colour-coded dropdowns, defaulting to the most common
              pairing (awareness + client facing). */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
                Buyer&apos;s journey stage
              </label>
              <ColorSelect
                value={journeyStage}
                options={STAGE_OPTIONS}
                onChange={(v) => setJourneyStage(v as JourneyStage)}
                ariaLabel="Buyer's journey stage"
                minWidth={0}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
                Access level
              </label>
              <ColorSelect
                value={accessLevel}
                options={ACCESS_OPTIONS}
                onChange={(v) => setAccessLevel(v as AccessLevel)}
                ariaLabel="Access level"
                minWidth={0}
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
              Name
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={
                kind ? `e.g. ${MATERIAL_META[kind].label}. Q3 deck` : "e.g. Q3 deck"
              }
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:border-blue-subtle focus:shadow-input-focus"
            />
          </div>

          {/* Item 10: one line about the file, in the owner's own words. It is
              optional in every sense, nothing checks it, nothing blocks the
              save, and a material saved without one shows no note at all. */}
          <div>
            <label
              htmlFor="material-description"
              className="mb-1.5 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary"
            >
              Material Description
              <span className="text-[10px] font-medium normal-case tracking-normal text-text-tertiary">
                Optional
              </span>
            </label>
            <textarea
              id="material-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="One sentence on what this file is for: skip it if the title says enough."
              className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-[14px] leading-snug text-text-primary focus:outline-none focus:border-blue-subtle focus:shadow-input-focus"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
              File
            </label>
            {/* Drag the actual file in, or click to browse. The workspace
                stores it and the material links to the stored copy. */}
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                takeFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-5 text-center transition-colors ${
                dragOver
                  ? "border-blue-primary bg-blue-light/50"
                  : file
                    ? "border-blue-subtle bg-blue-light/30"
                    : "border-border-light hover:border-blue-subtle hover:bg-blue-light/20"
              }`}
            >
              <input
                type="file"
                className="hidden"
                accept=".mp4,.mov,.webm,.m4v,.ppt,.pptx,.key,.doc,.docx,.pdf,.txt,.rtf,.xls,.xlsx,.csv,.zip"
                onChange={(e) => takeFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <>
                  <span className="max-w-full break-words text-[13.5px] font-semibold text-text-primary">
                    {file.name}
                  </span>
                  <span className="text-[11.5px] text-text-tertiary">
                    {(file.size / 1024 / 1024).toFixed(1)}MB · click to swap, or{" "}
                    <span
                      role="button"
                      tabIndex={0}
                      className="font-semibold text-[color:#B02020]"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setFile(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setFile(null);
                        }
                      }}
                    >
                      remove
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[13.5px] font-semibold text-text-primary">
                    Drop the file here, or click to browse
                  </span>
                  <span className="text-[11.5px] text-text-tertiary">
                    PPT, Word, Excel, PDF or video · any size
                  </span>
                </>
              )}
            </label>
            {/* A multi-gigabyte demo takes minutes. Without a bar the app looks
                frozen and people close the tab mid-upload. */}
            {progress !== null && (
              <div className="mt-2" aria-live="polite">
                <div className="flex items-center justify-between text-[11.5px] font-medium text-text-secondary">
                  <span>
                    {progress < 100 ? "Uploading…" : "Reading the file…"}
                  </span>
                  <span className="tnum">{progress}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface)]">
                  <div
                    className="h-full rounded-full bg-blue-primary transition-[width] duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
            {!file && (
              <div className="mt-2">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
                  Or paste a link
                </label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:border-blue-subtle focus:shadow-input-focus"
                />
              </div>
            )}
          </div>

          {/* WHETHER THE ASSISTANT LEARNS FROM IT: a different question from
              who may see it, so it keeps its own control rather than becoming
              another value in the access list.

              ONE LINE, NOT A PARAGRAPH. Three lines of explanation sat at the
              bottom of an already tall dialog and pushed the buttons off screen
              (Anir, Jul 29: "the entire thing is too vertical... just a simple
              checkbox, if they want more information they can click the i").
              The detail moved into the icon, where it costs no height. */}
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={readByAgent}
              onChange={(e) => setReadByAgent(e.target.checked)}
              className="h-4 w-4 shrink-0 cursor-pointer accent-[color:#0071E3]"
            />
            <span className="text-[13px] font-medium text-text-primary">
              Let the Freyr assistant read this file
            </span>
            <Tooltip
              side="top"
              label="On: the assistant can answer questions from what is inside this file, and say which file it came from. Off: the file stays here for the team to open, and the assistant never reads it."
            >
              <span
                tabIndex={0}
                aria-label="What this means"
                className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full text-text-tertiary transition-colors hover:text-blue-primary"
              >
                <Info size={14} strokeWidth={2} />
              </span>
            </Tooltip>
          </label>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setOpen(false)}
              className="cursor-pointer text-[13px] font-medium px-3.5 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-60"
            >
              <Plus size={14} strokeWidth={2.2} />
              {busy ? (file ? "Uploading…" : "Adding…") : "Add material"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
