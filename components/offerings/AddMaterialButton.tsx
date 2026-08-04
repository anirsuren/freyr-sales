"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Folder,
  Plus,
  Route,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ColorSelect, MultiColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  ACCESS_LEVEL_VISIBILITY_COPY,
  JOURNEY_STAGES,
  JOURNEY_STAGE_META,
  MATERIAL_FORMATS,
  MATERIAL_FORMAT_META,
  MATERIAL_META,
  FIXED_MATERIAL_FOLDERS,
  isFixedMaterialFolder,
  materialFolderLabel,
  materialJourneyStages,
  type AccessLevel,
  type JourneyStage,
  type MaterialFormat,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";

// The two CR-3 tag dropdowns — colour-coded options, never a gray <select>.
const STAGE_OPTIONS: ColorOption[] = [
  {
    value: "",
    label: "Pick a journey stage",
    color: "#0071E3",
    icon: Route,
  },
  ...JOURNEY_STAGES.map((s) => ({
    value: s,
    label: JOURNEY_STAGE_META[s].label,
    color: JOURNEY_STAGE_META[s].color,
    icon: JOURNEY_STAGE_META[s].icon,
  })),
];
const ACCESS_OPTIONS: ColorOption[] = [
  {
    value: "",
    label: "Choose who can view it",
    color: "#0071E3",
    icon: ShieldCheck,
  },
  ...ACCESS_LEVELS.map((l) => ({
    value: l,
    label: ACCESS_LEVEL_VISIBILITY_COPY[l].label,
    description: ACCESS_LEVEL_VISIBILITY_COPY[l].description,
    color: ACCESS_LEVEL_META[l].color,
    icon: ACCESS_LEVEL_META[l].icon,
  })),
];

// Item 9 (Saras / Anant): the picker offers FOUR formats, not nine types. The
// nine asked the owner to categorise the same file twice — the title they type
// ("Cutting registration cycle time") already says it's a case study, so the
// only thing the upload still has to state is what kind of file it is. Four
// equal tiles across one row: symmetric, and the whole choice is one glance.
const FORMATS = MATERIAL_FORMATS;

