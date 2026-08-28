"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Captions,
  Check,
  FileQuestion,
  Folder,
  Loader2,
  Package,
  Plus,
  Building2,
  Route,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ColorSelect, MultiColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { InfoHint } from "@/components/ui/InfoHint";
import { FolderBrowserSelect } from "@/components/offerings/FolderBrowserSelect";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  ACCESS_LEVEL_VISIBILITY_COPY,
  JOURNEY_STAGES,
  JOURNEY_STAGE_META,
  MATERIAL_FORMATS,
  MATERIAL_FORMAT_META,
  MATERIAL_META,
  allFolders,
  buildMaterialFolderUploadPlan,
  cleanFolderName,
  isFixedMaterialFolder,
  materialFolderLabel,
  materialJourneyStages,
  type AccessLevel,
  type JourneyStage,
  type MaterialFormat,
  DIVISIONS,
  DIVISION_META,
  materialDivisions,
  type Division,
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
const DIVISION_OPTIONS: ColorOption[] = DIVISIONS.map((d) => ({
  value: d,
  label: `${d} · ${DIVISION_META[d].label}`,
  color: DIVISION_META[d].color,
  icon: DIVISION_META[d].icon,
}));
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

/**
 * WHAT ACTUALLY HAPPENS TO A VIDEO (Saras, Aug 14, change log #39: offering
 * owners "are unaware that the AI Agent cannot access any videos that they
 * upload").
 *
 * Freyr AI answers from the TEXT of uploaded files — see isReadableFile() in
 * lib/fileText, which reads Office documents, PDFs, archives and plain text.
 * WHAT THIS SAYS MATTERS. It used to read "Freyr AI cannot watch video",
 * which was both defeatist and wrong about where this is going (Anir, Aug 14:
 * "there has to be AI used here"). Freyr transcribes the video itself. The
 * upload is an OPTIONAL second opinion: if the owner already has a good
 * transcript, the two get reconciled into one, which beats either alone on
 * names, product terms and numbers that speech recognition mangles.
 *
 * A recommendation, never a block: the video is worth uploading on its own
 * merits, and a rep opens it directly. Deliberately not a warning colour,
 * because nothing is wrong.
 */
/**
 * Attach an owner's own transcript to a video. It saves as its own document
 * beside the video, in the same folder with the same audience, because a
 * document is the thing the assistant can read.
 *
 * Deliberately plain: one line, no drop zone, no preview. It is an optional
 * extra on a card that already carries five controls.
 */
function TranscriptPicker({
  value,
  onPick,
}: {
  value?: File;
  onPick: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-1.5">
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.vtt,.srt,.md,.doc,.docx,.pdf,text/plain"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onPick(picked);
          e.target.value = "";
        }}
      />
      {value ? (
        <span className="flex h-[38px] w-full items-center gap-2 rounded-lg border border-blue-subtle bg-blue-light/40 px-3">
          <Captions
            size={14}
            strokeWidth={2.2}
            className="shrink-0 text-blue-primary"
          />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">
            {value.name}
          </span>
          <button
            type="button"
            aria-label="Remove the transcript"
            onClick={() => onPick(undefined)}
            className="shrink-0 cursor-pointer text-text-tertiary transition-colors hover:text-error"
          >
            <X size={13} strokeWidth={2.4} />
          </button>
        </span>
      ) : (
        // Same height and shape as the selects beside it, so the row of
        // controls on this card reads as one set rather than a field and a
        // stray button.
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-[38px] w-full cursor-pointer items-center gap-2 rounded-lg border border-border-light bg-white px-3 text-[13px] text-text-tertiary transition-colors hover:border-blue-subtle hover:text-blue-primary"
        >
          <Plus size={14} strokeWidth={2.2} className="shrink-0" />
          Add a transcript
        </button>
      )}
    </div>
  );
}

function VideoTranscriptHint({ format }: { format: string }) {
  if (format !== "video") return null;
  return (
    <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-blue-light/60 px-2 py-1.5 text-[11px] leading-snug text-blue-primary">
      <Captions size={12} strokeWidth={2.2} className="mt-[1px] shrink-0" />
      <span>
        Freyr transcribes this automatically. Have your own transcript? Add it
        too and we will reconcile the two into one.
      </span>
    </p>
  );
}

// What each extension USUALLY is — for a gentle heads-up when the picked
// format disagrees (Anir, Aug 12: "if they choose video and it's a docx...
// still let them do it, but just throw a little warning"). Advisory only:
// nothing here blocks a save, because the owner may genuinely know better.
const EXT_EXPECTED_FORMAT: Record<string, MaterialFormat> = {
  mp4: "video", mov: "video", webm: "video", m4v: "video",
  ppt: "presentation", pptx: "presentation", key: "presentation",
  doc: "document", docx: "document", pdf: "document", txt: "document",
  rtf: "document", xls: "document", xlsx: "document", csv: "document",
  zip: "other",
};

function formatMismatch(
  filename: string,
  picked: MaterialFormat | ""
): { ext: string; expected: MaterialFormat } | null {
  if (!picked) return null;
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const expected = EXT_EXPECTED_FORMAT[ext];
  if (!expected || expected === picked) return null;
  return { ext, expected };
}

