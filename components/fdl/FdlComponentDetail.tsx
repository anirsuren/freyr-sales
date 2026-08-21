"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ViewSelect } from "@/components/ui/ViewSelect";
import { useStoredView } from "@/lib/useStoredView";
import Link from "next/link";
import { SmartBack } from "@/components/ui/BackButton";
import { RoadmapFollowButton } from "@/components/notifications/RoadmapFollowButton";
import { useRouter } from "next/navigation";
import {
  GitBranch,
  GanttChartSquare,
  Rows3,
  ArrowLeft,
  Check,
  CircleCheck,
  Clock,
  Building2,
  CalendarDays,
  ChevronRight,
  Download,
  FileText,
  GitCompareArrows,
  LayoutGrid,
  ListChecks,
  Sparkles,
  Minus,
  Paperclip,
  Pencil,
  Plus,
  Maximize2,
  Rocket,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { DateField } from "@/components/ui/DateField";
import { uploadWithProgress } from "@/lib/uploadWithProgress";
import {
  ColorSelect,
  MultiColorSelect,
  type ColorOption,
} from "@/components/ui/ColorSelect";
import { InfoHint } from "@/components/ui/InfoHint";
import { Tooltip } from "@/components/ui/Tooltip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ScrollHint } from "@/components/ui/ScrollHint";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";
import { downloadDocx } from "@/lib/docx";

/** An imported row whose sheet cell had a date but no version number. */
const MONTH_ONLY = /^[A-Za-z]{3}'\d{2}$/;
import type {
  FdlComponent,
  FdlFeature,
  FdlFeatureAttachment,
  FdlRelease,
} from "@/lib/offerings";
import {
  FdlTypeChip,
  fdlCurrentVersion,
  VersionPill,
  versionTone,
  withV,
} from "@/components/fdl/FdlComponentsBrowser";
import { OfferingIcon, ServiceTag } from "@/components/ui/OfferingIcon";
import { PrioritySearchInput } from "@/components/ui/SearchPriority";
import { CustomerDots } from "@/components/fdl/CustomerDots";
import { VersionTimeline } from "@/components/fdl/VersionTimeline";
import { RoadmapVersionHistory } from "@/components/offerings/RoadmapVersionHistory";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { HoverCard } from "@/components/ui/HoverCard";

/**
 * ONE COMPONENT, THE WHOLE STORY — Suren's model (Aug 8, via Anir): "first
 * you make all the versions and the release dates, then give a list of
 * features… and then for every feature which version is available… they are
 * only mapping features to versions." The comparison and the downloadable
 * sheets fall straight out of that mapping.
 */

const FIELD =
  "w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary outline-none transition-colors focus:border-blue-primary";

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function orderedReleases(component: FdlComponent): FdlRelease[] {
  return [...component.releases].sort((a, b) =>
    (a.date || "9999").localeCompare(b.date || "9999")
  );
}

/**
 * A STACK OF COMPANY LOGOS THAT FANS OPEN ON HOVER.
 *
 * The same mechanic as the campaigns "Going to" row and PersonFan (Anir, Aug 9:
 * "I need the thing where the circles are kinda on top of each other. You did
 * it somewhere else in the app... on campaigns page"). Collapsed they overlap
 * so the column stays narrow; hovering the group slides them apart so every
 * mark is separately reachable, and hovering one names that company.
 *
 * Animated margin rather than a gap, because the collapsed state IS a negative
 * margin: animating it makes the logos slide out from under each other instead
 * of the row snapping to a new layout. Reversed z-index on expand keeps the
 * leftmost mark on top as it travels, which is what reads as a fan.
 */
export type ComponentCustomer = {
  id: string;
  name: string;
  releaseId: string | null;
  nextReleaseId: string | null;
  connected: boolean;
};

export function FdlComponentDetail({
  component,
  homes,
  canEdit,
  customers = [],
  backTo,
  offerings = [],
}: {
  component: FdlComponent;
  homes: { id: string; name: string }[];
  canEdit: boolean;
  customers?: ComponentCustomer[];
  /** Where the reader came from, so back returns there. */
  backTo?: string | null;
  /** Every offering, so this component can be added to one from here. */
  offerings?: { id: string; name: string; connected: boolean }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [addingOffering, setAddingOffering] = useState(false);
  const [readingFeature, setReadingFeature] = useState<FdlFeature | null>(null);
  /** OPEN IT WITHOUT DOWNLOADING IT (Anir, Aug 9: "I should be able to open it
   *  without downloading it"). Images and PDFs render right here; storage
   *  already serves them Content-Disposition: inline, so nothing hits the
   *  downloads folder. A format the browser cannot draw says so plainly
   *  instead of silently starting a download. */
  const [previewing, setPreviewing] = useState<FdlFeatureAttachment | null>(null);
  const [pickedOfferings, setPickedOfferings] = useState<string[]>([]);
  // THE PICKER IS A LIST LIKE ANY OTHER (Anir, Aug 10: "there should be a
  // search bar here. Also, again, I need a way to see either row view or tiles
  // view"). Thirty-one offerings behind a scroll box meant hunting for the one
  // you came to tick. Same two controls every other list in the app carries,
  // and the layout choice is remembered under its own key so it does not
  // disturb the components list behind the modal.
  const [offeringQuery, setOfferingQuery] = useState("");
  // THE VERSIONS AS A LIST OR AS A TIMELINE (Anir, Aug 10). The list answers
  // "what exists", the timeline answers "when" — same records, two questions.
  const [versionsView, setVersionsView, versionsViewReady] = useStoredView<
    "list" | "timeline"
  >("freyr.fdl.versions.view", "list", ["list", "timeline"]);
  /** The timeline's popup: every version as its own collapsible card, the
   *  clicked one arriving open (Anir, Aug 10: "you could probably just have a
   *  pop-up with that dropdown... except it will auto-open to whichever one
   *  I did"). */
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [offeringPickerView, setOfferingPickerView] = useStoredView<
    "tiles" | "rows"
  >("freyr.fdl.offeringPicker.view", "rows", ["tiles", "rows"]);

  /** Add or remove this component on each offering the tick state changed. */
  async function connectOfferings() {
    setBusy(true);
    try {
      const changed = offerings.filter(
        (o) => o.connected !== pickedOfferings.includes(o.id)
      );
      for (const offering of changed) {
        const res = await fetch(`/api/offerings/${offering.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addComponentId: component.id, connected: !offering.connected }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Could not save.");
      }
      toast(
        changed.length === 1 ? "Offering updated." : `${changed.length} offerings updated.`
      );
      setAddingOffering(false);
      router.refresh();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not save.", "error");
    } finally {
      setBusy(false);
    }
  }
  const releases = orderedReleases(component);
  const current = fdlCurrentVersion(component);
  /**
   * WHICH VERSIONS THE FEATURES TABLE SHOWS. Multi-select (Anir, Aug 9:
   * "multiselect"): a feature appears if ANY picked version carries it, so
   * "what is in 1.05 and V2.0.0 together" is one question, not two passes.
   * Nothing picked means no filter, which is what an empty trigger reads as.
   */
  const [shownVersionIds, setShownVersionIds] = useState<string[]>(() => {
    const current = component.releases.find((r) => r.current)?.id;
    return current ? [current] : [];
  });
  const shownReleases = releases.filter((r) => shownVersionIds.includes(r.id));
  const shownFeatures = shownReleases.length
    ? component.features.filter((f) =>
        shownReleases.some((r) => f.versionIds.includes(r.id))
      )
    : component.features;

  /** Narrow the customer list to the versions you care about ("we want to be
   *  able to filter based on which customers have this version"). */
  const [customerVersions, setCustomerVersions] = useState<string[]>([]);

  async function patch(data: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/fdl-components/${component.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Could not save.");
      toast(done);
      router.refresh();
      return true;
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not save.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Which version row is expanded — its features, its customers, its
   *  download (Suren, Aug 8: "if I have to see all one version's features,
   *  how do I download? Here also, for version 4, when it clicks, give those
   *  features for version 4 and then download"). */
  // EACH VERSION OPENS AND CLOSES ON ITS OWN. A single-open accordion snapped
  // the one you were reading shut the moment you opened another, which is
  // exactly what you do not want when comparing two releases (Anir, Aug 9:
  // "why is it closing the other dropdown when I open one?").
  const [openVersions, setOpenVersions] = useState<Set<string>>(new Set());
  const toggleVersion = (id: string) =>
    setOpenVersions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /** Cards or rows for "Customers running this", the same choice the sales
   *  floor offers (Anir, Aug 9: "make it look something like this, like a
   *  team's page, or maybe make it customizable... both these options"). */
  const [customerView, setCustomerView] = useStoredView<"grid" | "table">(
    "freyr.componentCustomers.view",
    "grid",
    ["grid", "table"]
  );

  const [addingCustomers, setAddingCustomers] = useState(false);
  const [pickedCustomers, setPickedCustomers] = useState<string[]>([]);
  /**
   * WHICH VERSION THE NEW CUSTOMER LANDS ON. It used to be hard-wired to the
   * current release, so adding someone while reading V1.04 filed them under
   * V1.05 with no way to say otherwise (Suren, Aug 9: "it put me in 1.05... I
   * need to add to 1.04. It's not doing that"). Opening the dialog from a
   * version row pre-picks that version; the header button starts on current.
   */
  const [addingRelease, setAddingRelease] = useState<string>("");
  function openAddCustomers(releaseId?: string) {
    setPickedCustomers([]);
    setAddingRelease(
      releaseId ??
        component.releases.find((release) => release.current)?.id ??
        component.releases[component.releases.length - 1]?.id ??
        ""
    );
    setAddingCustomers(true);
  }

  /**
   * A VERSION PICKER THAT SURVIVES A LONG HISTORY. As pills, a component with
   * a dozen releases wrapped into three rows and pushed the real content off
   * the screen (Anir, Aug 9: "this isn't going to look good. There are a lot
   * of versions"). A dropdown is one line whatever the count, and it is the
   * control the rest of the app already uses for a single choice.
   */
  const versionOptions: ColorOption[] = releases.map((release) => ({
    value: release.id,
    label: release.current ? `${withV(release.version)} (current)` : withV(release.version),
    color: release.status === "released" ? "#1A7A35" : "#6D28D9",
    icon: release.status === "released" ? CircleCheck : Clock,
  }));

  const connected = customers.filter((customer) => customer.connected);
  const unconnected = customers.filter((customer) => !customer.connected);
  /** The customer list after the version filter. Empty filter means all. */
  const shownCustomers = customerVersions.length
    ? connected.filter(
        (c) => c.releaseId && customerVersions.includes(c.releaseId)
      )
    : connected;
  function customersOnVersion(releaseId: string) {
    return connected.filter((customer) => customer.releaseId === releaseId);
  }

  /** Connect customers straight from the component — the same record the
   *  customer page writes, reached from this side (Suren: "if I want to add a
   *  customer, I want to add a customer from the component also"). */
  async function connectCustomers() {
    if (!pickedCustomers.length) return;
    setBusy(true);
    try {
      for (const customerId of pickedCustomers) {
        const existing = customers.find((item) => item.id === customerId);
        const res = await fetch(`/api/customers/${customerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            digital_components: [
              ...(existing?.connected ? [] : []),
              { component_id: component.id, release_id: addingRelease || null },
            ],
            addDigitalComponent: true,
          }),
        });
        if (!res.ok) throw new Error("Could not connect that customer.");
      }
      toast(
        pickedCustomers.length === 1
          ? "Customer connected."
          : `${pickedCustomers.length} customers connected.`
      );
      setAddingCustomers(false);
      setPickedCustomers([]);
      router.refresh();
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Could not connect that.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  // ---- rename ------------------------------------------------------------
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(component.name);

  // ---- add version -------------------------------------------------------
  const [addingVersion, setAddingVersion] = useState(false);
  const [version, setVersion] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"released" | "next">("released");
  const [makeCurrent, setMakeCurrent] = useState(true);
  const normalizedVersion = version.trim();
  const duplicateVersion = component.releases.some(
    (r) => r.version.toLowerCase() === normalizedVersion.toLowerCase()
  );
  const canAddVersion = !!normalizedVersion && !duplicateVersion;

  async function addVersion() {
    if (!canAddVersion) return;
    const release: FdlRelease = {
      id: `rel-${Math.random().toString(36).slice(2, 9)}`,
      version: normalizedVersion,
      date: date || undefined,
      status,
      current: status === "released" && makeCurrent,
    };
    const next = [...component.releases, release];
    if (release.current) for (const r of next) if (r !== release) r.current = false;
    if (await patch({ releases: next }, `${normalizedVersion} added.`)) {
      setAddingVersion(false);
      setVersion("");
      setDate("");
    }
  }

  /** Flip a version between Released and Expected. */
  async function setReleaseStatus(id: string, status: "released" | "next") {
    await patch(
      {
        releases: component.releases.map((r) =>
          r.id === id
            ? { ...r, status, current: status === "next" ? false : r.current }
            : r
        ),
      },
      status === "released" ? "Marked as released." : "Moved back to expected."
    );
  }

  async function markCurrent(id: string) {
    const next = component.releases.map((r) => ({ ...r, current: r.id === id }));
    await patch({ releases: next }, "Current version updated.");
  }

  /**
   * SET (OR CHANGE) A VERSION'S DATE, WHEREVER YOU ARE.
   *
   * The timeline told you to "click it to set a date" and the click opened
   * this panel, where the date was a grey chip you could not do anything with
   * — the field only ever existed on the Add-version form (Anir, Aug 15: "it
   * says 'Click to set a date'. I click it, and then where do I set a date?
   * That's the problem there... the user gets confused"). So the promise was
   * one the app could not keep for any version that already existed.
   */
  async function setReleaseDate(id: string, date: string, reason?: string) {
    return patch(
      {
        releases: component.releases.map((r) =>
          r.id === id ? { ...r, date: date || null } : r
        ),
        changeReason: reason,
      },
      date ? "Date set." : "Date cleared."
    );
  }

  /**
   * EVERY PAST MOVE OF ONE VERSION'S DATE, newest first — what the date
   * dialog shows underneath the calendar (Anir, Aug 21: "when I click on the
   * date it should bring up a pop-up, and then maybe you show it there as
   * well").
   *
   * The stored change lines already name their version, so this reads the
   * history the app already keeps rather than storing the same fact twice. A
   * version minted before reasons existed simply has none to show.
   */
  function dateHistory(version: string) {
    const label = withV(version).toLowerCase();
    const out: { at: string; by: string; line: string; reason?: string }[] = [];
    for (const v of component.roadmap_versions ?? []) {
      for (const line of v.changes) {
        const low = line.toLowerCase();
        if (!low.startsWith(label)) continue;
        if (!/moved from|dated |lost its date/.test(low)) continue;
        out.push({ at: v.savedAt, by: v.savedBy, line, reason: v.reason });
      }
    }
    return out;
  }

  const [confirmReleaseDelete, setConfirmReleaseDelete] = useState<string | null>(null);
  async function removeRelease(id: string) {
    setConfirmReleaseDelete(null);
    await patch(
      { releases: component.releases.filter((r) => r.id !== id) },
      "Version removed."
    );
  }

  // ---- features ----------------------------------------------------------
  /** null = closed; "" = adding; otherwise the feature id being edited. */
  const [featureModal, setFeatureModal] = useState<string | null>(null);
  /** The timeline's fit-everything call, held for the header button. */
  const fitTimeline = useRef<(() => void) | null>(null);
  const [featName, setFeatName] = useState("");
  const [featFid, setFeatFid] = useState("");
  const [featDesc, setFeatDesc] = useState("");
  const [featVersions, setFeatVersions] = useState<string[]>([]);
  const [featFiles, setFeatFiles] = useState<FdlFeatureAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  /** Distinct ids even when the same file is picked twice. */
  const uploadSeq = useRef(0);
  /**
   * ONE ROW PER FILE, WITH A REAL PERCENTAGE (Anir, Aug 15: "when I upload an
   * image, first of all, it doesn't look like it's working... it has to show
   * the progress bar... no matter if it's a document or an image").
   *
   * The old label said "Uploading…" and nothing else, which on a large file is
   * indistinguishable from a frozen form. Rows survive a moment after they
   * finish so you can see that they did, and a failed one keeps its reason.
   */
  const [uploads, setUploads] = useState<
    {
      id: string;
      name: string;
      percent: number;
      status: "uploading" | "done" | "error";
      error?: string;
    }[]
  >([]);

  /** Upload one file, keeping its row's percentage live. */
  async function sendOneFile(file: File): Promise<FdlFeatureAttachment> {
    const id = `${file.name}-${file.size}-${uploadSeq.current++}`;
    setUploads((prev) => [
      ...prev,
      { id, name: file.name, percent: 0, status: "uploading" },
    ]);
    try {
      const payload = await uploadWithProgress<{
        attachment: FdlFeatureAttachment;
      }>(`/api/fdl-components/${component.id}/upload`, file, (percent) =>
        setUploads((prev) =>
          prev.map((u) => (u.id === id ? { ...u, percent } : u))
        )
      );
      setUploads((prev) =>
        prev.map((u) =>
          u.id === id ? { ...u, percent: 100, status: "done" } : u
        )
      );
      // Finished rows clear themselves; the attachment below is the receipt.
      window.setTimeout(
        () => setUploads((prev) => prev.filter((u) => u.id !== id)),
        1400
      );
      return payload.attachment;
    } catch (caught) {
      setUploads((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                status: "error",
                error:
                  caught instanceof Error
                    ? caught.message
                    : "Could not upload that file.",
              }
            : u
        )
      );
      throw caught;
    }
  }
  /** The release whose Files panel opened the picker, if any. */
  const [filesForRelease, setFilesForRelease] = useState<string | null>(null);
  const [confirmFeatureDelete, setConfirmFeatureDelete] = useState<string | null>(null);
  /** Feature rows open like a dropdown IN the table (Anir, Aug 17: "you can
   *  probably do a drop-down here… you could definitely do the pop-up still.
   *  I'm just saying I want a dropdown"). Row click expands; the name still
   *  opens the reading popup. */
  const [expandedFeatureId, setExpandedFeatureId] = useState<string | null>(null);

  /** Send the picked files to storage, then hold the returned URLs on the
   *  form until Save writes them onto the feature. */
  async function attachFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 5)) {
        const attachment = await sendOneFile(file);
        setFeatFiles((prev) => [...prev, attachment]);
      }
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Could not upload that file.",
        "error"
      );
    } finally {
      setUploading(false);
    }
  }

  /**
   * ADD A FILE FROM THE VERSION PANEL (Anir, Aug 9: "if I can add customers, I
   * should be able to add files here too"). Files belong to features, not to
   * releases, so this uploads and then pins the result to a feature that the
   * version actually carries. With one feature there is nothing to ask; with
   * several the panel asks which, because guessing would file a spec under the
   * wrong feature and nothing in the UI would ever show that it was wrong.
   */
  async function attachToFeature(featureId: string, files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const added: FdlFeatureAttachment[] = [];
      for (const file of Array.from(files).slice(0, 5)) {
        added.push(await sendOneFile(file));
      }
      const next = component.features.map((f) =>
        f.id === featureId
          ? { ...f, attachments: [...(f.attachments ?? []), ...added] }
          : f
      );
      await patch({ features: next }, added.length === 1 ? "File added." : "Files added.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Could not upload that file.",
        "error"
      );
    } finally {
      setUploading(false);
      setFilesForRelease(null);
    }
  }

  function openFeatureModal(feature?: FdlFeature) {
    setFeatureModal(feature ? feature.id : "");
    setFeatName(feature?.name ?? "");
    setFeatFid(feature?.fid ?? "");
    setFeatDesc(feature?.description ?? "");
    // A NEW FEATURE PICKS ITS OWN VERSIONS (Anir, Aug 9: "they have to actually
    // choose which versions, it shouldn't be automatically choosing all of
    // them"). Pre-ticking every release meant the default answer was "it has
    // always been in everything", which is almost never true and silently
    // became the record. Editing still opens on whatever the feature has.
    setFeatVersions(feature?.versionIds ?? []);
    setFeatFiles(feature?.attachments ?? []);
  }

  /** The next free F-00n for this component. Sequential, never reused. */
  function nextFeatureId(): string {
    const taken = new Set(
      component.features.map((f) => (f.fid || "").toUpperCase())
    );
    for (let n = 1; n < 10000; n += 1) {
      const candidate = `F-${String(n).padStart(3, "0")}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `F-${Date.now()}`;
  }

  async function saveFeature() {
    if (!featName.trim() || featVersions.length === 0) return;
    const record: FdlFeature = {
      id: featureModal || `feat-${Math.random().toString(36).slice(2, 9)}`,
      fid: featFid.trim() || nextFeatureId(),
      name: featName.trim(),
      description: featDesc.trim() || undefined,
      versionIds: featVersions,
      attachments: featFiles.length ? featFiles : undefined,
    };
    const next =
      featureModal === ""
        ? [...component.features, record]
        : component.features.map((f) => (f.id === featureModal ? record : f));
    if (await patch({ features: next }, featureModal === "" ? "Feature added." : "Feature saved."))
      setFeatureModal(null);
  }

  async function removeFeature(id: string) {
    setConfirmFeatureDelete(null);
    await patch(
      { features: component.features.filter((f) => f.id !== id) },
      "Feature removed."
    );
  }

  // ---- compare -----------------------------------------------------------
  // ARRIVE ON A FILLED TABLE, not on an instruction. An empty card with a row
  // of grey pills gave no clue that they were the control (Anir, Aug 9: "it's
  // kind of unclear what I'm supposed to do"). The two newest versions are the
  // comparison anyone wants first, so it starts there and the pills read as
  // what they are: a selection you can change.
  /** REMEMBERED PER PERSON, PER COMPONENT (Anir, Aug 17: "it should save for
   *  each individual user whatever I was on last… not some kind of hive mind
   *  thing"). localStorage is this browser's own, so one person's pick can
   *  never repaint another's screen — same storage every sticky view choice
   *  in the app already uses. Stored ids are checked against the versions
   *  that still exist; when none survive, the newest two are the default. */
  const compareKey = `freyr.fdl.compare.${component.id}`;
  const [compareIds, setCompareIdsRaw] = useState<string[]>(() =>
    releases.slice(-2).map((r) => r.id)
  );
  useEffect(() => {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(compareKey) || "[]"
      ) as string[];
      const alive = saved.filter((id) => releases.some((r) => r.id === id));
      if (alive.length >= 2) setCompareIdsRaw(alive);
    } catch {
      /* first visit, or unreadable — the default stands */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareKey]);
  const setCompareIds = (next: string[] | ((prev: string[]) => string[])) =>
    setCompareIdsRaw((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      try {
        window.localStorage.setItem(compareKey, JSON.stringify(value));
      } catch {
        /* private mode — it just won't stick */
      }
      return value;
    });
  const compareReleases = releases.filter((r) => compareIds.includes(r.id));
  const compareRows = useMemo(
    () =>
      component.features.filter((f) =>
        compareReleases.some((r) => f.versionIds.includes(r.id))
      ),
    [component.features, compareReleases]
  );

  function downloadVersionSheet(release: FdlRelease) {
    const rows = component.features.filter((f) => f.versionIds.includes(release.id));
    downloadDocx(
      `${slug(component.name)}-${slug(release.version)}-features.docx`,
      `${component.name} ${withV(release.version)}: features`,
      `${component.type} · ${
        release.date ? formatDate(release.date) : "date not set"
      } · ${rows.length} ${rows.length === 1 ? "feature" : "features"}`,
      {
        headers: ["ID", "Feature and what it does"],
        rows: rows.map((f) => ({
          cells: [f.fid ?? "", f.name],
          note: f.description ?? undefined,
          noteAt: 1,
        })),
      }
    );
  }

  function downloadComparison() {
    downloadDocx(
      `${slug(component.name)}-comparison.docx`,
      `${component.name}: version comparison`,
      `${component.type} · ${compareReleases.map((r) => r.version).join(" vs ")}`,
      {
        headers: ["Feature", ...compareReleases.map((r) => r.version)],
        rows: compareRows.map((f) => ({
          cells: [
            f.name,
            ...compareReleases.map((r) =>
              f.versionIds.includes(r.id) ? "Yes" : "No"
            ),
          ],
          note: f.description ?? undefined,
        })),
      }
    );
  }

  const CARD =
  "rise-in rounded-xl border border-border-light bg-white p-5 shadow-card";


  /** ONE VERSION'S FULL CARD — header, features, files, customers,
   *  actions. Shared by the list view and the timeline's popup, which is
   *  what keeps "whatever was there in the dropdown" honest in both. */
  const releaseCard = (release: (typeof releases)[number]) => {
              const releaseIndex = releases.findIndex(
                (x) => x.id === release.id
              );
              const versionFeatures = component.features.filter((feature) =>
                feature.versionIds.includes(release.id)
              );
              // What this version adds over the one before it. The count on
              // its own answers "how much is in it"; the delta answers the
              // question a seller is actually asked, "why upgrade".
              const previous = releases[releaseIndex - 1];
              const addedHere = previous
                ? versionFeatures.filter(
                    (feature) => !feature.versionIds.includes(previous.id)
                  )
                : versionFeatures;
              const versionCustomers = customersOnVersion(release.id);
              // Accounts sitting on a version OLDER than this one. Unlike
              // "nothing new" this is a number that changes and that a seller
              // can do something about.
              const versionAttachments = versionFeatures.flatMap((feature) =>
                (feature.attachments ?? []).map((file) => ({
                  file,
                  feature: feature.name,
                }))
              );
              const behindCount = connected.filter((customer) => {
                const theirIndex = releases.findIndex(
                  (r) => r.id === customer.releaseId
                );
                return theirIndex > -1 && theirIndex < releaseIndex;
              }).length;
              const open = openVersions.has(release.id);
              const shipped = release.status === "released";
              const accent = shipped ? "#1A7A35" : "#6D28D9";
              return (
                <div
                  key={release.id}
                  /* THE CURRENT VERSION IS THE ROW, NOT A BADGE ON IT (Anir,
                     Aug 9: "which version is making it more clear which one's
                     the current version? ... there's so much stuff now that
                     even the tag that says Current doesn't even show up
                     properly"). One blue pill among a date chip, a feature
                     chip, five logos, a bar and a sentence is a needle in its
                     own haystack. A tinted face and a blue ring make the whole
                     row the answer, readable before a single word is. */
                  className={`entry-card relative overflow-hidden pl-[3px] transition-shadow ${
                    open ? "shadow-[0_6px_20px_rgba(16,24,40,0.08)]" : ""
                  } ${
                    release.current
                      ? "border-blue-primary ring-1 ring-blue-primary"
                      : ""
                  }`}
                  /* Inline, because .entry-card sets its own background and a
                     utility class loses that fight. */
                  style={
                    release.current
                      ? {
                          background: "rgba(232,241,251,0.55)",
                          borderColor: "#0071E3",
                        }
                      : undefined
                  }
                >
                  {/* The rail says released-or-planned before a word is read. */}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 ${
                      release.current ? "w-[6px]" : "w-[3px]"
                    }`}
                    style={{ background: release.current ? "#0071E3" : accent }}
                  />
                  <div
                    className="flex cursor-pointer items-center gap-3 px-3.5 py-3"
                    // THE WHOLE RECTANGLE TOGGLES (Anir, Aug 17: "I should be
                    // able to click on the whole rectangle... not just the
                    // left side") — but NOT as one big <button>: that version
                    // swallowed the date <input> nested inside it (Aug 15).
                    // The handler sits on the DIV and steps aside for any
                    // click that began on a real control, so Mark expected,
                    // the date chip, download and delete all keep themselves.
                    onClick={(e) => {
                      const el = e.target as HTMLElement;
                      if (el.closest("button, input, a, select, label")) return;
                      toggleVersion(release.id);
                    }}
                  >
                    {/* THE WHOLE ROW OPENS THE VERSION — what is in it and who
                        is on it, with its own download (Suren, Aug 8: "for
                        version 4, when it clicks, give those features for
                        version 4 and then download"). */}
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleVersion(release.id)}
                        aria-expanded={open}
                        aria-label={`${open ? "Hide" : "Show"} what is in ${withV(release.version)}`}
                        className="flex shrink-0 cursor-pointer items-center"
                      >
                        <ChevronRight
                          size={15}
                          strokeWidth={2.2}
                          className={`shrink-0 text-text-tertiary transition-transform ${
                            open ? "rotate-90 text-blue-primary" : ""
                          }`}
                        />
                      </button>
                      <span className="min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleVersion(release.id)}
                          tabIndex={-1}
                          className="flex cursor-pointer flex-wrap items-center gap-2 text-left"
                        >
                          <span className="text-[16px] font-semibold leading-tight tracking-[-0.01em] text-text-primary">
                            {MONTH_ONLY.test(release.version)
                              ? "No version number recorded"
                              : withV(release.version)}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{
                              color: accent,
                              background: `${accent}14`,
                              border: `1px solid ${accent}40`,
                            }}
                          >
                            {shipped ? (
                              <CircleCheck size={11} strokeWidth={2.2} />
                            ) : (
                              <Clock size={11} strokeWidth={2.2} />
                            )}
                            {shipped ? "Released" : "Expected"}
                          </span>
                          {release.current && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-primary px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.04em] text-white shadow-[0_2px_8px_rgba(0,113,227,0.35)]">
                              <Check size={12} strokeWidth={3.2} /> Current version
                            </span>
                          )}
                        </button>
                        {/* Facts as chips, not a run-on grey sentence. */}
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {/* The chip IS the date picker when you may edit. */}
                          {canEdit ? (
                            <ReleaseDateChip
                              label={
                                release.date
                                  ? formatDate(release.date)
                                  : "Set a date"
                              }
                              value={release.date ?? ""}
                              hasDate={Boolean(release.date)}
                              versionLabel={withV(release.version)}
                              disabled={busy}
                              history={dateHistory(release.version)}
                              onSave={(next, reason) =>
                                setReleaseDate(release.id, next, reason)
                              }
                            />
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[11.5px] text-text-secondary tnum">
                              <CalendarDays size={11} strokeWidth={2} className="text-text-tertiary" />
                              {release.date ? formatDate(release.date) : "Date not set"}
                            </span>
                          )}
                          {/* The count alone made you scroll to the features
                              table and re-filter to answer "which two?"
                              (Anir, Aug 9: "I need hover over the 2 features
                              thing"). Hovering names them right here. */}
                          <HoverCard
                            width={280}
                            anchor="trigger"
                            content={
                              <div>
                                <p className="text-[12px] font-semibold text-text-primary">
                                  In {withV(release.version)}
                                </p>
                                {versionFeatures.length === 0 ? (
                                  <p className="mt-1 text-[11.5px] text-text-secondary">
                                    No feature is marked as part of this version yet.
                                  </p>
                                ) : (
                                  <ul className="mt-1.5 space-y-1">
                                    {versionFeatures.slice(0, 8).map((feature) => (
                                      <li key={feature.id} className="flex gap-1.5">
                                        <Check
                                          size={11}
                                          strokeWidth={2.6}
                                          className="mt-[3px] shrink-0 text-blue-primary"
                                        />
                                        <span className="min-w-0">
                                          <span className="block text-[12px] font-medium text-text-primary">
                                            {feature.name}
                                          </span>
                                          {feature.description && (
                                            <span className="block text-[11px] leading-snug text-text-secondary">
                                              {feature.description.length > 90
                                                ? `${feature.description.slice(0, 90)}…`
                                                : feature.description}
                                            </span>
                                          )}
                                        </span>
                                      </li>
                                    ))}
                                    {versionFeatures.length > 8 && (
                                      <li className="text-[11.5px] text-text-secondary">
                                        and {versionFeatures.length - 8} more
                                      </li>
                                    )}
                                  </ul>
                                )}
                              </div>
                            }
                          >
                            <span className="inline-flex cursor-default items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[11.5px] text-text-secondary transition-colors duration-150 hover:bg-blue-light hover:text-blue-primary tnum">
                              <ListChecks size={11} strokeWidth={2} className="text-text-tertiary" />
                              {versionFeatures.length}{" "}
                              {versionFeatures.length === 1 ? "feature" : "features"}
                            </span>
                          </HoverCard>
                        </span>
                      </span>
                      {/* THE LOGOS MOVE UP AND GROW (Anir, Aug 9: "the company
                          logos, move it so that it's bigger and it's in line
                          instead of on the bottom"). Tucked among the date and
                          feature chips they read as one more chip; on the main
                          line at 34px they read as the accounts they are. Five
                          then +N, so the row's length never depends on how many
                          customers a version happens to have. */}
                      {/* THE COUNT UNDER THE FACES (Anir, Aug 9: "underneath
                          the circles for the logos, you can say five customers
                          or ten customers or whatever"). Five marks and a +N
                          make you do arithmetic to answer "how many"; the line
                          underneath just says it. */}
                      <span className="ml-4 hidden shrink-0 flex-col items-start lg:flex">
                        <CustomerDots
                          people={versionCustomers}
                          max={5}
                          size={34}
                          note={() => `On ${withV(release.version)}`}
                        />
                        <span className="mt-0.5 pl-1 text-[10.5px] font-medium text-text-tertiary tnum">
                          {versionCustomers.length}{" "}
                          {versionCustomers.length === 1 ? "customer" : "customers"}
                        </span>
                      </span>
                      {/* THE BAR IS A FIXED 72px, NOT A STRETCH (Anir, Aug 9:
                          "it's just too big, each one should be a set amount
                          and it doesn't need to be that long, you can easily
                          fit something else"). A share only needs enough width
                          to be compared against the row above it, and a
                          full-width rule read as the most important thing on
                          the row. The reclaimed space carries what actually
                          changed in this version. */}
                      {/* THE BAR TAKES THE ROW (Anir, Aug 9: "remove that, I
                          don't need that text, just make the progress bar take
                          up a little bit more space and align it to the left,
                          not the right. It's okay if there's a gap between the
                          numbers and the download button"). The sentence about
                          what changed was a paragraph competing with a number,
                          and pinning the bar right meant its length told you
                          nothing until you found its end. */}
                      <span className="ml-5 hidden min-w-0 flex-1 items-center lg:flex">
                        {/* THE BAR RIDES WITH THE VERSION (Anir, Aug 9: "the
                            progress bar should go right after"). Pinned to the
                            far edge it belonged to nothing you were reading. */}

                        {/* THE BAR MOVES RIGHT AND EXPLAINS ITSELF (Anir, Aug 9:
                            "you're gonna move the progress bar to the right"
                            and "when I hover over this bar, I probably should
                            see something like which three out of the seven...
                            think like a mega-detailed version"). A stub reading
                            "3 of 7" gave the count and withheld the only part a
                            seller can act on, which is WHO. */}
                        {connected.length > 0 && (
                          <HoverCard
                            width={360}
                            anchor="trigger"
                            delayMs={0}
                            content={
                              <div>
                                <p className="text-[12.5px] font-semibold text-text-primary">
                                  {versionCustomers.length} of {connected.length} on{" "}
                                  {withV(release.version)}
                                </p>
                                <span className="mt-2 flex h-3 overflow-hidden rounded-full bg-surface">
                                  <span
                                    className="block h-full"
                                    style={{
                                      width: `${Math.round(
                                        (versionCustomers.length / connected.length) *
                                          100
                                      )}%`,
                                      background: accent,
                                    }}
                                  />
                                </span>
                                <p className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                  On this version
                                </p>
                                {versionCustomers.length === 0 ? (
                                  <p className="mt-1 text-[11.5px] text-text-secondary">
                                    Nobody yet.
                                  </p>
                                ) : (
                                  <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                                    {versionCustomers.map((customer) => (
                                      <li
                                        key={customer.id}
                                        className="flex items-center gap-1.5"
                                      >
                                        <CompanyLogo
                                          name={customer.name}
                                          className="h-4 w-4 shrink-0 object-contain"
                                        />
                                        <span className="truncate text-[11.5px] text-text-primary">
                                          {customer.name}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {connected.length - versionCustomers.length > 0 && (
                                  <div className="mt-2.5 border-t border-border-light pt-2">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                      On something else
                                    </p>
                                    <ul className="mt-1 space-y-1">
                                      {connected
                                        .filter((c) => c.releaseId !== release.id)
                                        .slice(0, 6)
                                        .map((customer) => {
                                          const theirs = releases.find(
                                            (r) => r.id === customer.releaseId
                                          );
                                          return (
                                            <li
                                              key={customer.id}
                                              className="flex items-center gap-1.5 text-[11.5px]"
                                            >
                                              <CompanyLogo
                                                name={customer.name}
                                                className="h-4 w-4 shrink-0 object-contain"
                                              />
                                              <span className="truncate text-text-primary">
                                                {customer.name}
                                              </span>
                                              <span className="ml-auto shrink-0 text-text-tertiary tnum">
                                                {theirs ? theirs.version : "No version"}
                                              </span>
                                            </li>
                                          );
                                        })}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            }
                          >
                            <span className="flex shrink-0 cursor-pointer items-center gap-2">
                              {/* bg-border, not bg-surface: the pale track was
                                  invisible against the card so the bar had no
                                  readable "out of" (Anir, Aug 9: "it's hard to
                                  see the grey part of the progress bar, it's
                                  too light"). */}
                              <span className="h-2 w-[180px] overflow-hidden rounded-full bg-border">
                                <span
                                  className="block h-full rounded-full transition-[width] duration-500"
                                  style={{
                                    width: `${Math.round(
                                      (versionCustomers.length / connected.length) * 100
                                    )}%`,
                                    background: accent,
                                  }}
                                />
                              </span>
                              <span className="whitespace-nowrap text-[11px] font-semibold text-text-secondary tnum">
                                {versionCustomers.length} of {connected.length} on this
                              </span>
                            </span>
                          </HoverCard>
                        )}
                      </span>
                    </div>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      {/* SAYING A VERSION HAS SHIPPED (Anir, Aug 9: "if I want
                          to say that this is the version that's current or
                          released, how do I do that? ... there should be an
                          edit button or something"). Mark current only ever
                          appeared on an already-released version, so a version
                          still marked Expected had no way to become either. */}
                      {/* EACH BUTTON WEARS THE STATUS IT PRODUCES (Anir,
                          Aug 15: "can we have icons for these... maybe colors
                          too, I think you already have some colors associated
                          with it"). We did: Released is the green #1A7A35,
                          Expected the purple #6D28D9 and Current the brand
                          blue, on the pills two lines up. Three identical grey
                          buttons made you read the words to tell them apart. */}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => void setReleaseStatus(release.id, shipped ? "next" : "released")}
                          disabled={busy}
                          title={
                            shipped
                              ? "Move this back to Expected"
                              : "Mark this version as Released"
                          }
                          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
                          style={{
                            color: shipped ? "#6D28D9" : "#1A7A35",
                            borderColor: `${shipped ? "#6D28D9" : "#1A7A35"}40`,
                            background: `${shipped ? "#6D28D9" : "#1A7A35"}0D`,
                          }}
                        >
                          {shipped ? (
                            <Clock size={11} strokeWidth={2.4} />
                          ) : (
                            <CircleCheck size={11} strokeWidth={2.4} />
                          )}
                          {shipped ? "Mark expected" : "Mark released"}
                        </button>
                      )}
                      {!release.current && canEdit && shipped && (
                        <button
                          type="button"
                          onClick={() => void markCurrent(release.id)}
                          disabled={busy}
                          title="Make this the version customers are on today"
                          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border border-[color:rgba(0,113,227,0.25)] bg-[rgba(0,113,227,0.05)] px-2 py-1 text-[11px] font-semibold text-blue-primary transition-colors hover:bg-blue-light disabled:opacity-50"
                        >
                          <Check size={11} strokeWidth={3} />
                          Mark current
                        </button>
                      )}
                      <button
                        type="button"
                        title={`Download the ${withV(release.version)} feature sheet`}
                        aria-label={`Download the ${withV(release.version)} feature sheet`}
                        onClick={() => downloadVersionSheet(release)}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                      >
                        <Download size={14} strokeWidth={2} />
                      </button>
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            aria-label={`Remove ${withV(release.version)}`}
                            onClick={() => setConfirmReleaseDelete(release.id)}
                            className="text-[color:#DC2626] flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-error transition-colors hover:bg-error/10"
                          >
                            <Trash2 size={14} strokeWidth={2} />
                          </button>
                          <ConfirmDialog
                            open={confirmReleaseDelete === release.id}
                            onClose={() => setConfirmReleaseDelete(null)}
                            onConfirm={() => {
                              setConfirmReleaseDelete(null);
                              void removeRelease(release.id);
                            }}
                            title="Remove this version?"
                            body={`${withV(release.version)} and its feature list come off this component.`}
                            confirmLabel="Remove version"
                          />
                        </>
                      )}
                    </span>
                  </div>

                  {open && (
                    <div className="menu-in border-t border-border-light bg-surface/50 px-3.5 py-3.5">
                      {/* THREE PANELS, EQUAL HEIGHT (Anir, Aug 9: "there's a
                          lot of empty space here, like above features and then
                          below features... if there's an image or something, it
                          should show up for each version"). Two panels left a
                          short list stranded beside a tall one; a third column
                          takes the width AND answers the question the panel
                          could not: what is actually attached to this release. */}
                      <div className="grid items-stretch gap-3 md:grid-cols-3">
                        <div className="flex flex-col rounded-xl border border-border-light bg-white p-3.5">
                          <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            <ListChecks size={12} strokeWidth={2.2} className="text-blue-primary" />
                            What is in{" "}
                            <VersionPill
                              version={release.version}
                              status={release.status}
                              current={release.current}
                            />
                            <span className="ml-auto font-bold tnum">
                              {versionFeatures.length}
                            </span>
                          </p>
                          {versionFeatures.length === 0 ? (
                            <p className="text-[12.5px] text-text-secondary">
                              No features are ticked for this version yet.
                            </p>
                          ) : (
                            <ScrollHint className="max-h-[220px] pr-1">
                            <ul className="space-y-1.5">
                              {versionFeatures.map((feature) => (
                                <li
                                  key={feature.id}
                                  className="flex items-start gap-2 text-[12.5px] leading-snug text-text-secondary"
                                >
                                  <Check
                                    size={12}
                                    strokeWidth={2.6}
                                    className="mt-[3px] shrink-0 text-[color:#1A7A35]"
                                  />
                                  <span>
                                    {feature.fid && (
                                      <span className="mr-1 font-semibold text-text-primary tnum">
                                        {feature.fid}
                                      </span>
                                    )}
                                    {feature.name}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            </ScrollHint>
                          )}
                        </div>
                        <div className="flex flex-col rounded-xl border border-border-light bg-white p-3.5">
                          <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            <Building2 size={12} strokeWidth={2.2} className="text-blue-primary" />
                            Customers on{" "}
                            <VersionPill
                              version={release.version}
                              status={release.status}
                              current={release.current}
                            />
                            <span className="ml-auto font-bold tnum">
                              {versionCustomers.length}
                            </span>
                            {/* THE PLUS SITS WITH THE HEADING (Anir, Aug 9:
                                "the add customer thing should be at the top
                                right, it should just be a blue plus, simple").
                                A full-width dashed button under the list read
                                as another row in it. */}
                            {canEdit && unconnected.length > 0 && (
                              <button
                                type="button"
                                onClick={() => openAddCustomers(release.id)}
                                title={`Add a customer on ${withV(release.version)}`}
                                aria-label={`Add a customer on ${withV(release.version)}`}
                                className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md bg-blue-primary text-white transition-transform hover:scale-105 active:scale-95"
                              >
                                <Plus size={13} strokeWidth={2.6} />
                              </button>
                            )}
                          </p>
                          {versionCustomers.length === 0 ? (
                            <p className="text-[12.5px] text-text-secondary">
                              Nobody is recorded on this version yet.
                            </p>
                          ) : (
                            <ScrollHint className="max-h-[240px] pr-1">
                            <ul className="space-y-1">
                              {versionCustomers.map((customer) => {
                                // THREE MORE FACTS PER ROW (Anir, Aug 9: "give
                                // me three other data points on that row to take
                                // up some space, it's okay to make the row
                                // thicker"). A logo and a name alone made the
                                // panel a list of links; these say where the
                                // account actually stands on this component.
                                const theirNext = releases.find(
                                  (r) => r.id === customer.nextReleaseId
                                );
                                const newest = releases[releases.length - 1];
                                const isLatest = newest?.id === release.id;
                                return (
                                  <li key={customer.id}>
                                    <Link
                                      href={`/customers/${customer.id}?tab=components`}
                                      className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-blue-light"
                                    >
                                      <CompanyLogo
                                        name={customer.name}
                                        className="h-6 w-6 shrink-0"
                                      />
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[12.5px] font-semibold text-text-primary">
                                          {customer.name}
                                        </span>
                                        <span className="flex flex-wrap items-center gap-x-1.5 text-[10.5px] text-text-tertiary">
                                          <span className="whitespace-nowrap">
                                            On{" "}
                                            <VersionPill
                                              version={release.version}
                                              status={release.status}
                                              current={release.current}
                                              className="px-1.5 py-0 text-[10px]"
                                            />
                                          </span>
                                          <span aria-hidden="true">·</span>
                                          <span className="whitespace-nowrap">
                                            {theirNext
                                              ? `Moving to ${withV(theirNext.version)}`
                                              : "No move planned"}
                                          </span>
                                        </span>
                                      </span>
                                      <span
                                        className="shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.03em]"
                                        style={
                                          isLatest
                                            ? {
                                                color: "#1A7A35",
                                                background: "rgba(26,122,53,0.1)",
                                              }
                                            : {
                                                color: "#B4318F",
                                                background: "rgba(180,49,143,0.1)",
                                              }
                                        }
                                      >
                                        {isLatest ? "Newest" : "Behind"}
                                      </span>
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                            </ScrollHint>
                          )}
                        </div>
                        {/* WHAT IS ATTACHED TO THIS RELEASE. Files live on
                            features, so a version's paperwork is the union of
                            the files on the features it carries. */}
                        <div className="flex flex-col rounded-xl border border-border-light bg-white p-3.5">
                          <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            <Paperclip size={12} strokeWidth={2.2} className="text-blue-primary" />
                            Files in{" "}
                            <VersionPill
                              version={release.version}
                              status={release.status}
                              current={release.current}
                            />
                            <span className="ml-auto font-bold tnum">
                              {versionAttachments.length}
                            </span>
                            {/* Same blue plus as Add customer beside it, so on
                                this panel a plus always means add. */}
                            {/* THE BUTTON IS ALWAYS THERE, AND SAYS WHY WHEN IT
                                CANNOT WORK (Anir, Aug 9: "you have to clearly
                                say why you're not letting me have a file here...
                                show the button, grey it out if you need to, and
                                then when I hover over it, it'll tell me why").
                                Hiding it made a missing capability look like a
                                missing feature. */}
                            {canEdit && (
                              <Tooltip
                                label={
                                  versionFeatures.length === 0
                                    ? "Add a feature to this version first. Files pin to a feature, not to the version itself, so there is nothing here to attach one to yet."
                                    : `Add a file to ${withV(release.version)}`
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => setFilesForRelease(release.id)}
                                  disabled={uploading || versionFeatures.length === 0}
                                  aria-label={`Add a file to ${withV(release.version)}`}
                                  className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md bg-blue-primary text-white transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:bg-border disabled:text-text-tertiary"
                                >
                                  <Plus size={13} strokeWidth={2.6} />
                                </button>
                              </Tooltip>
                            )}
                          </p>
                          {versionAttachments.length === 0 ? (
                            <p className="text-[12.5px] text-text-secondary">
                              No document or picture is attached to anything in
                              this version yet.
                            </p>
                          ) : (
                            <ScrollHint className="max-h-[240px] pr-1">
                              <ul className="grid grid-cols-2 gap-2">
                                {versionAttachments.map(({ file, feature }) => (
                                  <li key={file.id}>
                                    <button
                                      type="button"
                                      onClick={() => setPreviewing(file)}
                                      title={`${file.name}. On ${feature}`}
                                      className="w-full cursor-pointer overflow-hidden rounded-lg border border-border-light text-left transition-colors hover:border-blue-subtle"
                                    >
                                      {file.kind === "image" ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={file.url}
                                          alt={file.name}
                                          className="h-16 w-full bg-surface object-cover"
                                        />
                                      ) : (
                                        <span className="flex h-16 w-full items-center justify-center bg-surface">
                                          <FileText
                                            size={18}
                                            strokeWidth={1.8}
                                            className="text-text-tertiary"
                                          />
                                        </span>
                                      )}
                                      <span className="block truncate px-1.5 py-1 text-[10.5px] text-text-secondary">
                                        {file.name}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </ScrollHint>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            };

  return (
    <div className="space-y-5">
      {/* -------------------------------------------------------- header */}
      <div>
        <SmartBack
          fallback={backTo ?? "/components"}
          className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
        >
          <ArrowLeft size={13} strokeWidth={2.2} />{" "}
          {backTo === "/components/release-calendar"
            ? "Release calendar"
            : backTo
              ? "Back"
              : "All components"}
        </SmartBack>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <OfferingIcon name={component.name} className="h-10 w-10 shrink-0" />
          <h1 className="text-[22px] font-bold text-text-primary">{component.name}</h1>
          <FdlTypeChip type={component.type} />
          {current && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(0,113,227,0.25)] bg-[rgba(0,113,227,0.08)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[color:#0040A0]">
              <Rocket size={11} strokeWidth={2.2} /> Current {withV(current)}
            </span>
          )}
          {canEdit && (
            <button
              type="button"
              aria-label="Rename component"
              onClick={() => {
                setNameDraft(component.name);
                setRenaming(true);
              }}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
            >
              <Pencil size={13} strokeWidth={2} />
            </button>
          )}
        </div>
        {/* THE OFFERING WEARS ITS OWN MARK, AND THE ACTION LOOKS LIKE ONE
            (Anir, Aug 9: "that part that says Freya.Register should be in a
            pill with the icon... the Add to an Offering button, I don't even
            know what that's supposed to do, but I'm assuming it's important.
            That doesn't look good right now"). A blue word in a grey sentence
            beside another blue word gave a link and a button the same
            appearance, so neither read as what it was. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-text-secondary">
            {homes.length > 0 ? "Part of" : "Not connected to an offering yet."}
          </span>
          {homes.map((h) => (
            <Link key={h.id} href={`/offerings/${h.id}`} className="min-w-0">
              <ServiceTag name={h.name} className="text-[12px]" />
            </Link>
          ))}
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setPickedOfferings(
                  offerings.filter((o) => o.connected).map((o) => o.id)
                );
                // A stale search from last time would open the picker already
                // hiding most of the catalogue.
                setOfferingQuery("");
                setAddingOffering(true);
              }}
              title="Put this component inside an offering, so it sells as part of that package"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-light bg-white px-2.5 py-1 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:bg-blue-light/40 hover:text-blue-primary"
            >
              <Plus size={12} strokeWidth={2.4} />
              Add to an offering
            </button>
          )}
        </div>
      </div>

      {/* CONNECTING FROM THIS SIDE. The link existed only from the offering,
          so an owner sitting on a component had to go and find it (Suren,
          Aug 9: "from the FDL component do you have an option to add offering?
          No you don't — you should be able to add which offerings this goes
          through"). Same list, same connection, either direction. */}
      {/* THE FILE, IN THE APP. */}
      <Modal
        open={!!previewing}
        onClose={() => setPreviewing(null)}
        title={previewing?.name || "Attachment"}
      >
        {previewing && (
          <div className="space-y-3">
            {previewing.kind === "image" ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={previewing.url}
                alt={previewing.name}
                className="max-h-[70vh] w-full rounded-lg border border-border-light object-contain"
              />
            ) : /\.pdf$/i.test(previewing.name) ? (
              <iframe
                src={previewing.url}
                title={previewing.name}
                className="h-[70vh] w-full rounded-lg border border-border-light"
              />
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-blue-light/25 px-4 py-8 text-center">
                <span className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-light text-blue-primary">
                  <FileText size={20} strokeWidth={1.8} />
                </span>
                <p className="text-[13.5px] font-semibold text-text-primary">
                  This kind of file cannot be shown in the browser.
                </p>
                <p className="mx-auto mt-1 max-w-[380px] text-[12.5px] text-text-secondary">
                  Word documents and spreadsheets have to open in their own app.
                  Images and PDFs preview right here.
                </p>
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setPreviewing(null)}>
                <X size={14} strokeWidth={2} /> Close
              </Button>
              <a
                href={previewing.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-primary/90"
              >
                <Download size={14} strokeWidth={2} /> Open the file
              </a>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!readingFeature}
        onClose={() => setReadingFeature(null)}
        title={readingFeature?.name || "Feature"}
        /* Room to actually read: a long user story plus screenshots was
           squeezed into the 440px default (Anir, Aug 18: "make the pop-up
           bigger. It's too small if there's a lot of information"). */
        size="workflow"
      >
        {readingFeature && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {readingFeature.fid && (
                <span className="inline-flex rounded border border-[rgba(0,113,227,0.25)] bg-[rgba(0,113,227,0.08)] px-1.5 py-0.5 text-[11px] font-bold tracking-[0.03em] text-[color:#0040A0] tnum">
                  {readingFeature.fid}
                </span>
              )}
              {releases
                .filter((release) => readingFeature.versionIds.includes(release.id))
                .map((release) => (
                  <span
                    key={release.id}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      color: release.status === "released" ? "#1A7A35" : "#6D28D9",
                      background:
                        release.status === "released"
                          ? "rgba(26,122,53,0.08)"
                          : "rgba(124,58,237,0.08)",
                    }}
                  >
                    {release.status === "released" ? (
                      <CircleCheck size={11} strokeWidth={2.2} />
                    ) : (
                      <Clock size={11} strokeWidth={2.2} />
                    )}
                    {withV(release.version)}
                  </span>
                ))}
            </div>
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-text-primary">
              {readingFeature.description || "No description written yet."}
            </p>

            {/* Images render here rather than as a link, because the point of
                attaching a screenshot is to look at it. */}
            {(readingFeature.attachments ?? []).length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  Attached
                </p>
                <ul className="space-y-2">
                  {(readingFeature.attachments ?? []).map((file) => (
                    <li key={file.id}>
                      <button
                        type="button"
                        onClick={() => setPreviewing(file)}
                        className="group/a block w-full cursor-pointer rounded-lg border border-border-light p-2 text-left transition-colors hover:border-blue-subtle hover:bg-blue-light/30"
                      >
                        {file.kind === "image" ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={file.url}
                              alt={file.name}
                              className="max-h-64 w-full rounded object-contain"
                            />
                            <span className="mt-1.5 block text-[12px] text-text-secondary group-hover/a:text-blue-primary">
                              {file.name}
                            </span>
                          </>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-light text-blue-primary">
                              <FileText size={14} strokeWidth={2} />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-text-primary group-hover/a:text-blue-primary">
                              {file.name}
                            </span>
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReadingFeature(null)}>
                Close
              </Button>
              {canEdit && (
                <Button
                  onClick={() => {
                    const target = readingFeature;
                    setReadingFeature(null);
                    openFeatureModal(target);
                  }}
                >
                  <Pencil size={14} strokeWidth={2} /> Edit
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={addingOffering}
        onClose={() => setAddingOffering(false)}
        title={`Which offerings include ${component.name}?`}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void connectOfferings();
          }}
          className="space-y-4"
        >
          <p className="text-[12.5px] text-text-secondary">
            Tick every offering this component is part of. Which version each
            one covers is set on the offering itself.
          </p>
          <div className="flex items-center gap-2">
            <PrioritySearchInput
              grow
              className="min-w-0 flex-1"
              value={offeringQuery}
              onChange={setOfferingQuery}
              placeholder="Search offerings"
              ariaLabel="Search offerings"
              inputClassName="h-9 w-full rounded-lg border border-border-light bg-white pl-9 pr-3 text-[13px] text-text-primary outline-none transition-[border-color,box-shadow] focus:border-blue-primary focus:shadow-input-focus"
              iconClassName="left-3"
              iconSize={15}
            />
            <ViewSelect
              value={offeringPickerView}
              onChange={setOfferingPickerView}
              tileValue="tiles"
              tableValue="rows"
            />
          </div>
          {(() => {
            const q = offeringQuery.trim().toLowerCase();
            const shown = q
              ? offerings.filter((o) => o.name.toLowerCase().includes(q))
              : offerings;
            // A tick you cannot see is a tick you will undo by accident, so a
            // search that hides an already-ticked offering says so rather than
            // quietly leaving it out of view.
            const hiddenPicked = pickedOfferings.filter(
              (id) => !shown.some((o) => o.id === id)
            ).length;
            if (shown.length === 0) {
              return (
                <p className="rounded-lg border border-dashed border-border-light px-4 py-6 text-center text-[12.5px] text-text-tertiary">
                  No offering matches “{offeringQuery.trim()}”.
                </p>
              );
            }
            const tiles = offeringPickerView === "tiles";
            return (
              <>
                <ScrollHint className="max-h-72">
                  <ul
                    className={
                      tiles
                        ? "grid grid-cols-2 items-stretch gap-2"
                        : "space-y-1.5"
                    }
                  >
                    {shown.map((offering) => {
                      const active = pickedOfferings.includes(offering.id);
                      const toggle = () =>
                        setPickedOfferings((prev) =>
                          active
                            ? prev.filter((x) => x !== offering.id)
                            : [...prev, offering.id]
                        );
                      const box = (
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                            active
                              ? "border-blue-primary bg-blue-primary text-white"
                              : "border-border"
                          }`}
                        >
                          {active && <Check size={12} strokeWidth={3} />}
                        </span>
                      );
                      return (
                        <li key={offering.id} className={tiles ? "h-full" : undefined}>
                          <button
                            type="button"
                            onClick={toggle}
                            aria-pressed={active}
                            className={`cursor-pointer rounded-lg border transition-colors ${
                              active
                                ? "border-blue-primary bg-blue-light/50"
                                : "border-border-light hover:border-blue-subtle"
                            } ${
                              tiles
                                ? // min-h keeps a one-line name the same height
                                  // as a three-line one, so the grid stays even.
                                  "relative flex h-full min-h-[112px] w-full flex-col items-center justify-center gap-2 px-3 py-3.5 text-center"
                                : "flex w-full items-center gap-3 px-3 py-2 text-left"
                            }`}
                          >
                            {tiles ? (
                              <>
                                <span className="absolute left-2.5 top-2.5">
                                  {box}
                                </span>
                                <OfferingIcon
                                  name={offering.name}
                                  className="h-9 w-9 shrink-0"
                                />
                                <span className="line-clamp-3 text-[12px] font-medium leading-snug text-text-primary">
                                  {offering.name}
                                </span>
                              </>
                            ) : (
                              <>
                                {box}
                                <OfferingIcon
                                  name={offering.name}
                                  className="h-7 w-7 shrink-0"
                                />
                                <span className="min-w-0 flex-1 text-[13px] font-medium text-text-primary">
                                  {offering.name}
                                </span>
                              </>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </ScrollHint>
                {hiddenPicked > 0 && (
                  <p className="text-[11.5px] text-text-tertiary">
                    {hiddenPicked} ticked{" "}
                    {hiddenPicked === 1 ? "offering is" : "offerings are"} hidden
                    by this search. Clearing it will still save them.
                  </p>
                )}
              </>
            );
          })()}
          {/* SAVE ONLY LIGHTS UP IF SOMETHING CHANGED (Anir, Aug 9: "the save
              button should only show up if I actually did anything, it should
              be grayed out and I shouldn't be able to press it"). Comparing the
              ticks against what is already connected is the same comparison
              the submit handler makes, so the button can never be pressable
              when there is nothing to write. */}
          <div className="flex justify-end">
            <Button
              type="submit"
              loading={busy}
              disabled={
                !offerings.some(
                  (o) => o.connected !== pickedOfferings.includes(o.id)
                )
              }
            >
              <Plus size={14} strokeWidth={2.2} /> Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------- versions */}
      <section className={CARD}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <Rocket size={15} strokeWidth={2} className="text-blue-primary" /> Versions
            <InfoHint text="Every version this component has shipped or has planned. The check mark shows the current one, the version sellers quote." />
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            {/* Subscribe where the roadmap is, not on a settings page nobody
                opens (product owner via Anir, Aug 21: "there should be an
                option to subscribe for those notifications if there is any
                change"). Left of Add version: reading is the common act. */}
            <RoadmapFollowButton kind="component" id={component.id} compact />
            {canEdit && (
              <Button onClick={() => setAddingVersion(true)}>
                <Plus size={14} strokeWidth={2.2} /> Add version
              </Button>
            )}
            {releases.length > 0 && versionsView === "timeline" && (
              <Tooltip label="Fit every version">
                <button
                  type="button"
                  aria-label="Fit every version"
                  onClick={() => fitTimeline.current?.()}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border-light bg-white text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                >
                  <Maximize2 size={14} strokeWidth={2.2} />
                </button>
              </Tooltip>
            )}
            {releases.length > 0 && (
              <ViewSelect
                value={versionsView}
                onChange={setVersionsView}
                tileValue="list"
                tableValue="timeline"
                tileLabel="List"
                tableLabel="Timeline"
                tileIcon={Rows3}
                tableIcon={GanttChartSquare}
              />
            )}
          </div>
        </div>
        {releases.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-text-secondary">
            No versions yet. Add the first one, then list its features below.
          </p>
        ) : !versionsViewReady ? (
          /* One quiet beat while the saved choice is read from the browser —
             rendering the default here painted the LIST for a frame and then
             glitched into the timeline on every reload. The height roughly
             matches either view so the page below barely moves. */
          <div aria-hidden style={{ height: 250 }} />
        ) : (
          /* ONE REGION FOR BOTH VIEWS, keyed so switching animates in with the
             house tab transition. The list renders the cards inline; the
             timeline sends a pill click to a POPUP carrying the same cards
             (Anir, Aug 10: "when I click on the version, it should open up a
             pop-up... it'll show each version as a dropdown, except it will
             auto-open to whichever one I did") — releaseCard is one shared
             renderer, so the two can never drift. */
          <div key={versionsView} className="tab-panel">
          {versionsView === "timeline" && (
          <VersionTimeline
            onFitReady={(f) => {
              fitTimeline.current = f;
            }}
            releases={releases.map((release) => ({
              ...release,
              customers: customersOnVersion(release.id).map((c) => ({
                id: c.id,
                name: c.name,
              })),
              featureCount: component.features.filter((f) =>
                f.versionIds.includes(release.id)
              ).length,
            }))}
            selectedIds={[...openVersions]}
            onOpen={(releaseId) => {
              setOpenVersions(new Set([releaseId]));
              setVersionsModalOpen(true);
            }}
          />
          )}
          {/* WHO CHANGED THIS ROADMAP, AND WHEN (product owner, Aug 20:
              "Every time there is a change in road map it has to be versioned.
              Just like how you version a document").
              This is the roadmap people actually edit — the offering-level one
              has had no editor since the tab was replaced — so the history has
              to live here, next to the versions it records. */}
          {(component.roadmap_versions?.length ?? 0) >= 0 && (
            <details className="mb-4">
              <summary className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:text-blue-primary">
                <GitBranch size={13} strokeWidth={2.2} aria-hidden="true" />
                Roadmap version history
                <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] font-bold text-text-tertiary">
                  {component.roadmap_versions?.length
                    ? `v${component.roadmap_versions[0].version}`
                    : "No changes yet"}
                </span>
              </summary>
              <div className="mt-3">
                <RoadmapVersionHistory versions={component.roadmap_versions ?? []} />
              </div>
            </details>
          )}
          {versionsView === "list" && (
          // ONE CARD PER VERSION. A divided list of text rows made every
          // version look like the same sentence repeated, with the open panel
          // a flat grey box hanging under it (Anir, Aug 8: "revamp this… it
          // just looks really ugly"). Each version is now its own card with a
          // status-coloured rail, the number as the headline, and its facts as
          // chips — so you can tell the released one from the planned one
          // without reading.
          <div className="mt-3.5 space-y-2.5">
            {releases.map(releaseCard)}
          </div>
          )}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- features */}
      <section className={CARD}>
        <div className="flex items-center justify-between gap-4">
          {/* NAME, PICKER, THEN THE HINT (Anir, Aug 13: "you can probably just
              say 'Features' and then show the dropdown, and then make sure the
              text is aligned and stuff, and then the question mark can go
              after"). The picker used to be lifted onto this line from below
              with -mt-9 and a 112px left margin — a guess at where the heading
              ended, which is exactly why nothing lined up. It is a real
              sibling on a real flex row now, and the sentence "Showing what is
              in" is gone: the control says what it is. */}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
              <ListChecks size={15} strokeWidth={2} className="text-blue-primary" /> Features
            </h2>
            {releases.length > 0 && (
              <MultiColorSelect
                values={shownVersionIds}
                onChange={setShownVersionIds}
                options={versionOptions}
                allLabel="Every version"
                allIcon={ListChecks}
                ariaLabel="Which versions to show"
                collapsible={false}
                minWidth={200}
              />
            )}
            <InfoHint text="What is in one version. Pick the version beside the heading. To compare two versions side by side, use the Compare versions card lower down." />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canEdit && (
              /* Same square as Add customer: on this page a plus always means
                 add, and it always looks the same (Anir, Aug 9). */
              <Tooltip
                label={
                  releases.length === 0
                    ? "Add a version first"
                    : "Add a feature"
                }
              >
                <button
                  type="button"
                  aria-label="Add a feature"
                  onClick={() => openFeatureModal()}
                  disabled={releases.length === 0}
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-blue-primary text-white transition-colors hover:bg-blue-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={17} strokeWidth={2.4} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* ONE VERSION, NOT A MATRIX. A tick column per version turned this
            into a second comparison table sitting above the real one (Suren,
            Aug 9: "I already have a comparison table... why the heck are you
            showing me this here? Keep one version comparison and give me, in
            the first one, which version I want to see the features"). Picking
            the version here also answers "I don't know which version of the
            feature I'm downloading" — the button names it. */}
        {component.features.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-text-secondary">
            {releases.length === 0
              ? "Add a version first. Features are ticked against versions."
              : "No features listed yet. Add the first feature, then tick which versions carry it."}
          </p>
        ) : shownFeatures.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-text-secondary">
            Nothing is ticked for{" "}
            {shownReleases.map((r) => r.version).join(" or ") || "this version"}{" "}
            yet. Open a feature and tick the version, or pick another above.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-border-light text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  {/* The right columns wear fixed widths so the table cannot
                      re-measure when a row opens — hiding the closed row's
                      description used to narrow Feature and slide every
                      column left (Anir, Aug 17: "why are the columns
                      shifting?"). Feature simply takes whatever is left. */}
                  <th className="py-2 pl-3 pr-4">Feature</th>
                  <th className="w-[170px] py-2 pr-4">In versions</th>
                  <th className="w-[140px] py-2 pr-4">Customers</th>
                  <th className="w-[90px] py-2 pr-4">Files</th>
                  {canEdit && <th className="w-[76px] py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {shownFeatures.map((feature) => {
                  const rowOpen = expandedFeatureId === feature.id;
                  return (
                  <Fragment key={feature.id}>
                  <tr
                    onClick={() =>
                      setExpandedFeatureId(rowOpen ? null : feature.id)
                    }
                    aria-expanded={rowOpen}
                    className={`cursor-pointer transition-colors ${
                      rowOpen
                        ? "bg-surface [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                        : "hover:bg-surface"
                    }`}
                  >
                    <td className="py-2.5 pl-3 pr-4">
                      {/* The popup trigger hugs the WORDS. As a full-width
                          button it owned the whole Feature column, so every
                          click in the row's left 70% opened the popup and the
                          dropdown seemed to not exist (Anir, Aug 17: "when I
                          click on a feature it still opens popup always").
                          Same fix as the goal table: name = popup, everywhere
                          else on the row = dropdown. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReadingFeature(feature);
                        }}
                        title="Open the full view"
                        className="group/f inline-block max-w-full cursor-pointer text-left"
                      >
                        <p className="text-[13px] font-semibold text-text-primary group-hover/f:text-blue-primary">
                          {feature.fid && (
                            <span className="mr-1.5 inline-flex rounded border border-[rgba(0,113,227,0.25)] bg-[rgba(0,113,227,0.08)] px-1 py-0.5 align-middle text-[10px] font-bold tracking-[0.03em] text-[color:#0040A0] tnum">
                              {feature.fid}
                            </span>
                          )}
                          {feature.name}
                        </p>
                      </button>
                      {feature.description && !rowOpen && (
                        <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-text-secondary">
                          {feature.description}
                        </p>
                      )}
                    </td>
                    {/* THE ROW EARNS ITS WIDTH. A name on the left and two
                        icons a thousand pixels away (Anir, Aug 9: "I don't
                        like how far the name is from the icons... for each
                        feature, fill in that space"). Every column here is
                        read off data we already hold: no invented metric. */}
                    <td className="py-2.5 pr-4">
                      {(() => {
                        /* SUMMARISE, DO NOT ENUMERATE. One pill per version
                           was fine at three and absurd at a hundred (Anir,
                           Aug 9: "this doesn't make sense if there's a lot of
                           versions"). Most features are "available from here
                           onward", so say that when it is true and fall back
                           to a count when it is not. The full list is one
                           hover away either way. */
                        const inThem = releases.filter((r) =>
                          feature.versionIds.includes(r.id)
                        );
                        if (inThem.length === 0)
                          return (
                            <span className="text-[11.5px] text-text-tertiary">
                              No version ticked
                            </span>
                          );
                        const firstIndex = releases.findIndex(
                          (r) => r.id === inThem[0].id
                        );
                        // Contiguous and running to the newest release.
                        const onward =
                          inThem.length === releases.length - firstIndex &&
                          inThem.every(
                            (r, i) => releases[firstIndex + i]?.id === r.id
                          );
                        const label =
                          inThem.length === releases.length
                            ? "Every version"
                            : onward
                              ? `From ${withV(inThem[0].version)} onward`
                              : `${inThem.length} of ${releases.length} versions`;
                        return (
                          <HoverCard
                            width={inThem.length > 8 ? 340 : inThem.length > 4 ? 260 : 230}
                            anchor="trigger"
                            content={
                              <div>
                                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                                  In these versions
                                </p>
                                {/* COLUMNS, AND THE TAG RIDES THE NUMBER (Anir,
                                    Aug 9: "I can't really tell which version is
                                    current, I think it's too far... it should be
                                    right after the version number instead of on
                                    the right side all the way there, and then
                                    maybe have like 3 columns"). Flung to the far
                                    edge, the marker made you track across dead
                                    space to find the one version that matters. */}
                                <ul
                                  className={`grid gap-x-3 gap-y-1 ${
                                    inThem.length > 8
                                      ? "grid-cols-3"
                                      : inThem.length > 4
                                        ? "grid-cols-2"
                                        : "grid-cols-1"
                                  }`}
                                >
                                  {inThem.map((r) => (
                                    <li
                                      key={r.id}
                                      className="flex items-center gap-1.5 text-[12.5px] text-text-primary"
                                    >
                                      <Check
                                        size={12}
                                        strokeWidth={2.6}
                                        className="shrink-0 text-[color:#1A7A35]"
                                      />
                                      <span className="tnum">{withV(r.version)}</span>
                                      {r.current && (
                                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-blue-primary px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.03em] text-white">
                                          <Check size={8} strokeWidth={3.4} />
                                          Now
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            }
                          >
                            <span
                              className={`inline-flex cursor-default items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${
                                inThem.some((r) => r.current)
                                  ? "border-blue-primary bg-blue-light text-blue-primary"
                                  : "border-border-light text-text-secondary"
                              }`}
                            >
                              {label}
                            </span>
                          </HoverCard>
                        );
                      })()}
                    </td>
                    <td className="py-2.5 pr-4">
                      {(() => {
                        // Accounts sitting on a version that carries this
                        // feature. It answers "who actually has this?", which
                        // is the question a seller asks about a feature.
                        const on = connected.filter(
                          (c) =>
                            c.releaseId && feature.versionIds.includes(c.releaseId)
                        );
                        if (on.length === 0)
                          return (
                            <span className="text-[11.5px] text-text-tertiary">
                              Nobody yet
                            </span>
                          );
                        return (
                          <CustomerDots
                            people={on}
                            note={(person) => {
                              const c = connected.find((x) => x.id === person.id);
                              const rel = component.releases.find(
                                (r) => r.id === c?.releaseId
                              );
                              return rel ? `On ${withV(rel.version)}` : undefined;
                            }}
                          />
                        );
                      })()}
                    </td>
                    <td className="py-2.5 pr-4">
                      {(feature.attachments ?? []).length > 0 ? (
                        /* THE COUNT OPENS THE FILES (Anir, Aug 9: "if I hover
                           over that number, if there are 10 files, it should
                           show me, kinda like how you did it in the sales
                           materials... I can click on any one of them and it'll
                           actually open it in its own preview". Reaching a file
                           meant opening the editor first, which he called out:
                           "right now, literally, I don't think I can even
                           access this. Okay, I can if I click Edit"). */
                        <HoverCard
                          width={300}
                          anchor="trigger"
                          delayMs={0}
                          content={
                            <div>
                              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                                {(feature.attachments ?? []).length} file
                                {(feature.attachments ?? []).length === 1 ? "" : "s"} on{" "}
                                {feature.name}
                              </p>
                              <ul className="space-y-1">
                                {(feature.attachments ?? []).map((file) => (
                                  <li key={file.id}>
                                    <button
                                      type="button"
                                      onClick={() => setPreviewing(file)}
                                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border-light px-2 py-1.5 text-left transition-colors hover:border-blue-subtle hover:bg-blue-light/40"
                                    >
                                      {file.kind === "image" ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={file.url}
                                          alt=""
                                          className="h-8 w-8 shrink-0 rounded object-cover"
                                        />
                                      ) : (
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-light text-blue-primary">
                                          <FileText size={14} strokeWidth={2} />
                                        </span>
                                      )}
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[12.5px] font-medium text-text-primary">
                                          {file.name}
                                        </span>
                                        <span className="block text-[11px] text-text-secondary">
                                          Open it here
                                        </span>
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          }
                        >
                          <span className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-text-secondary transition-colors hover:bg-blue-light hover:text-blue-primary">
                            <Paperclip size={11} strokeWidth={2.4} />
                            {(feature.attachments ?? []).length}
                          </span>
                        </HoverCard>
                      ) : (
                        <span className="text-[11.5px] text-text-tertiary">None</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="py-2.5 pl-2">
                        <span className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            aria-label={`Edit ${feature.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openFeatureModal(feature);
                            }}
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                          >
                            <Pencil size={13} strokeWidth={2} />
                          </button>
                          {null}
                          <button
                            type="button"
                            aria-label={`Remove ${feature.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmFeatureDelete(feature.id);
                            }}
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[color:#DC2626] transition-colors hover:bg-error/10 hover:text-error"
                          >
                            <Trash2 size={13} strokeWidth={2} />
                          </button>
                          <ConfirmDialog
                            open={confirmFeatureDelete === feature.id}
                            onClose={() => setConfirmFeatureDelete(null)}
                            onConfirm={() => {
                              setConfirmFeatureDelete(null);
                              void removeFeature(feature.id);
                            }}
                            title="Remove this feature?"
                            body={`"${feature.name}" comes off this component's feature list.`}
                            confirmLabel="Remove feature"
                          />
                        </span>
                      </td>
                    )}
                  </tr>
                  {rowOpen && (
                    <tr className="!border-t-0 bg-surface">
                      <td
                        colSpan={canEdit ? 5 : 4}
                        className="pb-4 pl-3 pr-4 pt-1 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                      >
                        <div className="tab-panel">
                          {feature.description ? (
                            <p className="max-w-[860px] whitespace-pre-line text-[12.5px] leading-relaxed text-text-primary">
                              {feature.description}
                            </p>
                          ) : (
                            <p className="text-[12.5px] text-text-tertiary">
                              No description on this feature yet.
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReadingFeature(feature);
                            }}
                            className="mt-2 cursor-pointer text-[11.5px] font-semibold text-blue-primary hover:underline"
                          >
                            Open the full view
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------ customers */}
      <section className={CARD}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <Building2 size={15} strokeWidth={2} className="text-blue-primary" />
            Customers running this
            <InfoHint text="Every customer using this component, and which version they are on. It is the same record their own page shows, just reached from this side." />
          </h2>
          {/* ONE LINE: how you look at the list, then the one action on it
              (Anir, Aug 9: "the tile or row thing should be in line with the
              add customer button and the add customer button can just be a
              white + with a blue square"). */}
          <div className="flex shrink-0 items-center gap-2">
            {connected.length > 0 && releases.length > 1 && (
              <MultiColorSelect
                values={customerVersions}
                onChange={setCustomerVersions}
                options={versionOptions}
                allLabel="Every version"
                allIcon={Building2}
                ariaLabel="Filter customers by version"
                collapsible={false}
                minWidth={185}
              />
            )}
            {connected.length > 0 && (
              <ViewSelect
                value={customerView}
                onChange={setCustomerView}
                tileValue="grid"
                tableValue="table"
              />
            )}
            {canEdit && unconnected.length > 0 && (
              <Tooltip label="Add a customer">
                <button
                  type="button"
                  aria-label="Add a customer"
                  onClick={() => openAddCustomers()}
                  disabled={busy}
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-blue-primary text-white transition-colors hover:bg-blue-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={17} strokeWidth={2.4} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
        {connected.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-text-secondary">
            No customer is recorded on this component yet. Add one here, or
            connect it from the customer&apos;s own Digital components tab.
          </p>
        ) : (
          <>
            {/* CARDS OR ROWS, like the sales floor (Anir, Aug 9: "make it
                look something like this, like a team's page... both these
                options"). Four cards across: the old two-wide rows spent most
                of their width on the gap between the name and the version. */}
            {customerView === "grid" ? (
              <ul className="stagger mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {shownCustomers.map((customer) => {
                  const release = component.releases.find(
                    (item) => item.id === customer.releaseId
                  );
                  const next = component.releases.find(
                    (item) => item.id === customer.nextReleaseId
                  );
                  return (
                    <li key={customer.id}>
                      <Link
                        href={`/customers/${customer.id}?tab=components`}
                        className="tab-panel flex h-full flex-col rounded-xl border border-border-light p-3.5 transition-colors hover:border-blue-subtle hover:bg-blue-light/25"
                      >
                        <span className="flex items-center gap-2.5">
                          <CompanyLogo
                            name={customer.name}
                            className="h-9 w-9 shrink-0"
                          />
                          <span className="min-w-0 text-[13.5px] font-semibold leading-tight text-text-primary">
                            {customer.name}
                          </span>
                        </span>
                        <span className="mt-3 block border-t border-border-light pt-2.5">
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            Current version
                          </span>
                          <span className="mt-0.5 block text-[15px] font-bold leading-none text-text-primary tnum">
                            {release ? withV(release.version) : "Not set yet"}
                          </span>
                          <span className="mt-1.5 block text-[11.5px] leading-tight text-text-tertiary">
                            {next ? `Next: ${withV(next.version)}` : "No next version planned"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left">
                  <thead>
                    {/* TWO MORE COLUMNS, BECAUSE FOUR LEFT GAPS (Anir, Aug 9:
                        "there's a lot of empty space, I don't know what you're
                        doing on the top left"). What they run and what they'd
                        gain by moving are the two facts a seller opens this
                        table for, and both are arithmetic on data already on
                        the page, so neither can disagree with it. */}
                    <tr className="border-b border-border-light text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:whitespace-nowrap">
                      <th className="w-[26%] py-2 pr-4">Customer</th>
                      <th className="w-[15%] py-2 pr-4">Current version</th>
                      <th className="w-[13%] py-2 pr-4">Next version</th>
                      <th className="w-[13%] py-2 pr-4">Features</th>
                      <th className="w-[16%] py-2 pr-4">Gains on upgrade</th>
                      <th className="w-[15%] py-2 pr-4">Upgrade status</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="stagger divide-y divide-border-light">
                    {shownCustomers.map((customer) => {
                      const release = component.releases.find(
                        (item) => item.id === customer.releaseId
                      );
                      const next = component.releases.find(
                        (item) => item.id === customer.nextReleaseId
                      );
                      // HOW FAR BEHIND, counted against the current release.
                      // Both indexes come from the same ordered list, so this
                      // is arithmetic on real data, not a guess.
                      const here = release
                        ? releases.findIndex((r) => r.id === release.id)
                        : -1;
                      const currentIndex = releases.findIndex((r) => r.current);
                      const behind =
                        here >= 0 && currentIndex >= 0 ? currentIndex - here : null;
                      // What their build carries, and what the current release
                      // has that theirs does not.
                      const allFeatureCount = component.features.length;
                      const theirFeatures = release
                        ? component.features.filter((f) =>
                            f.versionIds.includes(release.id)
                          ).length
                        : 0;
                      const currentRelease = releases[currentIndex];
                      const gains =
                        release && currentRelease && currentIndex > here
                          ? component.features.filter(
                              (f) =>
                                f.versionIds.includes(currentRelease.id) &&
                                !f.versionIds.includes(release.id)
                            ).length
                          : 0;
                      return (
                        <tr
                          key={customer.id}
                          onClick={() =>
                            router.push(`/customers/${customer.id}?tab=components`)
                          }
                          className="group cursor-pointer transition-colors hover:bg-blue-light/25"
                        >
                          <td className="py-3 pr-4">
                            {/* The whole row navigates (Anir, Aug 9: "it's not
                                letting me click on this row"); the link stays
                                for keyboard and middle-click. */}
                            <Link
                              href={`/customers/${customer.id}?tab=components`}
                              onClick={(event) => event.stopPropagation()}
                              className="flex items-center gap-3 text-[13.5px] font-semibold text-text-primary group-hover:text-blue-primary"
                            >
                              <CompanyLogo
                                name={customer.name}
                                className="h-9 w-9 shrink-0"
                              />
                              {customer.name}
                            </Link>
                          </td>
                          <td className="py-3 pr-4">
                            {release ? (
                              (() => {
                                // Status, not identity: green released, blue
                                // current, purple expected — the same rule as
                                // every other place a version is printed.
                                const tone = versionTone(release);
                                return (
                                  <span
                                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-semibold tnum"
                                    style={{
                                      color: tone.color,
                                      borderColor: tone.border,
                                      background: tone.bg,
                                    }}
                                  >
                                    {withV(release.version)}
                                  </span>
                                );
                              })()
                            ) : (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border-light px-2.5 py-1 text-[12px] text-text-tertiary">
                                Not set yet
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-3 pr-4 text-[12.5px] text-text-secondary tnum">
                            {next ? next.version : "Not planned"}
                          </td>
                          <td className="whitespace-nowrap py-3 pr-4 text-[12.5px] text-text-secondary tnum">
                            {release ? (
                              <>
                                {theirFeatures}{" "}
                                <span className="text-text-tertiary">
                                  of {allFeatureCount}
                                </span>
                              </>
                            ) : (
                              <span className="text-text-tertiary">Not known</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-3 pr-4 text-[12.5px] tnum">
                            {gains > 0 ? (
                              <span className="font-semibold text-[color:#B4318F]">
                                +{gains}{" "}
                                {gains === 1 ? "feature" : "features"}
                              </span>
                            ) : (
                              <span className="text-text-tertiary">
                                Nothing waiting
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            {behind === null ? (
                              <span className="text-[12px] text-text-tertiary">
                                Not known
                              </span>
                            ) : behind <= 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(26,122,53,0.25)] bg-[rgba(26,122,53,0.08)] px-2 py-0.5 text-[11.5px] font-semibold text-[color:#1A7A35]">
                                <CircleCheck size={11} strokeWidth={2.2} /> Up to date
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(194,65,12,0.25)] bg-[rgba(194,65,12,0.08)] px-2 py-0.5 text-[11.5px] font-semibold text-[color:#C2410C]">
                                <Clock size={11} strokeWidth={2.2} />
                                {behind} behind
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            <ChevronRight
                              size={15}
                              strokeWidth={2}
                              className="inline text-text-tertiary transition-colors group-hover:translate-x-0.5 group-hover:text-blue-primary"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {/* -------------------------------------------------------- compare */}
      {releases.length >= 2 && component.features.length > 0 && (
        <section className={CARD}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                <GitCompareArrows size={15} strokeWidth={2} className="text-blue-primary" /> Compare versions
                <InfoHint text="Pick two or more versions. You get the features side by side, and only the ones at least one of those versions has." />
              </h2>
              <p className="mt-1 text-[12.5px] text-text-secondary">
                {compareReleases.length >= 2
                  ? `Comparing ${compareReleases
                      .map((r) => withV(r.version))
                      .join(" vs ")}.`
                  : "Pick two or more versions to see them side by side."}
              </p>
            </div>
            {/* THE CONTROL BELONGS ON THE HEADER LINE, next to the action it
                feeds. On its own row underneath, the picker sat beside a
                sentence that just repeated the table's own column headers,
                and left a long empty gap to the right (Anir, Aug 9: "I don't
                think the dropdown and the 'comparing these two versions' text
                is positioned correctly"). Same rule he set for the customers
                header: how you look at it, then what you do with it. */}
            <div className="flex shrink-0 items-center gap-2">
              <MultiColorSelect
                values={compareIds}
                onChange={setCompareIds}
                options={versionOptions}
                allLabel="Pick versions"
                allIcon={GitCompareArrows}
                ariaLabel="Versions to compare"
                collapsible={false}
                minWidth={200}
                // Room for two full version names — "V1.0.4 (current), V2.0.0"
                // was ellipsizing at the old width (Anir, Aug 17: "this
                // dropdown can be much bigger… so it doesn't say ...").
                // Three or more picks still summarise to "N selected".
                maxWidth={380}
              />
              {compareRows.length > 0 && (
                <Tooltip label="Download this comparison">
                  <button
                    type="button"
                    aria-label="Download this comparison"
                    onClick={downloadComparison}
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-light text-text-secondary transition-colors hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary"
                  >
                    <Download size={15} strokeWidth={2} />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
          {compareReleases.length >= 2 && compareRows.length === 0 ? (
            /* Two versions picked and neither carries a single feature. The
               table used to render its header over nothing, which reads as a
               bug rather than as an answer. */
            <p className="mt-3 rounded-lg border border-dashed border-border bg-blue-light/30 px-3 py-2.5 text-[12.5px] text-text-secondary">
              Neither {compareReleases.map((r) => r.version).join(" nor ")} has
              any feature ticked yet, so there is nothing to compare. Tick a
              version on a feature above and it appears here.
            </p>
          ) : compareReleases.length >= 2 ? (
            <>
              {/* MANY VERSIONS SCROLLS, IT DOES NOT SQUEEZE (Anir, Aug 9:
                  "if they choose a lot of versions to compare, obviously it'll
                  scroll properly horizontally and not glitch"). Each version
                  column keeps a fixed width so ten of them overflow the card
                  instead of crushing the feature name, and the name column is
                  sticky so you always know which row you are reading. */}
              <div className="heat-map-scroll mt-4 overflow-x-auto">
                <table className="w-full min-w-max text-left">
                  <thead>
                    <tr className="border-b border-border-light text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      <th className="sticky left-0 z-10 min-w-[220px] bg-white py-2 pr-4">
                        Feature
                      </th>
                      {compareReleases.map((r) => (
                        <th
                          key={r.id}
                          className="w-[120px] min-w-[120px] px-2 py-2 text-center whitespace-nowrap"
                        >
                          {withV(r.version)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {compareRows.map((feature) => (
                      <tr key={feature.id}>
                        {/* THE ID TRAVELS WITH THE FEATURE (Anir, Aug 9: "put
                            version id here"). Every other list on this page
                            leads with F-001, so a comparison that dropped it
                            was the one place you could not tie a row back to
                            the sheet you downloaded. */}
                        <td className="sticky left-0 z-10 min-w-[220px] bg-white py-2.5 pr-4 text-[13px] font-medium text-text-primary">
                          <span className="flex items-center gap-1.5">
                            {feature.fid && (
                              <span className="shrink-0 rounded border border-blue-subtle bg-blue-light px-1.5 py-[1px] text-[10.5px] font-bold text-blue-primary tnum">
                                {feature.fid}
                              </span>
                            )}
                            {feature.name}
                          </span>
                        </td>
                        {compareReleases.map((release) => (
                          <td key={release.id} className="px-2 py-2.5 text-center">
                            {feature.versionIds.includes(release.id) ? (
                              <Check size={14} strokeWidth={2.6} className="inline text-[color:#1A7A35]" />
                            ) : (
                              <Minus size={12} strokeWidth={2} className="inline text-text-tertiary" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-border bg-blue-light/30 px-3 py-2.5 text-[12.5px] text-text-secondary">
              Pick one more version and the table appears here.
            </p>
          )}
        </section>
      )}

      {/* --------------------------------------------------------- modals */}
      {/* WHICH FEATURE DOES THIS FILE BELONG TO. Storage keys attachments to
          features, so this is the one question the panel cannot answer on your
          behalf without risking filing a spec under the wrong thing. */}
      <Modal
        open={filesForRelease !== null}
        onClose={() => setFilesForRelease(null)}
        title={`Add a file to ${
          releases.find((r) => r.id === filesForRelease)?.version ?? "this version"
        }`}
      >
        {(() => {
          const target = releases.find((r) => r.id === filesForRelease);
          const choices = target
            ? component.features.filter((f) => f.versionIds.includes(target.id))
            : [];
          return (
            <div className="space-y-3">
              <p className="text-[12.5px] text-text-secondary">
                A file is pinned to a feature, so it travels with every version
                that carries that feature. Pick the one this belongs to.
              </p>
              <ul className="space-y-1.5">
                {choices.map((feature) => (
                  <li key={feature.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
                        uploading
                          ? "cursor-wait opacity-60"
                          : "border-border-light hover:border-blue-subtle hover:bg-blue-light/30"
                      }`}
                    >
                      <input
                        type="file"
                        multiple
                        disabled={uploading}
                        className="hidden"
                        onChange={(event) =>
                          void attachToFeature(feature.id, event.target.files)
                        }
                      />
                      <Paperclip
                        size={13}
                        strokeWidth={2.2}
                        className="shrink-0 text-blue-primary"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-text-primary">
                          {feature.fid ? `${feature.fid} ` : ""}
                          {feature.name}
                        </span>
                        <span className="block text-[11.5px] text-text-secondary">
                          {(feature.attachments ?? []).length} file
                          {(feature.attachments ?? []).length === 1 ? "" : "s"} so far
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {/* The same bars as the feature popup — this is the other way
                  in, and a document coming from here deserves the same
                  feedback as one coming from there. */}
              <UploadProgressRows uploads={uploads} />
            </div>
          );
        })()}
      </Modal>

      <Modal open={renaming} onClose={() => setRenaming(false)} title="Rename component">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!nameDraft.trim()) return;
            if (await patch({ name: nameDraft.trim() }, "Renamed.")) setRenaming(false);
          }}
          className="space-y-4"
        >
          <input
            autoFocus
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            className={FIELD}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={!nameDraft.trim()} loading={busy}>
              <Pencil size={14} strokeWidth={2} /> Save name
            </Button>
          </div>
        </form>
      </Modal>

      {/* THE TIMELINE'S POPUP: the whole version list, each one a
          collapsible card, with the clicked version already unfolded. */}
      <Modal
        open={versionsModalOpen}
        onClose={() => setVersionsModalOpen(false)}
        title={`${component.name} versions`}
        size="workflow"
      >
        {/* FIXED height, not a max: the white rectangle must not grow and
            shrink as versions unfold (Anir, Aug 10: "make the entire
            rectangle a little bit bigger, and then when I click each
            dropdown, it won't change the actual rectangle"). The cards
            scroll inside; the popup itself never moves. */}
        <div className="-mr-2 h-[74vh] space-y-2.5 overflow-y-auto pr-2">
          {releases.map(releaseCard)}
        </div>
      </Modal>

      <Modal
        open={addingVersion}
        onClose={() => setAddingVersion(false)}
        title={`Add a version to ${component.name}`}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void addVersion();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-text-primary">Version</label>
              {/* THE V IS THE FIELD'S JOB, NOT THE TYPIST'S (Anir, Aug 10:
                  "it should automatically add the v, and then the user enters
                  in whatever it is. It should be after the v"). The V sits
                  printed in the box, typing lands after it, and a pasted
                  "v2.1" sheds its own v instead of doubling up. */}
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-text-secondary">
                  V
                </span>
                <input
                  autoFocus
                  value={version.replace(/^v+/i, "")}
                  onChange={(event) =>
                    setVersion(event.target.value.replace(/^v+/i, ""))
                  }
                  placeholder="2.1"
                  className={FIELD}
                  style={{ paddingLeft: 26 }}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-text-primary">
                {status === "released" ? "Release date" : "Expected date"}
              </label>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={FIELD} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStatus("released")}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                status === "released"
                  ? "border-[rgba(26,122,53,0.35)] bg-[rgba(26,122,53,0.1)] text-[color:#1A7A35]"
                  : "border-border-light text-text-secondary hover:border-blue-subtle"
              }`}
            >
              <CircleCheck size={13} strokeWidth={2.2} /> Released
            </button>
            <button
              type="button"
              onClick={() => setStatus("next")}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                status === "next"
                  ? "border-[rgba(124,58,237,0.35)] bg-[rgba(124,58,237,0.1)] text-[color:#6D28D9]"
                  : "border-border-light text-text-secondary hover:border-blue-subtle"
              }`}
            >
              <Clock size={13} strokeWidth={2.2} /> Coming next
            </button>
          </div>
          {status === "released" && (
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-text-primary">
              <input
                type="checkbox"
                checked={makeCurrent}
                onChange={(event) => setMakeCurrent(event.target.checked)}
                className="h-4 w-4 accent-blue-primary"
              />
              This is the current version
            </label>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-[11.5px] text-text-tertiary">
              {!normalizedVersion
                ? "Enter a version to continue."
                : duplicateVersion
                  ? "That version already exists."
                  : "Ready to add. Tick its features in the table after."}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button type="submit" disabled={!canAddVersion} loading={busy}>
                <Plus size={14} strokeWidth={2.2} /> Add version
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={addingCustomers}
        onClose={() => setAddingCustomers(false)}
        title={`Add a customer to ${component.name}`}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void connectCustomers();
          }}
          className="space-y-4"
        >
          <div>
            <p className="mb-1.5 text-[12.5px] font-semibold text-text-primary">
              Which version are they on?
            </p>
            <ColorSelect
              value={addingRelease}
              onChange={setAddingRelease}
              options={versionOptions}
              ariaLabel="Which version are they on"
              collapsible={false}
              minWidth={0}
              className="w-full"
            />
            <p className="mt-1.5 text-[12px] text-text-secondary">
              You can change this later on their own page.
            </p>
          </div>
          <ScrollHint className="max-h-72">
          <ul className="space-y-1.5">
            {unconnected.map((customer) => {
              const active = pickedCustomers.includes(customer.id);
              return (
                <li key={customer.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setPickedCustomers((prev) =>
                        active
                          ? prev.filter((x) => x !== customer.id)
                          : [...prev, customer.id]
                      )
                    }
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                      active
                        ? "border-blue-primary bg-blue-light/50"
                        : "border-border-light hover:border-blue-subtle"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        active
                          ? "border-blue-primary bg-blue-primary text-white"
                          : "border-border"
                      }`}
                    >
                      {active && <Check size={12} strokeWidth={3} />}
                    </span>
                    <CompanyLogo name={customer.name} className="h-6 w-6 shrink-0" />
                    <span className="min-w-0 flex-1 text-[13px] font-medium text-text-primary">
                      {customer.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          </ScrollHint>
          <div className="flex justify-end">
            <Button type="submit" disabled={!pickedCustomers.length} loading={busy}>
              <Plus size={14} strokeWidth={2.2} /> Add customer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Wide, same height (Anir, Aug 17: "can you make it wider? I don't
          know why it's so thin. Keep the height"). Feature names are whole
          sentences and the description is a user story — both were reading
          through a letterbox. */}
      <Modal
        open={featureModal !== null}
        onClose={() => setFeatureModal(null)}
        title={featureModal === "" ? "Add a feature" : "Edit feature"}
        size="workflow"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveFeature();
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
              Feature name
              <InfoHint text="One capability, named the way a seller would say it." />
            </label>
            <input
              autoFocus
              value={featName}
              onChange={(event) => setFeatName(event.target.value)}
              placeholder="Bulk import from Excel"
              className={FIELD}
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
              Feature ID
              <InfoHint text="We make this ID for you, and it is unique inside this component. Nobody has to think one up, and two features can never clash." />
            </label>
            <p className="rounded-lg border border-border-light bg-surface px-3 py-2 text-[13px] font-semibold text-text-secondary tnum">
              {featFid || nextFeatureId()}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-text-primary">Description</label>
            <textarea
              value={featDesc}
              onChange={(event) => setFeatDesc(event.target.value)}
              rows={6}
              placeholder="What it does. A paragraph is fine. This is what goes into the customer's feature sheet."
              className={`${FIELD} resize-y`}
            />
          </div>
          <div>
            <label className="mb-1 flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-text-primary">
              Available in which versions?
              {featVersions.length === 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(180,49,143,0.12)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[color:#B4318F]">
                  Pick at least one
                </span>
              ) : (
                <span className="text-[11.5px] font-normal text-text-secondary tnum">
                  {featVersions.length} of {releases.length} picked
                </span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {releases.map((release) => {
                const active = featVersions.includes(release.id);
                return (
                  <button
                    key={release.id}
                    type="button"
                    onClick={() =>
                      setFeatVersions((prev) =>
                        active ? prev.filter((x) => x !== release.id) : [...prev, release.id]
                      )
                    }
                    className={`cursor-pointer rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
                      active
                        ? "border-[rgba(26,122,53,0.35)] bg-[rgba(26,122,53,0.1)] text-[color:#1A7A35]"
                        : "border-border-light text-text-secondary hover:border-blue-subtle"
                    }`}
                  >
                    {active && <Check size={11} strokeWidth={2.6} className="mr-1 inline" />}
                    {withV(release.version)}
                  </button>
                );
              })}
            </div>
          </div>
          {/* A SPEC OR A SCREENSHOT, PINNED TO THE FEATURE (Suren, Aug 9:
              "if they can add some document or an image, can you allow it to
              add?"). Uploads land in the same managed storage as a sales
              material and attach on Save with everything else. */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
              Documents and images
              <InfoHint text="Attach a spec, a screenshot or a mock-up. Anyone who can open this component can open the file." />
            </label>
            {featFiles.length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {featFiles.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center gap-2 rounded-lg border border-border-light px-2.5 py-1.5"
                  >
                    {file.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={file.url}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-light text-blue-primary">
                        <FileText size={14} strokeWidth={2} />
                      </span>
                    )}
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-text-primary hover:text-blue-primary"
                    >
                      {file.name}
                    </a>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        setFeatFiles((prev) => prev.filter((f) => f.id !== file.id))
                      }
                      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-error/10 hover:text-error"
                    >
                      <X size={13} strokeWidth={2} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <UploadProgressRows uploads={uploads} />
            <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:bg-blue-light/40 hover:text-blue-primary">
              <Paperclip size={13} strokeWidth={2.2} />
              {uploading ? "Uploading…" : "Add a document or image"}
              <input
                type="file"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(event) => {
                  void attachFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          </div>

          {/* No Cancel: the X is already in the top right and Escape closes it
              (Anir, Aug 9: "we don't need a cancel button here, by the way,
              it's already in the top right"). */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={
                !featName.trim() ||
                featVersions.length === 0 ||
                // Editing with nothing changed → nothing to save (Anir,
                // Aug 18: "greyed out unless I change anything").
                (() => {
                  const original = featureModal
                    ? component.features.find((f) => f.id === featureModal)
                    : null;
                  if (!original) return false;
                  return (
                    featName.trim() === (original.name ?? "") &&
                    featFid.trim() === (original.fid ?? "") &&
                    featDesc.trim() === (original.description ?? "") &&
                    JSON.stringify(featVersions) ===
                      JSON.stringify(original.versionIds ?? []) &&
                    JSON.stringify(featFiles) ===
                      JSON.stringify(original.attachments ?? [])
                  );
                })()
              }
              loading={busy}
            >
              {featureModal === "" ? (
                <>
                  <Plus size={14} strokeWidth={2.2} /> Add feature
                </>
              ) : (
                <>
                  <Pencil size={14} strokeWidth={2} /> Save feature
                </>
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/** The upload rows: name, a real bar, and the percentage. Shared by both
 *  places in this screen that take a file, so a document and an image are
 *  reported identically (Anir, Aug 15). */
function UploadProgressRows({
  uploads,
}: {
  uploads: {
    id: string;
    name: string;
    percent: number;
    status: "uploading" | "done" | "error";
    error?: string;
  }[];
}) {
  if (uploads.length === 0) return null;
  return (
    <ul className="mb-2 space-y-1.5">
      {uploads.map((u) => (
        <li
          key={u.id}
          className="rounded-lg border border-border-light bg-white px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-text-primary">
              {u.name}
            </span>
            <span
              className={cn(
                "shrink-0 text-[11px] font-bold tnum",
                u.status === "error"
                  ? "text-error"
                  : u.status === "done"
                    ? "text-[color:#16A34A]"
                    : "text-blue-primary"
              )}
            >
              {u.status === "error"
                ? "Failed"
                : u.status === "done"
                  ? "Done"
                  : `${u.percent}%`}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-200",
                u.status === "error"
                  ? "bg-error"
                  : u.status === "done"
                    ? "bg-[color:#16A34A]"
                    : "bg-blue-primary"
              )}
              style={{ width: `${u.status === "error" ? 100 : u.percent}%` }}
            />
          </div>
          {u.error && (
            <p className="mt-1 text-[11.5px] leading-snug text-error">
              {u.error}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * THE DATE CHIP, AND THE POP-UP BEHIND IT.
 *
 * Third rewrite, and the last two reasons are worth keeping:
 *
 *  1. it lived inside the big row <button>, and an <input> inside a <button>
 *     is invalid HTML: the button swallowed the click.
 *  2. it was a real button calling showPicker() on an sr-only input.
 *     showPicker throws on an element the browser doesn't consider rendered,
 *     and the catch only set a flag — so on production the click did NOTHING
 *     AT ALL ("i cant edit the date here anywhere so fix it"). The visible
 *     native input that replaced it worked and looked like nothing else in the
 *     app ("I don't like the UI. Can you make it a custom pop-up?").
 *
 * So the chip opens the app's own dialog, and the dialog does three things the
 * browser's calendar never could (Anir, Aug 21): it takes a REASON, because
 * "they should give a reason why it changed" and a diff can recover what moved
 * but never why; it SHOWS this date's own history right there, because "when I
 * click on the date it should bring up a pop-up, and then maybe you show it
 * there as well"; and it only commits on Save, so a stray click on a square
 * cannot mint a version and mail everybody following this roadmap.
 */
function ReleaseDateChip({
  label,
  value,
  hasDate,
  versionLabel,
  disabled,
  history,
  onSave,
}: {
  label: string;
  value: string;
  hasDate: boolean;
  versionLabel: string;
  disabled?: boolean;
  /** Every past move of THIS version's date, newest first. */
  history: { at: string; by: string; line: string; reason?: string }[];
  onSave: (next: string, reason: string) => Promise<boolean> | boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setReason("");
  }, [open, value]);

  const moved = draft !== value;
  // A reason is asked for only when the date actually MOVES. Setting one for
  // the first time has nothing to explain — there was no promise to break.
  const needsReason = moved && hasDate && draft !== "";

  async function save() {
    if (saving) return;
    setSaving(true);
    const ok = await onSave(draft, reason);
    setSaving(false);
    if (ok) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={
          hasDate ? `Change the date on ${versionLabel}` : `Set a date for ${versionLabel}`
        }
        className={cn(
          /* A BORDER, SO IT READS AS A CONTROL (Anir, Aug 21: "oh i see it.
             but its not clear at all"). The date sat in the same borderless
             grey chip as "0 features" beside it, so the one thing on the row
             he can change looked exactly like the one thing he cannot. */
          "inline-flex cursor-pointer items-center gap-1 rounded-md border bg-white px-1.5 py-0.5 text-[11.5px] tnum transition-colors disabled:opacity-50",
          hasDate
            ? "border-border-light text-text-secondary hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary"
            : "border-dashed border-blue-subtle text-blue-primary hover:bg-blue-light/50"
        )}
      >
        <CalendarDays size={11} strokeWidth={2} />
        {label}
        <Pencil size={9.5} strokeWidth={2.4} className="opacity-45" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${versionLabel} — expected date`}
        stacked
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-text-primary">
              When is it expected?
            </p>
            <DateField
              value={draft}
              onChange={setDraft}
              ariaLabel={`Date for ${versionLabel}`}
              placeholder="Pick a date"
            />
            {/* Roadmap dates move — that is the premise, not a failure (Anir:
                "rule number one, all the dates are always variable in the
                roadmap"). Clearing one is a normal act, so it is a button and
                not something you have to know to do. */}
            {draft && (
              <button
                type="button"
                onClick={() => setDraft("")}
                className="mt-1.5 cursor-pointer text-[11.5px] font-medium text-text-tertiary transition-colors hover:text-[color:#DC2626]"
              >
                Clear the date
              </button>
            )}
          </div>

          {/* ALWAYS HERE, so the dialog is one size (Anir, Aug 21: "when I
              press the dropdown it changes the dimensions of it — just have a
              set dimension"). Showing this only once a date had moved made the
              box grow under the cursor at the exact moment somebody was
              reaching for Save. */}
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-text-primary">
              Why is it moving?
              {!needsReason && (
                <span className="ml-1 font-normal text-text-tertiary">optional</span>
              )}
            </p>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder="e.g. dev capacity slipped a sprint"
              className="h-9 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-subtle"
            />
            <p className="mt-1.5 text-[11.5px] leading-snug text-text-secondary">
              {needsReason && !reason.trim()
                ? "A date somebody already quoted to a customer needs a sentence before it moves."
                : "Sales quote these dates to customers. Whoever reads this later sees what it was, what it is now, and this sentence."}
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
              This date has moved {history.length === 1 ? "once" : `${history.length} times`}
            </p>
            {history.length === 0 ? (
              <p className="text-[12.5px] text-text-secondary">
                Never moved since it was set.
              </p>
            ) : (
              <ul className="max-h-[168px] space-y-2 overflow-y-auto pr-1">
                {history.map((entry, i) => (
                  <li
                    key={`${entry.at}-${i}`}
                    className="rounded-lg border border-border-light bg-surface px-2.5 py-2"
                  >
                    <p className="text-[12.5px] font-medium text-text-primary">
                      {entry.line}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-text-tertiary">
                      {entry.by} · {formatDate(entry.at.slice(0, 10))}
                    </p>
                    {entry.reason && (
                      <p className="mt-1 text-[12px] italic text-text-secondary">
                        &ldquo;{entry.reason}&rdquo;
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border-light pt-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void save()}
              loading={saving}
              disabled={!moved || (needsReason && !reason.trim())}
            >
              Save date
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