// Add a sales material to an offering from a POP-UP, right on the offering page
// (Suren: "this should be a pop-up, not take me to some weird edit page"). Saves
// via the offering PATCH and refreshes so it shows immediately.
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
  const [folder, setFolder] = useState(isFixedMaterialFolder(openFolder) ? openFolder : "");
  const [journeyStages, setJourneyStages] = useState<JourneyStage[]>([]);
  const [accessLevel, setAccessLevel] = useState<AccessLevel | "">("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  // THE ACTUAL FILE. Owners upload the deck or video itself, not a link to it
  // (Wajeed, Jul 29: "it's going to be actual files": Eeswar's SharePoint decks
  // land here and the file is stored by the workspace, so the link never rots
  // when a SharePoint folder moves). A pasted link still works as before.
  const [files, setFiles] = useState<File[]>([]);
  const [fileLabels, setFileLabels] = useState<Record<string, string>>({});
  const [fileOverrides, setFileOverrides] = useState<
    Record<
      string,
      {
        kind?: MaterialFormat;
        folder?: string;
        journeyStages?: JourneyStage[];
        accessLevel?: AccessLevel;
        description?: string;
      }
    >
  >({});
  const [fileProgress, setFileProgress] = useState<
    Record<string, { percent: number; status: "waiting" | "uploading" | "done" | "failed" }>
  >({});
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 0-100 while bytes are moving, null when nothing is uploading. */
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadIndex, setUploadIndex] = useState(0);

  function fileKey(file: File) {
    return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
  }

  function reset() {
    setKind("");
    setJourneyStages([]);
    setFolder(isFixedMaterialFolder(openFolder) ? openFolder : "");
    setAccessLevel("");
    setLabel("");
    setDescription("");
    setUrl("");
    setFiles([]);
    setFileLabels({});
    setFileOverrides({});
    setFileProgress({});
    setDragOver(false);
    setUploadIndex(0);
  }

  // Picking a file fills in what the file already says: its name and format.
  // Both stay editable.
  function takeFiles(list: FileList | File[] | null) {
    const picked = Array.from(list || []);
    if (!picked.length) return;
    const unique = new Map<string, File>();
    for (const existing of files) unique.set(fileKey(existing), existing);
    for (const next of picked) unique.set(fileKey(next), next);
    const merged = Array.from(unique.values());
    setFiles(merged);
    setFileLabels((current) => {
      const next = { ...current };
      for (const file of merged) {
        const key = fileKey(file);
        if (!next[key]) next[key] = file.name.replace(/\.[^.]+$/, "");
      }
      return next;
    });
  }

  function removeFile(file: File) {
    const key = fileKey(file);
    setFiles((current) => current.filter((item) => fileKey(item) !== key));
    setFileLabels((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFileOverrides((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFileProgress((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function updateFileOverride(
    file: File,
    update: Partial<NonNullable<(typeof fileOverrides)[string]>>
  ) {
    const key = fileKey(file);
    setFileOverrides((current) => ({
      ...current,
      [key]: { ...current[key], ...update },
    }));
  }

  const validLink = (() => {
    if (!url.trim()) return false;
    try {
      const parsed = new URL(url.trim());
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  })();
  const fileReady = files.every((file) => {
    const key = fileKey(file);
    const override = fileOverrides[key] || {};
    return Boolean(
      fileLabels[key]?.trim() &&
        (override.kind || kind) &&
        (override.folder || folder) &&
        (override.journeyStages || journeyStages).length &&
        (override.accessLevel || accessLevel)
    );
  });
  const linkReady = Boolean(
    !files.length &&
      label.trim() &&
      validLink &&
      kind &&
      folder &&
      journeyStages.length &&
      accessLevel
  );
  const canSave = !busy && (files.length ? fileReady : linkReady);


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
    const key = fileKey(f);
    setFileProgress((current) => ({
      ...current,
      [key]: { percent: 0, status: "uploading" },
    }));
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
      setFileProgress((current) => ({
        ...current,
        [key]: { percent: current[key]?.percent || 0, status: "failed" },
      }));
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
      setFileProgress((current) => ({
        ...current,
        [key]: { percent: current[key]?.percent || 0, status: "failed" },
      }));
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
      setFileProgress((current) => ({
        ...current,
        [key]: { percent: 100, status: "failed" },
      }));
      return null;
    }
    setFileProgress((current) => ({
      ...current,
      [key]: { percent: 100, status: "done" },
    }));
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
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setProgress(percent);
          const key = fileKey(f);
          setFileProgress((current) => ({
            ...current,
            [key]: { percent, status: "uploading" },
          }));
        }
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
    if (!files.length && (!label.trim() || !validLink)) {
      toast("Add a material name and a valid http or https link", "error");
      return;
    }
    // The format is the owner's to state. Nothing infers it, so nothing saves
    // without it — this is the guard that makes "no auto-tag" real rather than
    // a default sitting one click away from being wrong.
    if (!files.length && !kind) {
      toast("Pick the file format first — video, presentation, document or other", "error");
      return;
    }
    if (!files.length && !folder) {
      toast("Choose a system folder first", "error");
      return;
    }
    if (!files.length && !journeyStages.length) {
      toast("Choose at least one buyer's journey stage", "error");
      return;
    }
    if (!files.length && !accessLevel) {
      toast("Pick who can access this material first", "error");
      return;
    }
    if (files.length && !fileReady) {
      toast("Complete the required metadata for every selected file", "error");
      return;
    }
    setBusy(true);
    try {
      // The file's bytes go up first; the material row then references where
      // they landed, through the same PATCH as a pasted link.
      const storedUrl = url.trim();
      let storedPath: string | undefined;
      // Whether the assistant could actually READ the file. Worth saying out
      // loud: an owner uploading a deck so the agent can answer from it needs
      // to know when it was a scan or a video and there were no words to take.
      let wasRead = false;
      let readWords = 0;
      let unsupported = false;
      let readFailed = false;
      const uploaded: Array<{
        file: File;
        url: string;
        docsPath?: string;
        words: number;
        readable: boolean;
        unsupported: boolean;
        failed: boolean;
      }> = [];
      for (let index = 0; index < files.length; index += 1) {
        const currentFile = files[index];
        setUploadIndex(index);
        const stored = await uploadFile(currentFile);
        if (!stored) continue;
        uploaded.push({
          file: currentFile,
          url: stored.url,
          docsPath: stored.docsPath,
          words: typeof stored.words === "number" ? stored.words : 0,
          readable: Boolean(stored.readable),
          unsupported: stored.supported === false,
          failed: Boolean(stored.failed),
        });
      }
      const failedCount = files.length - uploaded.length;
      if (files.length && uploaded.length === 0) {
        toast("None of the selected files uploaded. Review the failed rows and retry.", "error");
        return;
      }
      if (!files.length) {
        wasRead = false;
        readWords = 0;
        unsupported = false;
        readFailed = false;
      } else {
        readWords = uploaded.reduce((total, item) => total + item.words, 0);
        wasRead = uploaded.some((item) => item.readable);
        unsupported = uploaded.every((item) => item.unsupported);
        readFailed = uploaded.some((item) => item.failed);
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
          journeyStages: materialJourneyStages(m),
          accessLevel: m.accessLevel,
          documentType: m.documentType,
          // Without this the siblings come back folderless and one upload
          // would flatten everything Eswar had filed.
          folder: m.folder,
        })),
        ...(uploaded.length
          ? uploaded.map((item) => {
              const key = fileKey(item.file);
              const override = fileOverrides[key] || {};
              const selectedKind = (override.kind || kind) as MaterialFormat;
              const selectedStages = override.journeyStages || journeyStages;
              const selectedAccess = (override.accessLevel || accessLevel) as AccessLevel;
              return {
              id: "",
              kind: selectedKind,
              label:
                fileLabels[key]?.trim() ||
                item.file.name.replace(/\.[^.]+$/, ""),
              url: item.url,
              ...(item.docsPath ? { docsPath: item.docsPath } : {}),
              ...((override.description ?? description).trim()
                ? { description: (override.description ?? description).trim() }
                : {}),
              folder: override.folder || folder,
              journeyStage: selectedStages[0],
              journeyStages: selectedStages,
              accessLevel: selectedAccess,
            };
          })
          : [
              {
                id: "",
                kind: kind as MaterialFormat,
                label: label.trim(),
                url: storedUrl,
                ...(storedPath ? { docsPath: storedPath } : {}),
                ...(description.trim()
                  ? { description: description.trim() }
                  : {}),
                folder,
                journeyStage: journeyStages[0],
                journeyStages,
                accessLevel: accessLevel as AccessLevel,
              },
            ]),
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
          failedCount > 0
            ? `${uploaded.length} ${uploaded.length === 1 ? "file" : "files"} added; ${failedCount} failed and remain in the review list.`
            :
          !files.length
            ? "Material added"
            : wasRead
              ? `${files.length === 1 ? "Material" : `${files.length} materials`} added — Freyr AI read ${readWords.toLocaleString()} words`
              : unsupported
                ? "Material added. There is no text in this kind of file, so the assistant answers from its title and tags."
                : readFailed
                  ? "Material added. The assistant hasn't read it yet — open Edit and save to try again."
                  : "Material added. The assistant found no text inside it.",
          failedCount > 0 || readFailed ? "error" : undefined
        );
        if (failedCount === 0) {
          setOpen(false);
          reset();
        } else {
          const uploadedKeys = new Set(uploaded.map((item) => fileKey(item.file)));
          const failedFiles = files.filter((file) => !uploadedKeys.has(fileKey(file)));
          setFiles(failedFiles);
          setBusy(false);
        }
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

      <Modal open={open} onClose={() => setOpen(false)} title="Add sales materials" size="workflow">
        <div className="space-y-4">
          <div>
              <label className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              File format <span className="font-medium normal-case tracking-normal">Shared default</span>
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

          {/* Shared defaults are applied to every selected file and remain
              individually adjustable in the review rows below. */}
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              <span>Folder</span>
              {!folder && (
                <span className="rounded-md bg-[color:#FFF0EE] px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-[color:#B02020] dark:bg-[color:#3D1D20] dark:text-[color:#FFB4AB]">
                  Required
                </span>
              )}
            </label>
            <ColorSelect
              value={folder}
              options={[
                { value: "", label: "Choose a system folder", color: "#0071E3", icon: Folder },
                ...FIXED_MATERIAL_FOLDERS.map((name) => ({
                  value: name,
                  label: materialFolderLabel(name),
                  color: "#0071E3",
                  icon: Folder,
                })),
              ]}
              onChange={setFolder}
              ariaLabel="Folder"
              minWidth={0}
              collapsible={false}
              className="w-full"
            />
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              Every material belongs to one fixed system folder. “All files” is only a viewing mode.
            </p>
          </div>

          {/* CR-3: every material carries its buyer's-journey stage + who may
              see it. Both must be deliberately chosen rather than silently
              inheriting defaults. */}
          <div className="space-y-3">
            <p className="rounded-lg border border-blue-subtle bg-blue-light/40 px-3 py-2 text-[11.5px] leading-relaxed text-text-secondary">
              These shared defaults apply to the batch. Review and adjust each file before uploading.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
              <label className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                <span>Buyer&apos;s journey stage</span>
                {!journeyStages.length && (
                  <span className="rounded-md bg-[color:#FFF0EE] px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-[color:#B02020] dark:bg-[color:#3D1D20] dark:text-[color:#FFB4AB]">
                    Required
                  </span>
                )}
              </label>
              <MultiColorSelect
                values={journeyStages}
                options={STAGE_OPTIONS.filter((option) => option.value)}
                onChange={(values) => setJourneyStages(values as JourneyStage[])}
                allLabel="Choose one or more stages"
                allIcon={Route}
                allColor="#7C3AED"
                ariaLabel="Buyer's journey stage"
                minWidth={0}
                collapsible={false}
                className="w-full"
              />
              <p className="mt-1.5 text-[11.5px] text-text-tertiary">Select Awareness, Evaluation, Decision, or any combination.</p>
              </div>
              <div>
              <label className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                <span>Who can view this file?</span>
                {!accessLevel && (
                  <span className="rounded-md bg-[color:#FFF0EE] px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-[color:#B02020] dark:bg-[color:#3D1D20] dark:text-[color:#FFB4AB]">
                    Required
                  </span>
                )}
              </label>
              <ColorSelect
                value={accessLevel}
                options={ACCESS_OPTIONS}
                onChange={(v) => setAccessLevel(v as AccessLevel | "")}
                ariaLabel="Who can view this file?"
                minWidth={0}
                collapsible={false}
                compactTrigger
                className="w-full"
              />
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-text-tertiary">
                <span className="font-semibold text-text-secondary">
                  Freyr AI uses every uploaded file.
                </span>{" "}
                This choice only controls who can open it.
              </p>
              </div>
            </div>
          </div>

          <div className={files.length ? "hidden" : undefined}>
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
            {/* Drag the actual files in, or click to browse. The workspace
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
                takeFiles(e.dataTransfer.files);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-5 text-center transition-colors ${
                dragOver
                  ? "border-blue-primary bg-blue-light/50"
                  : files.length
                    ? "border-blue-subtle bg-blue-light/30"
                    : "border-border-light hover:border-blue-subtle hover:bg-blue-light/20"
              }`}
            >
              <input
                type="file"
                multiple
                className="hidden"
                accept=".mp4,.mov,.webm,.m4v,.ppt,.pptx,.key,.doc,.docx,.pdf,.txt,.rtf,.xls,.xlsx,.csv,.zip"
                onChange={(e) => {
                  takeFiles(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
              {files.length ? (
                <>
                  <span className="text-[13.5px] font-semibold text-text-primary">
                    {files.length === 1 ? files[0].name : `${files.length} files selected`}
                  </span>
                  <span className="text-[11.5px] text-text-tertiary">
                    {(files.reduce((total, item) => total + item.size, 0) / 1024 / 1024).toFixed(1)}MB total · click to add more, or{" "}
                    <span
                      role="button"
                      tabIndex={0}
                      className="font-semibold text-[color:#B02020]"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setFiles([]);
                        setFileLabels({});
                        setFileOverrides({});
                        setFileProgress({});
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setFiles([]);
                          setFileLabels({});
                          setFileOverrides({});
                          setFileProgress({});
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
                    Drop files here, or click to browse
                  </span>
                  <span className="text-[11.5px] text-text-tertiary">
                    Select one or many files · PPT, Word, Excel, PDF, ZIP or video
                  </span>
                </>
              )}
            </label>
            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    Review each file
                  </p>
                  <span className="text-[11.5px] text-text-tertiary">
                    {files.length} selected
                  </span>
                </div>
                {files.map((selected, index) => {
                  const key = fileKey(selected);
                  return (
                    <div key={key} className="rounded-xl border border-border-light bg-surface/60 p-3">
                      <div className="grid grid-cols-[28px_minmax(0,1fr)_32px] items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-light text-[11px] font-semibold text-blue-primary">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                        <input
                          value={fileLabels[key] || ""}
                          onChange={(event) =>
                            setFileLabels((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          aria-label={`Title for ${selected.name}`}
                          className="h-8 w-full rounded-md border border-border bg-white px-2.5 text-[12.5px] font-medium text-text-primary outline-none focus:border-blue-primary focus:shadow-input-focus"
                        />
                        <p className="mt-1 truncate text-[10.5px] text-text-tertiary">
                          {selected.name} · {(selected.size / 1024 / 1024).toFixed(1)}MB
                        </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(selected)}
                          aria-label={`Remove ${selected.name}`}
                          title={`Remove ${selected.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md bg-[color:#B02020] text-white hover:opacity-85"
                        >
                          <Trash2 size={14} strokeWidth={2.2} />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                        <ColorSelect
                          value={fileOverrides[key]?.kind || kind}
                          options={FORMATS.map((format) => ({
                            value: format,
                            label: MATERIAL_FORMAT_META[format].label,
                            color: MATERIAL_FORMAT_META[format].color,
                            icon: MATERIAL_FORMAT_META[format].icon,
                          }))}
                          onChange={(value) => updateFileOverride(selected, { kind: value as MaterialFormat })}
                          ariaLabel={`File format for ${selected.name}`}
                          minWidth={0}
                          collapsible={false}
                          className="w-full"
                        />
                        <ColorSelect
                          value={fileOverrides[key]?.folder || folder}
                          options={FIXED_MATERIAL_FOLDERS.map((name) => ({
                            value: name,
                            label: materialFolderLabel(name),
                            color: "#0071E3",
                            icon: Folder,
                          }))}
                          onChange={(value) => updateFileOverride(selected, { folder: value })}
                          ariaLabel={`Folder for ${selected.name}`}
                          minWidth={0}
                          collapsible={false}
                          className="w-full"
                        />
                        <MultiColorSelect
                          values={fileOverrides[key]?.journeyStages || journeyStages}
                          options={STAGE_OPTIONS.filter((option) => option.value)}
                          onChange={(values) => updateFileOverride(selected, { journeyStages: values as JourneyStage[] })}
                          allLabel="Journey stages"
                          allIcon={Route}
                          allColor="#7C3AED"
                          ariaLabel={`Buyer journey stages for ${selected.name}`}
                          minWidth={0}
                          collapsible={false}
                          className="w-full"
                        />
                        <ColorSelect
                          value={fileOverrides[key]?.accessLevel || accessLevel}
                          options={ACCESS_OPTIONS.filter((option) => option.value)}
                          onChange={(value) => updateFileOverride(selected, { accessLevel: value as AccessLevel })}
                          ariaLabel={`Access level for ${selected.name}`}
                          minWidth={0}
                          collapsible={false}
                          className="w-full"
                        />
                      </div>
                      <input
                        value={fileOverrides[key]?.description ?? description}
                        onChange={(event) => updateFileOverride(selected, { description: event.target.value })}
                        aria-label={`Description for ${selected.name}`}
                        placeholder="Optional description for this file"
                        className="mt-2 h-9 w-full rounded-md border border-border bg-white px-2.5 text-[12px] text-text-primary outline-none focus:border-blue-primary"
                      />
                      {fileProgress[key] && (
                        <div className="mt-2" aria-live="polite">
                          <div className="flex items-center justify-between text-[10.5px] font-semibold text-text-secondary">
                            <span className={fileProgress[key].status === "failed" ? "text-error" : ""}>
                              {fileProgress[key].status === "waiting" ? "Waiting" : fileProgress[key].status === "uploading" ? "Uploading" : fileProgress[key].status === "done" ? "Uploaded" : "Upload failed"}
                            </span>
                            <span className="tnum">{fileProgress[key].percent}%</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white">
                            <div
                              className={`h-full rounded-full ${fileProgress[key].status === "failed" ? "bg-error" : "bg-blue-primary"}`}
                              style={{ width: `${fileProgress[key].percent}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {!files.length && (
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

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setOpen(false)}
              className="cursor-pointer text-[13px] font-medium px-3.5 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!canSave}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-60"
            >
              <Plus size={14} strokeWidth={2.2} />
                  {busy
                    ? files.length
                      ? `Uploading ${Math.min(uploadIndex + 1, files.length)} of ${files.length}…`
                      : "Adding…"
                    : files.length > 1
                      ? `Add ${files.length} materials`
                      : "Add material"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