// Add a sales material to an offering from a POP-UP, right on the offering page
// (Suren: "this should be a pop-up, not take me to some weird edit page"). Saves
// via the offering PATCH and refreshes so it shows immediately.
export function AddMaterialButton({
  offeringId,
  offeringName,
  materials,
  materialFolders = [],
  offeringType,
  variant = "link",
  compact = false,
}: {
  offeringId: string;
  /** Shown at the top of the dialog so nobody uploads into the wrong
   *  offering (Anir, Aug 12: "imagine if someone forgot which offering
   *  they're in"). */
  offeringName?: string;
  materials: OfferingMaterial[];
  /** Empty owner-created folders that cannot be inferred from a material. */
  materialFolders?: string[];
  /** Services get a different folder shelf (Anir, Aug 25). */
  offeringType?: string | null;
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
  const [createdFolders, setCreatedFolders] = useState<string[]>([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);
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
  // A parent with subfolders is a heading, not a destination (Saras' call,
  // Aug 12: "the parent folder shouldn't be an option — they should choose
  // between the subfolders"). The open folder only preselects when it's a
  // leaf, and the pickers below list leaves only.
  const allKnownFolders = allFolders(materials, materialFolders, offeringType);
  const openFolderIsLeaf =
    !!openFolder &&
    !allKnownFolders.some(
      (other) => other !== openFolder && other.startsWith(`${openFolder}/`)
    );
  const [folder, setFolder] = useState(
    isFixedMaterialFolder(openFolder) && openFolderIsLeaf ? openFolder : ""
  );
  const [journeyStages, setJourneyStages] = useState<JourneyStage[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
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
        divisions?: Division[];
        accessLevel?: AccessLevel;
        description?: string;
        /** An owner's own transcript for a video, uploaded alongside it and
         *  filed in the same folder so the assistant can read what was said
         *  (Anir, Aug 14). Optional: the video saves fine without one. */
        transcript?: File;
      }
    >
  >({});
  const [fileProgress, setFileProgress] = useState<
    Record<string, { percent: number; status: "waiting" | "uploading" | "done" | "failed" }>
  >({});
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The dedicated upload-progress dialog. The form closes the moment the
   *  upload starts — watching bytes move is its own screen, not a state of
   *  the form (Anir, Aug 12: "it should just be a pop-up that shows the
   *  loading screen"). */
  const [uploadingOpen, setUploadingOpen] = useState(false);
  /** 0-100 while bytes are moving, null when nothing is uploading. */
  const [, setProgress] = useState<number | null>(null);
  const [uploadIndex, setUploadIndex] = useState(0);

  function fileKey(file: File) {
    const relativePath = file.webkitRelativePath || file.name;
    return `${relativePath}\u0000${file.size}\u0000${file.lastModified}`;
  }

  /** "14 KB", never "0.0MB" — a small file must not read as empty (Inayat's
   *  14KB test doc showed 0.0, which looks like the upload lost the bytes). */
  function fmtFileSize(bytes: number) {
    if (bytes < 1024 * 1024)
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function reset() {
    setKind("");
    setJourneyStages([]);
    setFolder(isFixedMaterialFolder(openFolder) && openFolderIsLeaf ? openFolder : "");
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
  /** Depth-first walk of dropped directory entries into plain Files. */
  async function collectDroppedEntries(entries: FileSystemEntry[]): Promise<File[]> {
    const out: File[] = [];
    async function walk(entry: FileSystemEntry): Promise<void> {
      if (entry.isFile) {
        const file = await new Promise<File | null>((resolve) =>
          (entry as FileSystemFileEntry).file(resolve, () => resolve(null))
        );
        if (file) out.push(file);
        return;
      }
      if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        // readEntries returns batches of at most 100; drain until empty.
        for (;;) {
          const batch = await new Promise<FileSystemEntry[]>((resolve) =>
            reader.readEntries(resolve, () => resolve([]))
          );
          if (!batch.length) break;
          for (const child of batch) await walk(child);
        }
      }
    }
    for (const entry of entries) await walk(entry);
    return out;
  }

  function takeFiles(list: FileList | File[] | null) {
    const picked = Array.from(list || []);
    if (!picked.length) return;
    const unique = new Map<string, File>();
    for (const existing of files) unique.set(fileKey(existing), existing);
    for (const next of picked) unique.set(fileKey(next), next);
    const merged = Array.from(unique.values());
    setFiles(merged);
    /**
     * WHAT YOU TYPED IN "NAME" IS THE NAME (Anir, Aug 13: "when I label the
     * file something, you're overwriting the name that I put").
     *
     * The Name field is visible until a file is picked, and hidden afterwards
     * in favour of the per-file label. So the normal order — type a name, then
     * choose the file — used to throw the name away: picking the file hid the
     * box he had just typed in, pre-filled the per-file label from the
     * FILENAME, and saved that instead. Nothing warned him; the name simply
     * came back different.
     *
     * The typed name now travels onto the first file it can belong to. Only on
     * the first pick, when the box was actually on screen for him to type in;
     * files added afterwards still default to their own filename.
     */
    const typedName = label.trim();
    const firstPick = files.length === 0;
    setFileLabels((current) => {
      const next = { ...current };
      let carried = false;
      for (const file of merged) {
        const key = fileKey(file);
        if (next[key]) continue;
        if (typedName && firstPick && !carried) {
          next[key] = typedName;
          carried = true;
          continue;
        }
        next[key] = file.name.replace(/\.[^.]+$/, "");
      }
      return next;
    });

    // A directory pick is not merely a faster multi-select. Preserve the
    // directory tree the owner chose so "Proposals/Client A" does not arrive
    // as a flat pile of files in an unrelated system folder. The browser puts
    // the relative path on every File; ordinary file picks leave it blank.
    const folderPlan = buildMaterialFolderUploadPlan(
      picked.map((file) => ({
        key: fileKey(file),
        relativePath: file.webkitRelativePath,
      }))
    );
    if (folderPlan.folders.length) {
      setCreatedFolders((current) =>
        Array.from(new Set([...current, ...folderPlan.folders]))
      );
      if (folderPlan.commonRoot) setFolder(folderPlan.commonRoot);
      setFileOverrides((current) => {
        const next = { ...current };
        for (const [key, originalFolder] of Object.entries(
          folderPlan.folderByKey
        )) {
          next[key] = { ...next[key], folder: originalFolder };
        }
        return next;
      });
    }
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
  /**
   * A PROPOSAL HAS TO SAY WHEN IT WENT OUT (Saras, Aug 21, from the rep
   * feedback: "whenever an offering owner is uploading a file it should also
   * be mentioned somewhere which month and year that proposal was submitted
   * in... as soon as they choose the Proposals folder, the description should
   * become mandatory. There should be a prompt saying 'enter month and year
   * of proposal submission'. Just for the Proposals folder, not for anything
   * else").
   *
   * A proposal with no date is the one file in the repository nobody can use:
   * a rep cannot tell whether they are about to send a customer this year's
   * pricing or 2023's.
   */
  const isProposalFolder = (value: string) =>
    /(^|\/)proposals$/i.test((value || "").trim());
  const proposalNeedsDate = (value: string, note: string) =>
    isProposalFolder(value) && !note.trim();

  const fileReady = files.every((file) => {
    const key = fileKey(file);
    const override = fileOverrides[key] || {};
    return Boolean(
      fileLabels[key]?.trim() &&
        (override.kind || kind) &&
        (override.folder || folder) &&
        (override.journeyStages || journeyStages).length &&
        (override.accessLevel || accessLevel) &&
        /* DIVISION IS REQUIRED NOW (Saras, Aug 21: "let's make this mandatory
           as well, the division dropdown, because these two say required and
           this doesn't"). */
        (override.divisions ?? divisions).length &&
        !proposalNeedsDate(override.folder || folder, description)
    );
  });
  const linkReady = Boolean(
    !files.length &&
      label.trim() &&
      validLink &&
      kind &&
      folder &&
      journeyStages.length &&
      accessLevel &&
      divisions.length &&
      !proposalNeedsDate(folder, description)
  );
  const canSave = !busy && (files.length ? fileReady : linkReady);
  const folderOptions = allFolders(materials, [
    ...materialFolders,
    ...createdFolders,
  ]);
  const selectableFolders = folderOptions.filter(
    (name) =>
      !folderOptions.some(
        (other) => other !== name && other.startsWith(`${name}/`)
      )
  );

  async function createFolder() {
    const name = cleanFolderName(folderName);
    if (!name) {
      toast("Give the new folder a name", "error");
      return;
    }
    if (folderOptions.includes(name)) {
      if (selectableFolders.includes(name)) setFolder(name);
      else toast("That's a parent folder. Pick one of its subfolders.", "error");
      setFolderName("");
      setCreatingFolder(false);
      return;
    }
    setSavingFolder(true);
    try {
      const nextFolders = Array.from(
        new Set([...materialFolders, ...createdFolders, name])
      );
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialFolders: nextFolders }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast(data.error || "Could not create that folder", "error");
        return;
      }
      setCreatedFolders((current) => [...current, name]);
      setFolder(name);
      setFolderName("");
      setCreatingFolder(false);
      toast(`Created “${name}”`);
      router.refresh();
    } catch {
      toast("Could not create that folder", "error");
    } finally {
      setSavingFolder(false);
    }
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
      // THE DIRECT PUT DIES IN REAL BROWSERS (Anir, Aug 13: "Why is this
      // creating a fucking error every single time?… You can't keep giving
      // errors on the uploading files"). Diagnosis, proven with a server-side
      // repro: FreyaFusion's bucket has NO CORS policy, so the preflight
      // answers 403 and the browser never sends the bytes — while the very
      // same signed PUT succeeds from a server. Until the bucket allows our
      // origins, failing here silently reroutes the file through our own
      // server, which stores into the SAME bucket server-side. No toast, no
      // dead end; the rep just sees the upload finish.
      return uploadThroughServer(f);
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
    const key = fileKey(f);
    setFileProgress((current) => ({
      ...current,
      [key]: { percent: current[key]?.percent || 0, status: "uploading" },
    }));
    const fd = new FormData();
    fd.append("file", f);
    /**
     * XHR, NOT FETCH — SO THE BAR ACTUALLY MOVES.
     *
     * Anir, Aug 13: "make sure this goes from 0 to 100 normally. It just goes
     * all at once." Right: fetch() reports nothing while a body uploads, so
     * this path sat at 0% and snapped to 100% when the response came back.
     * Now that the bucket's missing CORS routes every browser upload through
     * here, this IS the bar everyone watches, so it has to be real.
     */
    const { ok, status, body } = await new Promise<{
      ok: boolean;
      status: number;
      body: string;
    }>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/offerings/${offeringId}/materials/upload`);
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        // Cap the sending phase at 95: the last stretch is the server storing
        // the bytes, and a bar that hits 100 before the file is safe is a lie.
        const percent = Math.min(95, Math.round((e.loaded / e.total) * 95));
        setProgress(percent);
        setFileProgress((current) => ({
          ...current,
          [key]: { percent, status: "uploading" },
        }));
      };
      xhr.onload = () =>
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => resolve({ ok: false, status: 0, body: "" });
      xhr.onabort = () => resolve({ ok: false, status: 0, body: "" });
      xhr.send(fd);
    });
    const up = { ok, status };
    let stored: {
      url?: string;
      error?: string;
      docsPath?: string;
      indexing?: boolean;
      supported?: boolean;
    } = {};
    try {
      stored = body ? JSON.parse(body) : {};
    } catch {
      stored = {};
    }
    if (!up.ok || !stored.url) {
      toast(stored.error || "Couldn't upload that file", "error");
      setFileProgress((current) => ({
        ...current,
        [key]: { percent: current[key]?.percent || 0, status: "failed" },
      }));
      return null;
    }
    setProgress(null);
    setFileProgress((current) => ({
      ...current,
      [key]: { percent: 100, status: "done" },
    }));
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
      toast("Pick the file format first: video, presentation, document or other", "error");
      return;
    }
    if (!files.length && !folder) {
      toast("Choose a folder first", "error");
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
    // Files get the dedicated progress screen; a pasted link is one quick
    // request and keeps the button spinner.
    if (files.length) {
      setOpen(false);
      setUploadingOpen(true);
      setFileProgress(
        Object.fromEntries(
          files.map((file) => [
            fileKey(file),
            { percent: 0, status: "waiting" as const },
          ])
        )
      );
    }
    try {
      // The file's bytes go up first; the material row then references where
      // they landed, through the same PATCH as a pasted link.
      const storedUrl = url.trim();
      let storedPath: string | undefined;
      // Whether the assistant could actually READ the file. Worth saying out
      // loud: an owner uploading a deck so the agent can answer from it needs
      // to know when it was a scan or a video and there were no words to take.
      // Whether any stored file is being read in the background. Nothing here
      // waits on the outcome — that is the point of the split.
      let indexing = false;
      const uploaded: Array<{
        file: File;
        url: string;
        docsPath?: string;
        indexing: boolean;
        /** Set when this row IS a transcript, naming the video it belongs to
         *  so the saved material can say so. */
        transcriptFor?: string;
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
          indexing: Boolean(stored.indexing),
        });
        // A transcript rides with its video: same folder, same audience, and
        // it is the half the assistant can actually read.
        const transcript = fileOverrides[fileKey(currentFile)]?.transcript;
        if (transcript) {
          const storedTranscript = await uploadFile(transcript);
          if (storedTranscript) {
            uploaded.push({
              file: transcript,
              url: storedTranscript.url,
              docsPath: storedTranscript.docsPath,
              indexing: Boolean(storedTranscript.indexing),
              transcriptFor:
                fileLabels[fileKey(currentFile)]?.trim() ||
                currentFile.name.replace(/\.[^.]+$/, ""),
            });
            /**
             * Ask the server to merge the two once both are readable. Only the
             * client knows this transcript belongs to this video, so it says so
             * rather than leaving the server to guess from filenames.
             *
             * Deliberately not awaited: transcription runs in the background
             * and can take minutes on a long recording. The endpoint answers
             * "not ready" harmlessly if it arrives first, and the machine
             * transcript is stored either way.
             */
            if (stored.docsPath && storedTranscript.docsPath) {
              void fetch(
                `/api/offerings/${offeringId}/materials/reconcile-transcript`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    videoPath: stored.docsPath,
                    transcriptPath: storedTranscript.docsPath,
                  }),
                }
              ).catch(() => undefined);
            }
          }
        }
      }
      const failedCount = files.length - uploaded.length;
      if (files.length && uploaded.length === 0) {
        toast("None of the selected files uploaded. Review the failed rows and retry.", "error");
        setUploadingOpen(false);
        setOpen(true);
        return;
      }
      indexing = files.length > 0 && uploaded.some((item) => item.indexing);
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
          divisions: materialDivisions(m),
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
              // A transcript inherits everything from the video it belongs to,
              // except its format: it is a document, and being a document is
              // exactly what lets the assistant read it.
              const parentKey = item.transcriptFor
                ? Object.keys(fileOverrides).find(
                    (k) => fileOverrides[k]?.transcript === item.file
                  )
                : undefined;
              const parent = parentKey ? fileOverrides[parentKey] || {} : override;
              const selectedKind = item.transcriptFor
                ? ("document" as MaterialFormat)
                : ((override.kind || kind) as MaterialFormat);
              const selectedStages = item.transcriptFor
                ? parent.journeyStages || journeyStages
                : override.journeyStages || journeyStages;
              const selectedAccess = (
                item.transcriptFor
                  ? parent.accessLevel || accessLevel
                  : override.accessLevel || accessLevel
              ) as AccessLevel;
              return {
              id: "",
              kind: selectedKind,
              label: item.transcriptFor
                ? `${item.transcriptFor} (transcript)`
                : fileLabels[key]?.trim() ||
                  item.file.name.replace(/\.[^.]+$/, ""),
              url: item.url,
              ...(item.docsPath ? { docsPath: item.docsPath } : {}),
              ...(item.transcriptFor
                ? { description: `What was said in ${item.transcriptFor}.` }
                : (override.description ?? description).trim()
                  ? { description: (override.description ?? description).trim() }
                  : {}),
              folder: item.transcriptFor
                ? parent.folder || folder
                : override.folder || folder,
              journeyStage: selectedStages[0],
              journeyStages: selectedStages,
              ...(item.transcriptFor
                ? (parent.divisions ?? divisions).length
                  ? { divisions: parent.divisions ?? divisions }
                  : {}
                : (override.divisions ?? divisions).length
                  ? { divisions: override.divisions ?? divisions }
                  : {}),
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
                ...(divisions.length ? { divisions } : {}),
                accessLevel: accessLevel as AccessLevel,
              },
            ]),
      ];
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materials: next,
          materialFolders: Array.from(
            new Set([...materialFolders, ...createdFolders])
          ),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        // SAY THE TRUE REASON. The old copy blamed the file type for every
        // outcome, so a PDF that extracts perfectly was reported as an
        // unreadable format when the real cause was a failed read-back
        // (Anir, Jul 29: "it literally just gave me a pop-up that said it
        // can't read this file type... that thing should never say that").
        /**
         * THE MESSAGE IS ABOUT STORAGE, NOT ABOUT THE AI.
         *
         * Reading the file now happens after the upload answers (Anir, Aug 13:
         * "get it in the fucking system" first, "then train the AI on it"), so
         * the word count simply is not known yet and must not be waited for.
         * The old copy reported the assistant's reading as part of the upload
         * result, which is how a stored file ended up described as a failure.
         */
        toast(
          failedCount > 0
            ? `${uploaded.length} ${uploaded.length === 1 ? "file" : "files"} added; ${failedCount} failed and remain in the review list.`
            : !files.length
              ? "Material added"
              : indexing
                ? `${files.length === 1 ? "Material" : `${files.length} materials`} added. The assistant reads it in the background.`
                : files.length === 1
                  ? "Material added"
                  : `${files.length} materials added`,
          failedCount > 0 ? "error" : undefined
        );
        if (failedCount === 0) {
          // Let the finished state land for a beat — every bar full, the green
          // check on — before the dialog hands off to the folder.
          if (files.length) await new Promise((r) => setTimeout(r, 900));
          setUploadingOpen(false);
          setOpen(false);
          // GO TO THE FILE. Saving used to leave the page on the folder
          // overview, where the fresh upload is invisible inside its folder
          // (Anir, Aug 12: "it should take me to wherever the file is and
          // show me the file"). Open the folder the (first) new material
          // landed in.
          const landedFolder = uploaded.length
            ? fileOverrides[fileKey(uploaded[0].file)]?.folder || folder
            : folder;
          reset();
          if (landedFolder) {
            router.push(
              `?tab=materials&mf=${encodeURIComponent(landedFolder)}`
            );
          }
        } else {
          const uploadedKeys = new Set(uploaded.map((item) => fileKey(item.file)));
          const failedFiles = files.filter((file) => !uploadedKeys.has(fileKey(file)));
          setFiles(failedFiles);
          setBusy(false);
          setUploadingOpen(false);
          setOpen(true);
        }
        router.refresh();
      } else {
        toast(data.error || "Couldn't add that", "error");
        setUploadingOpen(false);
        setOpen(true);
      }
    } catch {
      toast("Couldn't add that", "error");
      setUploadingOpen(false);
      setOpen(true);
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

      <Modal open={open} onClose={() => setOpen(false)} title="Add sales materials" size="workflow" tall>
        <div className="space-y-4">
          {offeringName && (
            <div className="flex items-center gap-2.5 rounded-lg bg-blue-light/60 px-3 py-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-primary/15 text-blue-primary">
                <Package size={15} strokeWidth={2} />
              </span>
              {/* "Add sales material to <offering>" and nothing else. The old
                  line repeated the dialog's own title back at the reader
                  (Anir, Aug 14). */}
              <p className="text-[12px] text-text-secondary">
                Add sales material to{" "}
                <span className="font-semibold text-text-primary">
                  {offeringName}
                </span>
              </p>
            </div>
          )}
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
            <VideoTranscriptHint format={kind} />
          </div>

          {/* Shared defaults are applied to every selected file and remain
              individually adjustable in the review rows below. */}
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              <span>Folder</span>
              <InfoHint text="Which folder this file will live in. Create a new one with the + button." />
              {/* This is the DEFAULT, not the answer. It used to shout Required
                  whenever it was empty, even when every file below already had
                  a folder chosen on its own card, so the modal looked unfinished
                  when it was complete (Anir, Aug 14). The badge now asks the
                  real question: is any file still without one? */}
              {files.some((f) => !(fileOverrides[fileKey(f)]?.folder || folder)) && (
                <span className="rounded-md bg-[color:#FFF0EE] px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-[color:#B02020] dark:bg-[color:#3D1D20] dark:text-[color:#FFB4AB]">
                  Required
                </span>
              )}
            </label>
            <div className="flex items-stretch gap-2">
              <FolderBrowserSelect
                value={folder}
                onChange={setFolder}
                folders={folderOptions}
                materials={materials}
                ariaLabel="Folder"
                className="min-w-0 flex-1"
              />
              {/* NO NEW FOLDERS FROM HERE. The twelve standard folders are the
                  shape every offering shares, and letting each uploader invent
                  their own is how one workspace ends up with "Decks", "decks"
                  and "Sales Decks" (Anir, Aug 14: "no one should be able to
                  create new folders"). Files go into the folders that exist. */}
            </div>
          </div>

          {/* CR-3: every material carries its buyer's-journey stage + who may
              see it. Both must be deliberately chosen rather than silently
              inheriting defaults. */}
          <div className="space-y-3">
            {/* Three across, not two-then-one. Stage, audience and division are
                the same kind of choice, so they read as one row (Anir, Aug 14:
                "put these three on just one dropdown... three dropdowns in one
                row"). They collapse to one column on a narrow window. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
              <label className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                <span>Buyer&apos;s journey stage</span>
                <InfoHint text="Select Awareness, Evaluation, Decision, or any combination." />
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
                fluid
                className="w-full"
              />
              </div>
              <div>
              <label className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                <span>Who can view this file?</span>
                <InfoHint text="Freyr AI reads every file you upload. This choice only controls who can open it." />
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
              </div>
              {/* DIVISION (Suren, Aug 13: "just one more tagging dropdown here,
                  which should say division, and then MPR, MDV, CON"). Multi
                  select for the same reason the journey stage is — "it can be
                  all three combined". Required as of Aug 21 (Saras: "let's
                  make this mandatory as well, because these two say required
                  and this doesn't"): a file nobody can attribute to a division
                  is a file the division filter silently hides. */}
              <div>
              <label className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                <span>Division</span>
                <InfoHint text="Which Freyr division this file is for. Pick any combination." />
                {!divisions.length && (
                  <span className="rounded-md bg-[color:#FFF0EE] px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-[color:#B02020] dark:bg-[color:#3D1D20] dark:text-[color:#FFB4AB]">
                    Required
                  </span>
                )}
              </label>
              <MultiColorSelect
                values={divisions}
                options={DIVISION_OPTIONS}
                onChange={(values) => setDivisions(values as Division[])}
                allLabel="Any division"
                placeholder="Choose one or more divisions"
                allIcon={Building2}
                allColor="#0071E3"
                ariaLabel="Division"
                minWidth={0}
                collapsible={false}
                fluid
                className="w-full"
              />
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
              {isProposalFolder(folder) ? (
                !description.trim() && (
                  <span className="rounded-md bg-[color:#FFF0EE] px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-[color:#B02020] dark:bg-[color:#3D1D20] dark:text-[color:#FFB4AB]">
                    Required
                  </span>
                )
              ) : (
                <span className="text-[10px] font-medium normal-case tracking-normal text-text-tertiary">
                  Optional
                </span>
              )}
            </label>
            <textarea
              id="material-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={
                isProposalFolder(folder)
                  ? "Enter month and year of proposal submission, e.g. submitted March 2026"
                  : "One sentence on what this file is for: skip it if the title says enough."
              }
              className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-[14px] leading-snug text-text-primary focus:outline-none focus:border-blue-subtle focus:shadow-input-focus"
            />
            {isProposalFolder(folder) && (
              <p className="mt-1.5 text-[11.5px] leading-snug text-text-secondary">
                Proposals need the month and year they were submitted, so the
                next rep can tell this year&apos;s pricing from an old one.
              </p>
            )}
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
                // A dropped FOLDER arrives as a directory entry, not files —
                // walk it so dragging a whole folder in just works (Anir,
                // Aug 8: "if he drags a folder in, it's fine"). Browsers
                // without the entry API fall back to plain files.
                const items = Array.from(e.dataTransfer.items || []);
                const entries = items
                  .map((item) => item.webkitGetAsEntry?.())
                  .filter((entry): entry is FileSystemEntry => Boolean(entry));
                if (entries.some((entry) => entry.isDirectory)) {
                  void collectDroppedEntries(entries).then((collected) => {
                    if (collected.length) takeFiles(collected);
                  });
                  return;
                }
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
                    {fmtFileSize(files.reduce((total, item) => total + item.size, 0))} total · click to add more, or{" "}
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
                  {/* ONE door, no side buttons (Anir, Aug 8: "the whole
                      thing is just file or folder, stop confusing them").
                      Drag takes files OR a whole folder; click opens the file
                      browser — an OS picker cannot offer both at once, so
                      folders come in by drag. */}
                  <span className="text-[13.5px] font-semibold text-text-primary">
                    Drop files or a whole folder here
                  </span>
                  <span className="text-[11.5px] text-text-tertiary">
                    or click to browse · PPT, Word, Excel, PDF, ZIP or video
                  </span>
                </>
              )}
            </label>
            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      Review each file
                    </p>
                    {/* Say what these repeated controls ARE — without this the
                        card read as an unlabeled wall of dropdowns (Anir,
                        Aug 12: "when you add a file, you lose it... I have no
                        idea what's going on"). */}
                    <p className="mt-0.5 text-[11.5px] text-text-secondary">
                      Each file starts with your shared choices above — adjust
                      any file on its own card before saving.
                    </p>
                  </div>
                  <span className="shrink-0 text-[11.5px] text-text-tertiary">
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
                          placeholder="What this file is called"
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
                          {selected.webkitRelativePath || selected.name} · {fmtFileSize(selected.size)}
                        </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(selected)}
                          aria-label={`Remove ${selected.name}`}
                          title={`Remove ${selected.name}`}
                          className="text-[color:#DC2626] flex h-8 w-8 items-center justify-center rounded-md bg-[color:#B02020] text-white hover:opacity-85"
                        >
                          <Trash2 size={14} strokeWidth={2.2} />
                        </button>
                      </div>
                      {/* The same four choices as the shared section, each
                          under its own name — an unlabeled dropdown is a
                          mystery box the second it leaves its labeled twin. */}
                      <div className="mt-3 grid grid-cols-1 gap-x-3 gap-y-2.5 border-t border-border-light pt-3 lg:grid-cols-2">
                        <div>
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            File format
                          </span>
                          <ColorSelect
                            value={fileOverrides[key]?.kind || kind}
                            options={[
                              // Never wear the first option while empty — an
                              // unpicked control that reads "Video" is a lie.
                              ...((fileOverrides[key]?.kind || kind)
                                ? []
                                : [{ value: "", label: "Pick a format", color: "#B02020", icon: FileQuestion }]),
                              ...FORMATS.map((format) => ({
                                value: format,
                                label: MATERIAL_FORMAT_META[format].label,
                                color: MATERIAL_FORMAT_META[format].color,
                                icon: MATERIAL_FORMAT_META[format].icon,
                              })),
                            ]}
                            onChange={(value) => updateFileOverride(selected, { kind: value as MaterialFormat })}
                            ariaLabel={`File format for ${selected.name}`}
                            minWidth={0}
                            collapsible={false}
                            className="w-full"
                          />
                          {(() => {
                            const mismatch = formatMismatch(
                              selected.name,
                              fileOverrides[key]?.kind || kind
                            );
                            if (!mismatch) return null;
                            return (
                              <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-warning">
                                <AlertTriangle
                                  size={12}
                                  strokeWidth={2.2}
                                  className="mt-[1px] shrink-0"
                                />
                                A .{mismatch.ext} file is usually{" "}
                                {MATERIAL_FORMAT_META[mismatch.expected].label} —
                                saving it as{" "}
                                {MATERIAL_FORMAT_META[(fileOverrides[key]?.kind || kind) as MaterialFormat].label}{" "}
                                is still allowed.
                              </p>
                            );
                          })()}
                        </div>
                        {/* TRANSCRIPT, as a proper field rather than a button
                            hanging off the format dropdown. The blue banner is
                            NOT repeated here: it says the same thing as the one
                            at the top of the dialog, and twice is noise (Anir,
                            Aug 14). The explanation lives on the question mark
                            instead, where every other field keeps its help. */}
                        {(fileOverrides[key]?.kind || kind) === "video" && (
                          <div>
                            <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                              Transcript
                              <span className="font-medium normal-case tracking-normal text-text-tertiary">
                                optional
                              </span>
                              <InfoHint text={"Freyr transcribes this video automatically once it is uploaded.\nIf you already have a transcript, add it here and the two are reconciled into one: your spelling wins on names and product terms, and anything only the machine caught is kept."} />
                            </span>
                            <TranscriptPicker
                              value={fileOverrides[key]?.transcript}
                              onPick={(f) =>
                                updateFileOverride(selected, { transcript: f })
                              }
                            />
                          </div>
                        )}
                        <div>
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            Folder
                          </span>
                          <FolderBrowserSelect
                            value={fileOverrides[key]?.folder || folder}
                            onChange={(next) => updateFileOverride(selected, { folder: next })}
                            folders={folderOptions}
                            materials={materials}
                            ariaLabel={`Folder for ${selected.name}`}
                          />
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            Buyer&apos;s journey stage
                          </span>
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
                            fluid
                            className="w-full"
                          />
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            Who can view this file?
                          </span>
                          <ColorSelect
                            value={fileOverrides[key]?.accessLevel || accessLevel}
                            options={[
                              ...((fileOverrides[key]?.accessLevel || accessLevel)
                                ? []
                                : [{ value: "", label: "Choose who can view it", color: "#B02020", icon: ShieldCheck }]),
                              ...ACCESS_OPTIONS.filter((option) => option.value),
                            ]}
                            onChange={(value) => updateFileOverride(selected, { accessLevel: value as AccessLevel })}
                            ariaLabel={`Access level for ${selected.name}`}
                            minWidth={0}
                            collapsible={false}
                            compactTrigger
                            className="w-full"
                          />
                        </div>
                      </div>
                      <div className="mt-2.5">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                          Description{" "}
                          <span className="font-medium normal-case tracking-normal">
                            Optional
                          </span>
                        </span>
                        <input
                          value={fileOverrides[key]?.description ?? description}
                          onChange={(event) => updateFileOverride(selected, { description: event.target.value })}
                          aria-label={`Description for ${selected.name}`}
                          placeholder="One sentence on what this file is for"
                          className="h-9 w-full rounded-md border border-border bg-white px-2.5 text-[12px] text-text-primary outline-none focus:border-blue-primary"
                        />
                      </div>
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

      {/* THE UPLOAD IS ITS OWN SCREEN. The form hands off here the moment
          bytes start moving — one calm list, each file with its own bar and
          state, nothing else competing for attention (Anir, Aug 12: "a pop-up
          that shows the loading screen... multiple files... this is going,
          this is going"). */}
      <Modal
        open={uploadingOpen}
        onClose={() => {
          if (!busy) setUploadingOpen(false);
        }}
        title="Uploading materials"
        size="wide"
      >
        <div className="space-y-4">
          {(() => {
            const rows = files.map((file) => {
              const key = fileKey(file);
              const progress = fileProgress[key] || { percent: 0, status: "waiting" as const };
              return { file, key, progress };
            });
            const doneCount = rows.filter((row) => row.progress.status === "done").length;
            const failedCount = rows.filter((row) => row.progress.status === "failed").length;
            const overall = rows.length
              ? Math.round(rows.reduce((sum, row) => sum + row.progress.percent, 0) / rows.length)
              : 0;
            const allSettled = rows.length > 0 && rows.every((row) => row.progress.status === "done" || row.progress.status === "failed");
            return (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-light text-blue-primary">
                    {allSettled && failedCount === 0 ? (
                      <Check size={20} strokeWidth={2.4} className="text-success" />
                    ) : (
                      <Loader2 size={20} strokeWidth={2.2} className="animate-spin" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-text-primary">
                      {allSettled
                        ? failedCount
                          ? `${doneCount} uploaded, ${failedCount} failed`
                          : "All files uploaded"
                        : `Uploading ${rows.length === 1 ? "1 file" : `${rows.length} files`}${offeringName ? ` to ${offeringName}` : ""}`}
                    </p>
                    {/* This dialog is about ONE thing: are the bytes in?
                        Freyr AI's reading used to be advertised here, which is
                        what made the whole screen confusing (Anir, Aug 13:
                        "How do I even know if the AI read it?"). That now
                        reports itself on the material's own row, where the
                        file lives. */}
                    <p className="mt-0.5 text-[11.5px] text-text-secondary">
                      {rows.length === 1
                        ? `${files[0].name} · ${fmtFileSize(files[0].size)}`
                        : allSettled
                          ? `${rows.length} files${offeringName ? ` in ${offeringName}` : ""}`
                          : `File ${Math.min(doneCount + failedCount + 1, rows.length)} of ${rows.length}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-[15px] font-bold tnum text-blue-primary">{overall}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full bg-blue-primary transition-[width] duration-300 ease-out"
                    style={{ width: `${Math.max(overall, 3)}%` }}
                  />
                </div>
                {/* ONE FILE NEEDS ONE BAR (Anir, Aug 13: "why are there two
                    progress bars? That looks weird"). With a single file the
                    header bar already IS that file's bar, so repeating it
                    underneath said nothing twice. With several, the per-file
                    rows earn their place — and they are indented behind a rail
                    so it reads as "this total, made of these parts" ("clearly
                    show that this is the main progress bar for all the files,
                    and these are each individual ones… like an indented
                    list"). */}
                {rows.length > 1 && (
                  <div className="mt-1">
                    <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
                      Each file
                      <span className="h-px flex-1 bg-border-light" />
                    </p>
                    <ul className="space-y-2 border-l-2 border-border-light pl-3.5">
                  {rows.map(({ file, key, progress }, index) => {
                    const phase =
                      progress.status === "done"
                        ? "Uploaded"
                        : progress.status === "failed"
                          ? "Failed. Retry from the form"
                          : progress.status === "waiting"
                            ? "Waiting its turn"
                            : progress.percent >= 100
                              ? "Saving & reading with Freyr AI…"
                              : "Uploading…";
                    return (
                      <li
                        key={key}
                        className="step-in rounded-xl border border-border-light bg-surface/60 px-3.5 py-3"
                        style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              progress.status === "failed"
                                ? "bg-error/10 text-error"
                                : progress.status === "done"
                                  ? "bg-success/10 text-success"
                                  : "bg-blue-light text-blue-primary"
                            }`}
                          >
                            {progress.status === "done" ? (
                              <Check size={15} strokeWidth={2.6} />
                            ) : progress.status === "failed" ? (
                              <AlertTriangle size={14} strokeWidth={2.2} />
                            ) : progress.status === "waiting" ? (
                              <span className="text-[11px] font-bold tnum">{index + 1}</span>
                            ) : (
                              <Loader2 size={15} strokeWidth={2.2} className="animate-spin" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-text-primary">
                              {fileLabels[key]?.trim() || file.name.replace(/\.[^.]+$/, "")}
                            </span>
                            <span className="block text-[11px] text-text-tertiary">
                              {file.name} · {fmtFileSize(file.size)} · {phase}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 text-[12px] font-semibold tnum ${
                              progress.status === "failed" ? "text-error" : "text-text-secondary"
                            }`}
                          >
                            {progress.status === "failed" ? "Failed" : `${progress.percent}%`}
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                          <div
                            className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                              progress.status === "failed" ? "bg-error" : progress.status === "done" ? "bg-success" : "bg-blue-primary"
                            }`}
                            style={{ width: `${Math.max(progress.percent, progress.status === "waiting" ? 0 : 4)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                    </ul>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </Modal>

      <Modal
        open={creatingFolder}
        onClose={() => {
          if (savingFolder) return;
          setCreatingFolder(false);
          setFolderName("");
        }}
        title="Create a folder"
        stacked
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-light text-blue-primary">
              <Folder size={19} strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-text-primary">
                Add a folder to this offering
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                It will be selected automatically when you create it.
              </p>
            </div>
          </div>
          <div>
            <label
              htmlFor="new-material-folder-name"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary"
            >
              Folder name
            </label>
            <input
              id="new-material-folder-name"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && folderName.trim()) {
                  event.preventDefault();
                  void createFolder();
                }
              }}
              autoFocus
              maxLength={60}
              placeholder="e.g. Regional sales decks"
              aria-label="New folder name"
              className="h-11 w-full rounded-lg border border-border bg-white px-3 text-[13.5px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary focus:shadow-input-focus"
            />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border-light pt-4">
            <button
              type="button"
              onClick={() => {
                setCreatingFolder(false);
                setFolderName("");
              }}
              disabled={savingFolder}
              className="h-10 rounded-lg border border-border-light px-4 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface hover:text-text-primary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void createFolder()}
              disabled={!folderName.trim() || savingFolder}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-primary px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={15} strokeWidth={2.2} />
              {savingFolder ? "Creating…" : "Create folder"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
