"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
  Rocket,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  ColorSelect,
  MultiColorSelect,
  type ColorOption,
} from "@/components/ui/ColorSelect";
import { InfoHint } from "@/components/ui/InfoHint";
import { Tooltip } from "@/components/ui/Tooltip";
import { ScrollHint } from "@/components/ui/ScrollHint";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import { downloadDocx } from "@/lib/docx";

/** An imported row whose sheet cell had a date but no version number. */
const MONTH_ONLY = /^[A-Za-z]{3}'\d{2}$/;
import type {
  FdlComponent,
  FdlFeature,
  FdlFeatureAttachment,
  FdlRelease,
} from "@/lib/offerings";
import { FdlTypeChip, fdlCurrentVersion } from "@/components/fdl/FdlComponentsBrowser";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
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
function CustomerDots({
  people,
  max = 6,
  note,
}: {
  people: { id: string; name: string }[];
  max?: number;
  note?: (person: { id: string; name: string }) => string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  if (people.length === 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[11.5px] text-text-secondary">
        <Building2 size={11} strokeWidth={2} className="text-text-tertiary" />
        Nobody yet
      </span>
    );
  const visible = people.slice(0, max);
  const hidden = people.length - visible.length;
  return (
    <span
      className="inline-flex items-center rounded-lg px-1 py-0.5 transition-colors duration-200 hover:bg-surface focus-within:bg-surface"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setExpanded(false);
      }}
    >
      {visible.map((person, i) => (
        <span
          key={person.id}
          className="relative inline-flex transition-[margin,transform] duration-200 ease-out"
          style={{
            marginLeft: i === 0 ? 0 : expanded ? 4 : -8,
            zIndex: expanded ? visible.length - i : i + 1,
          }}
        >
          <HoverCard
            width={230}
            anchor="trigger"
            content={
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-light bg-white">
                  <CompanyLogo name={person.name} className="h-6 w-6 object-contain" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-text-primary">
                    {person.name}
                  </span>
                  {note?.(person) && (
                    <span className="block text-[11.5px] text-text-secondary">
                      {note(person)}
                    </span>
                  )}
                </span>
              </div>
            }
          >
            <span className="flex h-7 w-7 cursor-default items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-white transition-transform duration-150 hover:scale-110">
              <CompanyLogo name={person.name} className="h-5 w-5 object-contain" />
            </span>
          </HoverCard>
        </span>
      ))}
      {hidden > 0 && (
        <span
          className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface text-[10.5px] font-bold text-text-secondary ring-2 ring-white transition-[margin] duration-200 ease-out tnum"
          style={{ marginLeft: expanded ? 4 : -8 }}
        >
          +{hidden}
        </span>
      )}
    </span>
  );
}

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
  const [customerView, setCustomerView] = useState<"grid" | "table">("grid");

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
    label: release.current ? `${release.version} (current)` : release.version,
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

  async function markCurrent(id: string) {
    const next = component.releases.map((r) => ({ ...r, current: r.id === id }));
    await patch({ releases: next }, "Current version updated.");
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
  const [featName, setFeatName] = useState("");
  const [featFid, setFeatFid] = useState("");
  const [featDesc, setFeatDesc] = useState("");
  const [featVersions, setFeatVersions] = useState<string[]>([]);
  const [featFiles, setFeatFiles] = useState<FdlFeatureAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [confirmFeatureDelete, setConfirmFeatureDelete] = useState<string | null>(null);

  /** Send the picked files to storage, then hold the returned URLs on the
   *  form until Save writes them onto the feature. */
  async function attachFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 5)) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch(`/api/fdl-components/${component.id}/upload`, {
          method: "POST",
          body,
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Could not upload that file.");
        setFeatFiles((prev) => [...prev, payload.attachment]);
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

  function openFeatureModal(feature?: FdlFeature) {
    setFeatureModal(feature ? feature.id : "");
    setFeatName(feature?.name ?? "");
    setFeatFid(feature?.fid ?? "");
    setFeatDesc(feature?.description ?? "");
    setFeatVersions(feature?.versionIds ?? releases.map((r) => r.id));
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
    if (!featName.trim()) return;
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
  const [compareIds, setCompareIds] = useState<string[]>(() =>
    releases.slice(-2).map((r) => r.id)
  );
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
      `${component.name} ${release.version}: features`,
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

  return (
    <div className="space-y-5">
      {/* -------------------------------------------------------- header */}
      <div>
        <Link
          href="/components"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
        >
          <ArrowLeft size={13} strokeWidth={2.2} /> All components
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <OfferingIcon name={component.name} className="h-10 w-10 shrink-0" />
          <h1 className="text-[22px] font-bold text-text-primary">{component.name}</h1>
          <FdlTypeChip type={component.type} />
          {current && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(0,113,227,0.25)] bg-[rgba(0,113,227,0.08)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[color:#0040A0]">
              <Rocket size={11} strokeWidth={2.2} /> Current {current}
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
        <p className="mt-1 text-[12.5px] text-text-secondary">
          {homes.length > 0 ? (
            <>
              Part of{" "}
              {homes.map((h, i) => (
                <span key={h.id}>
                  {i > 0 && ", "}
                  <Link href={`/offerings/${h.id}`} className="font-medium text-blue-primary hover:underline">
                    {h.name}
                  </Link>
                </span>
              ))}
              .
            </>
          ) : (
            "Not connected to an offering yet."
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setPickedOfferings(
                  offerings.filter((o) => o.connected).map((o) => o.id)
                );
                setAddingOffering(true);
              }}
              className="ml-1.5 cursor-pointer font-semibold text-blue-primary hover:underline"
            >
              Add to an offering
            </button>
          )}
        </p>
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
            <div className="flex justify-end gap-2">
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
                    {release.version}
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
          <ScrollHint className="max-h-72">
            <ul className="space-y-1.5">
              {offerings.map((offering) => {
                const active = pickedOfferings.includes(offering.id);
                return (
                  <li key={offering.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setPickedOfferings((prev) =>
                          active
                            ? prev.filter((x) => x !== offering.id)
                            : [...prev, offering.id]
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
                      <OfferingIcon name={offering.name} className="h-7 w-7 shrink-0" />
                      <span className="min-w-0 flex-1 text-[13px] font-medium text-text-primary">
                        {offering.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollHint>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddingOffering(false)}
              disabled={busy}
            >
              <X size={14} strokeWidth={2} /> Cancel
            </Button>
            <Button type="submit" loading={busy}>
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
          {canEdit && (
            <Button onClick={() => setAddingVersion(true)}>
              <Plus size={14} strokeWidth={2.2} /> Add version
            </Button>
          )}
        </div>
        {releases.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-text-secondary">
            No versions yet. Add the first one, then list its features below.
          </p>
        ) : (
          // ONE CARD PER VERSION. A divided list of text rows made every
          // version look like the same sentence repeated, with the open panel
          // a flat grey box hanging under it (Anir, Aug 8: "revamp this… it
          // just looks really ugly"). Each version is now its own card with a
          // status-coloured rail, the number as the headline, and its facts as
          // chips — so you can tell the released one from the planned one
          // without reading.
          <div className="mt-3.5 space-y-2.5">
            {releases.map((release, releaseIndex) => {
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
              const open = openVersions.has(release.id);
              const shipped = release.status === "released";
              const accent = shipped ? "#1A7A35" : "#6D28D9";
              return (
                <div
                  key={release.id}
                  className={`entry-card relative overflow-hidden pl-[3px] transition-shadow ${
                    open ? "shadow-[0_6px_20px_rgba(16,24,40,0.08)]" : ""
                  }`}
                >
                  {/* The rail says released-or-planned before a word is read. */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-[3px]"
                    style={{ background: accent }}
                  />
                  <div className="flex items-center gap-3 px-3.5 py-3">
                    {/* THE WHOLE ROW OPENS THE VERSION — what is in it and who
                        is on it, with its own download (Suren, Aug 8: "for
                        version 4, when it clicks, give those features for
                        version 4 and then download"). */}
                    <button
                      type="button"
                      onClick={() => toggleVersion(release.id)}
                      aria-expanded={open}
                      aria-label={`${open ? "Hide" : "Show"} what is in ${release.version}`}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                    >
                      <ChevronRight
                        size={15}
                        strokeWidth={2.2}
                        className={`shrink-0 text-text-tertiary transition-transform ${
                          open ? "rotate-90 text-blue-primary" : ""
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[16px] font-semibold leading-tight tracking-[-0.01em] text-text-primary">
                            {MONTH_ONLY.test(release.version)
                              ? "No version number recorded"
                              : release.version}
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
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-primary px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.03em] text-white">
                              <Check size={10} strokeWidth={3} /> Current
                            </span>
                          )}
                        </span>
                        {/* Facts as chips, not a run-on grey sentence. */}
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[11.5px] text-text-secondary tnum">
                            <CalendarDays size={11} strokeWidth={2} className="text-text-tertiary" />
                            {release.date ? formatDate(release.date) : "Date not set"}
                          </span>
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
                                  In {release.version}
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
                          <CustomerDots
                            people={versionCustomers}
                            note={() => `On ${release.version}`}
                          />
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
                      <span className="ml-4 hidden min-w-0 flex-1 items-center gap-3 lg:flex">
                        {/* Always a sentence, never a blank. "Nothing new"
                            is itself the answer a seller needs when a customer
                            asks whether an upgrade is worth scheduling. */}
                        <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-text-secondary">
                          <Sparkles
                            size={11}
                            strokeWidth={2.2}
                            className="shrink-0"
                            style={{ color: accent }}
                          />
                          <span className="truncate">
                            {addedHere.length > 0 ? (
                              <>
                                <span className="font-semibold text-text-primary">
                                  {previous ? "New here: " : "Launched with: "}
                                </span>
                                {addedHere.map((f) => f.name).join(", ")}
                              </>
                            ) : versionFeatures.length === 0 ? (
                              "No features listed on this version yet"
                            ) : (
                              <>
                                <span className="font-semibold text-text-primary">
                                  Nothing new:{" "}
                                </span>
                                same features as {previous?.version}
                              </>
                            )}
                          </span>
                        </span>
                        {connected.length > 0 && (
                          <span className="ml-auto flex shrink-0 items-center gap-2">
                            <span className="h-1.5 w-[72px] overflow-hidden rounded-full bg-surface">
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
                            <span className="text-[11px] font-semibold text-text-secondary tnum">
                              {versionCustomers.length} of {connected.length} on this
                            </span>
                          </span>
                        )}
                      </span>
                    </button>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      {!release.current && canEdit && shipped && (
                        <button
                          type="button"
                          onClick={() => void markCurrent(release.id)}
                          disabled={busy}
                          className="cursor-pointer rounded-lg border border-border-light px-2 py-1 text-[11px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                        >
                          Mark current
                        </button>
                      )}
                      <button
                        type="button"
                        title={`Download the ${release.version} feature sheet`}
                        aria-label={`Download the ${release.version} feature sheet`}
                        onClick={() => downloadVersionSheet(release)}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                      >
                        <Download size={14} strokeWidth={2} />
                      </button>
                      {canEdit &&
                        (confirmReleaseDelete === release.id ? (
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void removeRelease(release.id)}
                              className="cursor-pointer rounded-lg bg-error/10 px-2 py-1 text-[11px] font-semibold text-error hover:bg-error/20"
                            >
                              Remove?
                            </button>
                            <button
                              type="button"
                              aria-label="Keep this version"
                              onClick={() => setConfirmReleaseDelete(null)}
                              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-tertiary hover:bg-surface"
                            >
                              <X size={13} strokeWidth={2} />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Remove ${release.version}`}
                            onClick={() => setConfirmReleaseDelete(release.id)}
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-error transition-colors hover:bg-error/10"
                          >
                            <Trash2 size={14} strokeWidth={2} />
                          </button>
                        ))}
                    </span>
                  </div>

                  {open && (
                    <div className="menu-in border-t border-border-light bg-surface/50 px-3.5 py-3.5">
                      <div className="grid items-start gap-3 md:grid-cols-2">
                        {/* Two equal white panels. The old layout put the
                            button under a short list and left the other half
                            empty, so the two halves never looked related. */}
                        <div className="rounded-xl border border-border-light bg-white p-3.5">
                          <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            <ListChecks size={12} strokeWidth={2.2} className="text-blue-primary" />
                            What is in {release.version}
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
                        <div className="rounded-xl border border-border-light bg-white p-3.5">
                          <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            <Building2 size={12} strokeWidth={2.2} className="text-blue-primary" />
                            Customers on {release.version}
                            <span className="ml-auto font-bold tnum">
                              {versionCustomers.length}
                            </span>
                          </p>
                          {versionCustomers.length === 0 ? (
                            <p className="text-[12.5px] text-text-secondary">
                              Nobody is recorded on this version yet.
                            </p>
                          ) : (
                            <ScrollHint className="max-h-[220px] pr-1">
                            <ul className="space-y-1">
                              {versionCustomers.map((customer) => (
                                <li key={customer.id}>
                                  <Link
                                    href={`/customers/${customer.id}?tab=components`}
                                    className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[12.5px] font-medium text-text-primary transition-colors hover:bg-blue-light hover:text-blue-primary"
                                  >
                                    <CompanyLogo name={customer.name} className="h-5 w-5 shrink-0" />
                                    {customer.name}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                            </ScrollHint>
                          )}
                          {/* Add them ONTO THE VERSION you are reading. This is
                              where Suren was standing when the header button
                              filed his customer under the current release
                              instead of this one. */}
                          {canEdit && unconnected.length > 0 && (
                            <button
                              type="button"
                              onClick={() => openAddCustomers(release.id)}
                              className="mt-2.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:bg-blue-light/40 hover:text-blue-primary"
                            >
                              <Plus size={13} strokeWidth={2.4} />
                              Add a customer on {release.version}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- features */}
      <section className={CARD}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <ListChecks size={15} strokeWidth={2} className="text-blue-primary" /> Features
            <InfoHint text="What is in one version. Pick the version above the table. To compare two versions side by side, use the Compare versions card lower down." />
          </h2>
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
        {releases.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-text-secondary">
              Showing what is in
            </span>
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
          </div>
        )}

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
                  <th className="py-2 pr-4">Feature</th>
                  <th className="py-2 pr-4">In versions</th>
                  <th className="py-2 pr-4">Customers on it</th>
                  <th className="py-2 pr-4">Files</th>
                  {canEdit && <th className="py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {shownFeatures.map((feature) => (
                  <tr key={feature.id}>
                    <td className="py-2.5 pr-4">
                      <button
                        type="button"
                        onClick={() => setReadingFeature(feature)}
                        className="group/f w-full cursor-pointer text-left"
                      >
                        <p className="text-[13px] font-semibold text-text-primary group-hover/f:text-blue-primary">
                          {feature.fid && (
                            <span className="mr-1.5 inline-flex rounded border border-[rgba(0,113,227,0.25)] bg-[rgba(0,113,227,0.08)] px-1 py-0.5 align-middle text-[10px] font-bold tracking-[0.03em] text-[color:#0040A0] tnum">
                              {feature.fid}
                            </span>
                          )}
                          {feature.name}
                        </p>
                        {feature.description && (
                          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-text-secondary">
                            {feature.description}
                          </p>
                        )}
                      </button>
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
                              ? `From ${inThem[0].version} onward`
                              : `${inThem.length} of ${releases.length} versions`;
                        return (
                          <HoverCard
                            width={230}
                            anchor="trigger"
                            content={
                              <div>
                                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                                  In these versions
                                </p>
                                <ul className="space-y-1">
                                  {inThem.map((r) => (
                                    <li
                                      key={r.id}
                                      className="flex items-center gap-2 text-[12.5px] text-text-primary"
                                    >
                                      <Check
                                        size={12}
                                        strokeWidth={2.6}
                                        className="shrink-0 text-[color:#1A7A35]"
                                      />
                                      <span className="tnum">{r.version}</span>
                                      {r.current && (
                                        <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.04em] text-blue-primary">
                                          current
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
                              return rel ? `On ${rel.version}` : undefined;
                            }}
                          />
                        );
                      })()}
                    </td>
                    <td className="py-2.5 pr-4">
                      {(feature.attachments ?? []).length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-text-secondary">
                          <Paperclip size={11} strokeWidth={2.4} />
                          {(feature.attachments ?? []).length}
                        </span>
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
                            onClick={() => openFeatureModal(feature)}
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                          >
                            <Pencil size={13} strokeWidth={2} />
                          </button>
                          {confirmFeatureDelete === feature.id ? (
                            <button
                              type="button"
                              onClick={() => void removeFeature(feature.id)}
                              className="cursor-pointer rounded-lg bg-error/10 px-2 py-1 text-[11px] font-semibold text-error hover:bg-error/20"
                            >
                              Remove?
                            </button>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Remove ${feature.name}`}
                              onClick={() => setConfirmFeatureDelete(feature.id)}
                              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-error/10 hover:text-error"
                            >
                              <Trash2 size={13} strokeWidth={2} />
                            </button>
                          )}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
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
              <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
                <button
                  type="button"
                  onClick={() => setCustomerView("grid")}
                  aria-label="Card view"
                  title="Card view"
                  aria-pressed={customerView === "grid"}
                  className={`cursor-pointer p-2 transition-colors ${
                    customerView === "grid"
                      ? "bg-blue-light text-blue-primary"
                      : "text-text-secondary hover:bg-surface"
                  }`}
                >
                  <LayoutGrid size={16} strokeWidth={1.6} />
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerView("table")}
                  aria-label="Table view"
                  title="Table view"
                  aria-pressed={customerView === "table"}
                  className={`cursor-pointer border-l border-border p-2 transition-colors ${
                    customerView === "table"
                      ? "bg-blue-light text-blue-primary"
                      : "text-text-secondary hover:bg-surface"
                  }`}
                >
                  <Table2 size={16} strokeWidth={1.6} />
                </button>
              </div>
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
                            {release ? release.version : "Not set yet"}
                          </span>
                          <span className="mt-1.5 block text-[11.5px] leading-tight text-text-tertiary">
                            {next ? `Next: ${next.version}` : "No next version planned"}
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
                    <tr className="border-b border-border-light text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      <th className="py-2 pr-4">Customer</th>
                      <th className="py-2 pr-4">Current version</th>
                      <th className="py-2 pr-4">Next version</th>
                      <th className="py-2 pr-4">Upgrade status</th>
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
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-light px-2.5 py-1 text-[12px] font-semibold text-text-primary tnum">
                              {release ? release.version : "Not set yet"}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-[12.5px] text-text-secondary tnum">
                            {next ? next.version : "Not planned"}
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
                      .map((r) => r.version)
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
                          {r.version}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {compareRows.map((feature) => (
                      <tr key={feature.id}>
                        <td className="sticky left-0 z-10 min-w-[220px] bg-white py-2.5 pr-4 text-[13px] font-medium text-text-primary">
                          {feature.name}
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRenaming(false)} disabled={busy}>
              <X size={14} strokeWidth={2} /> Cancel
            </Button>
            <Button type="submit" disabled={!nameDraft.trim()} loading={busy}>
              <Pencil size={14} strokeWidth={2} /> Save name
            </Button>
          </div>
        </form>
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
              <input
                autoFocus
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="V2.1"
                className={FIELD}
              />
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
              <Button type="button" variant="secondary" onClick={() => setAddingVersion(false)} disabled={busy}>
                <X size={14} strokeWidth={2} /> Cancel
              </Button>
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
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddingCustomers(false)}
              disabled={busy}
            >
              <X size={14} strokeWidth={2} /> Cancel
            </Button>
            <Button type="submit" disabled={!pickedCustomers.length} loading={busy}>
              <Plus size={14} strokeWidth={2.2} /> Add customer
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={featureModal !== null}
        onClose={() => setFeatureModal(null)}
        title={featureModal === "" ? "Add a feature" : "Edit feature"}
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
            <label className="mb-1 block text-[12px] font-medium text-text-primary">
              Available in which versions?
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
                    {release.version}
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

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setFeatureModal(null)} disabled={busy}>
              <X size={14} strokeWidth={2} /> Cancel
            </Button>
            <Button type="submit" disabled={!featName.trim()} loading={busy}>
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
