"use client";

import { MapPin } from "lucide-react";
import { countryOptions } from "@/lib/countries";
import { AddressLineLookup } from "./CustomerLookups";
import {
  addressHasAny,
  addressIsComplete,
  blankAddress,
  type CustomerAddress,
} from "@/lib/customerProfilesShared";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Plus, Tags, Trash2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { industryMeta } from "@/components/ui/IndustryTag";
import { SIZE_TIER_META } from "@/components/ui/Badge";
import { SIZE_TIER_LABEL, cn } from "@/lib/utils";
import { tint } from "@/lib/tint";
import { countryOnlyGeography } from "@/lib/countryFlags";
import type { Customer } from "@/lib/types";
import { expandMoneyShorthand } from "@/lib/moneyShorthand";

/**
 * THE ACCOUNT'S EDIT PAGE, COPIED FROM THE DEAL'S (Anir, Sep 4, after two
 * misses: "copy edit offering or edit opportunity over to this and just
 * adjust based on what u gotta do. i dont know how more clear i can be").
 *
 * So the shell below IS DealOverviewEditor's section Card, classes and all:
 * the rounded-2xl card, the 3px accent rail drawn as a sibling so nothing can
 * chop it, the one-button header with the title and its sentence on one
 * baseline over a 5% wash, the chevron that lays flat when open, the panel
 * unmounted when folded. Same ACCENT, same Field, same INPUT classes. The
 * only things of mine are the fields inside the rooms.
 */
const ACCENT = "var(--ink-bright-blue)";

const INPUT =
  "h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] text-text-primary outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus";

const KNOWN_INDUSTRIES = [
  "Pharmaceutical",
  "Biotechnology",
  "Medical Device",
  "Consumer Health",
];

const OWNERSHIP_OPTIONS = [
  "Public",
  "Private",
  "PE-backed",
  "Family-owned",
  "Government",
];

function Room({
  icon: Icon,
  title,
  hint,
  headerAction,
  startOpen = true,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  headerAction?: React.ReactNode;
  startOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <section className="relative flex flex-col overflow-hidden rounded-2xl border border-border-light bg-white shadow-card">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[3px]"
        style={{ background: ACCENT }}
      />
      <div
        className="flex w-full items-center gap-2.5 px-5 py-3.5"
        style={{
          background: tint(ACCENT, 5),
          borderBottom: open ? "1px solid var(--border-light)" : "none",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={`${title.replace(/\s+/g, "-").toLowerCase()}-panel`}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-text-primary">
              <Icon size={15} strokeWidth={2} aria-hidden="true" style={{ color: ACCENT }} />
              {title}
            </span>
            <span className="text-[12.5px] text-text-secondary">{hint}</span>
          </span>
          <ChevronDown
            size={17}
            strokeWidth={2.2}
            aria-hidden="true"
            className={cn(
              "shrink-0 text-text-secondary transition-transform duration-200",
              !open && "-rotate-90"
            )}
          />
        </button>
        {headerAction}
      </div>
      {open && (
        <div
          id={`${title.replace(/\s+/g, "-").toLowerCase()}-panel`}
          className="flex flex-1 flex-col p-5"
        >
          {children}
        </div>
      )}
    </section>
  );
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-[13px] font-semibold text-text-primary">
      {text}
      {required && (
        <span aria-label="required" title="Required" className="ml-0.5 text-[color:var(--status-red)]">
          *
        </span>
      )}
    </label>
  );
}

export function CustomerEditForm({
  profile,
  customers = [],
  customer,
  customerTypes,
  mayDelete = false,
}: {
  customer: Customer;
  /** The admin-managed list (Offerings → Customer types). */
  customerTypes: string[];
  /** Deleting is the owner's right, decided on the server and passed in
   *  (Suren, Aug 29: "owner can create, member can edit"). Absent, the
   *  control simply is not drawn — the API refuses either way. */
  mayDelete?: boolean;
  /** The addresses and parent company (Manoj, Sep 10). */
  profile?: { hq?: CustomerAddress; other?: CustomerAddress; parentId?: string };
  /** Every other customer, for Parent company. */
  customers?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const startingRevenue = expandMoneyShorthand(customer.revenue ?? "", { integer: true });
  const [draft, setDraft] = useState({
    company_name: customer.company_name ?? "",
    industry: customer.industry ?? "",
    size_tier: customer.size_tier ?? "",
    geography: customer.geography ?? "",
    website_url: customer.website_url ?? "",
    customer_type: customer.customer_type ?? "",
    ownership: customer.ownership ?? "",
    revenue: startingRevenue,
  });
  const set = (k: keyof typeof draft) => (v: string) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const accountCountry = countryOnlyGeography(customer.geography ?? "");
  const startHq = {
    ...blankAddress(),
    ...(profile?.hq ?? {}),
    country: profile?.hq?.country || accountCountry,
  };
  const startOther = { ...blankAddress(), ...(profile?.other ?? {}) };
  const startParent = profile?.parentId ?? "NA";
  const [hq, setHq] = useState<CustomerAddress>(startHq);
  const [other, setOther] = useState<CustomerAddress>(startOther);
  const [parentId, setParentId] = useState(startParent);
  const initialIndustryIsCustom = Boolean(
    customer.industry && !KNOWN_INDUSTRIES.includes(customer.industry)
  );
  const [customIndustryOpen, setCustomIndustryOpen] = useState(false);
  const [customIndustryDraft, setCustomIndustryDraft] = useState(
    initialIndustryIsCustom ? (customer.industry ?? "") : ""
  );
  const customIndustryRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (customIndustryOpen) customIndustryRef.current?.focus();
  }, [customIndustryOpen]);

  const coreDirty = Object.entries(draft).some(([k, v]) => {
    const original =
      k === "revenue"
        ? startingRevenue
        : ((customer as unknown as Record<string, string | null>)[k] ?? "");
    return v !== original;
  });
  const profileDirty =
    JSON.stringify(hq) !== JSON.stringify(startHq) ||
    JSON.stringify(other) !== JSON.stringify(startOther) ||
    parentId !== startParent;
  const dirty = coreDirty || profileDirty;
  const problem = !draft.company_name.trim()
    ? "The account needs a name."
    : !addressIsComplete(hq)
      ? "Finish the required HQ address with line 1, a city and a country."
      : addressHasAny(other) && !addressIsComplete(other)
        ? "Finish the other address with line 1, a city and a country, or clear it."
        : null;
  const selectedCountry = countryOnlyGeography(draft.geography);
  const customIndustrySelected = Boolean(
    draft.industry && !KNOWN_INDUSTRIES.includes(draft.industry)
  );

  function confirmCustomIndustry() {
    const value = customIndustryDraft.trim();
    if (!value) return;
    set("industry")(value);
    setCustomIndustryDraft(value);
    setCustomIndustryOpen(false);
  }

  /**
   * DELETE THE ACCOUNT (Anir, Sep 6: "if I click into a customer and then I
   * press Edit Account, I should be able to delete it at the bottom, and
   * that's not a thing").
   *
   * Red, confirmed, and destructive-last: it sits at the far left of the save
   * bar so it can never be the button somebody reaches for on the way to
   * Save. The API refuses a delete the person may not do, and refuses one
   * that would orphan live deals — that message is shown as-is rather than
   * being reworded here, because it names what is in the way.
   */
  async function remove() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data?.error || "That did not delete.", "error");
        setDeleting(false);
        setConfirmDelete(false);
        return;
      }
      toast(`${customer.company_name} deleted.`, "success");
      router.push("/customers");
      router.refresh();
    } catch {
      toast("That did not delete.", "error");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      if (coreDirty) {
        const res = await fetch(`/api/customers/${customer.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(data?.error || "Could not save: try again", "error");
          return;
        }
      }
      if (profileDirty) {
        const res = await fetch(`/api/customers/${customer.id}/profile`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hq: addressHasAny(hq) ? hq : null,
            other: addressHasAny(other) ? other : null,
            parentId: parentId === "NA" ? "" : parentId,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(data?.error || "Could not save the addresses: try again", "error");
          return;
        }
      }
      toast("Account updated.");
      router.push(`/customers/${customer.id}`);
      router.refresh();
    } catch {
      toast("Could not save: try again", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="space-y-4">
        <Room
          icon={Building2}
          title="The account"
          hint="What it is called, where they are, and how to reach them."
          headerAction={
            dirty ? (
              <button
                type="button"
                disabled={busy || !!problem}
                onClick={save}
                title={problem ?? "Save the changes on this page"}
                className="shrink-0 rounded-lg bg-blue-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            ) : null
          }
        >
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label text="Company name" required />
              <input
                value={draft.company_name}
                onChange={(e) => set("company_name")(e.target.value)}
                className={INPUT}
                aria-label="Company name"
              />
            </div>
            <div>
              <Label text="Website" />
              <input
                value={draft.website_url}
                onChange={(e) => set("website_url")(e.target.value)}
                className={INPUT}
                placeholder="https://…"
                aria-label="Website"
              />
            </div>
            <div>
              <Label text="Country" />
              <ColorSelect
                value={selectedCountry}
                ariaLabel="Account country"
                className="w-full"
                collapsible={false}
                fill
                searchable
                onChange={(country) => {
                  set("geography")(country);
                  setHq((address) => ({ ...address, country }));
                }}
                options={[{ value: "", label: "Choose country", noMark: true }, ...countryOptions()]}
              />
            </div>
          </div>
        </Room>

        <Room
          icon={MapPin}
          title="Addresses and parent company"
          hint="Where they are headquartered, a second office if there is one, and the customer they belong to."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(
              [
                ["HQ address", hq, setHq, true],
                ["Other address", other, setOther, false],
              ] as const
            ).map(([title, value, setValue, required]) => (
              <fieldset key={title} aria-required={required} className="rounded-xl border border-border-light p-3.5">
                <legend className="px-1 text-[12.5px] font-semibold text-text-primary">
                  {title}
                  {required && (
                    <span aria-label="required" title="Required" className="ml-0.5 text-[color:var(--status-red)]">
                      *
                    </span>
                  )}
                </legend>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <ColorSelect
                    value={value.country}
                    ariaLabel={`${title} country`}
                    className="w-full sm:col-span-3"
                    collapsible={false}
                    fill
                    searchable
                    onChange={(v) => setValue({ ...value, country: v })}
                    options={[{ value: "", label: "Choose country", noMark: true }, ...countryOptions()]}
                  />
                  <AddressLineLookup title={title} value={value} country={value.country} onChange={setValue} inputClassName={INPUT} className="sm:col-span-3" />
                  <input className={cn(INPUT, "sm:col-span-3")} placeholder="Line 2" aria-label={`${title} line 2`} value={value.line2 ?? ""} onChange={(e) => setValue({ ...value, line2: e.target.value })} />
                  <input className={INPUT} placeholder="City" aria-label={`${title} city`} value={value.city} onChange={(e) => setValue({ ...value, city: e.target.value })} />
                  <input className={INPUT} placeholder="State" aria-label={`${title} state`} value={value.state ?? ""} onChange={(e) => setValue({ ...value, state: e.target.value })} />
                  <input className={INPUT} placeholder="ZIP" aria-label={`${title} ZIP`} value={value.zip ?? ""} onChange={(e) => setValue({ ...value, zip: e.target.value })} />
                </div>
              </fieldset>
            ))}
          </div>
          <div className="mt-4 max-w-[420px]">
            <Label text="Parent company" />
            <ColorSelect
              value={parentId}
              ariaLabel="Parent company"
              className="w-full"
              collapsible={false}
              fill
              searchable
              onChange={setParentId}
              options={[
                { value: "NA", label: "NA", color: "#C7CDD6" },
                ...[...customers]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => ({ value: c.id, label: c.name, logoName: c.name })),
              ]}
            />
          </div>
        </Room>

        <Room
          icon={Tags}
          title="How they're classified"
          hint="The chips the account wears across the app — they drive which offerings are recommended for it."
        >
          <div className="mb-4">
            <Label text="Industry" />
            <div className="flex flex-wrap items-center gap-2">
              {KNOWN_INDUSTRIES.map((name) => {
                const meta = industryMeta(name);
                const on = draft.industry === name;
                const Icon = meta.icon;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      set("industry")(on ? "" : name);
                      setCustomIndustryOpen(false);
                      setCustomIndustryDraft("");
                    }}
                    aria-pressed={on}
                    className={cn(
                      "inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 text-[13px] font-semibold transition-colors",
                      on
                        ? "border-transparent"
                        : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                    )}
                    style={on ? { color: meta.color, background: tint(meta.color, 12) } : undefined}
                  >
                    <Icon size={14} strokeWidth={2.2} />
                    {name}
                  </button>
                );
              })}
              {customIndustrySelected && !customIndustryOpen ? (
                <span
                  className="inline-flex h-10 items-center overflow-hidden rounded-lg border border-blue-subtle bg-blue-light text-[13px] font-semibold text-blue-primary"
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5 pl-3.5 pr-2">
                    {(() => {
                      const Icon = industryMeta(draft.industry).icon;
                      return <Icon size={14} strokeWidth={2.2} className="shrink-0" />;
                    })()}
                    <span className="max-w-[220px] truncate">{draft.industry}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      set("industry")("");
                      setCustomIndustryDraft("");
                    }}
                    aria-label={`Remove ${draft.industry} industry`}
                    className="inline-flex h-full w-9 shrink-0 items-center justify-center border-l border-blue-subtle text-blue-primary transition-colors hover:bg-blue-subtle/40"
                  >
                    <X size={14} strokeWidth={2.2} />
                  </button>
                </span>
              ) : customIndustryOpen ? (
                <span className="flex w-[300px] items-center gap-1.5">
                  <input
                    ref={customIndustryRef}
                    value={customIndustryDraft}
                    onChange={(e) => setCustomIndustryDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        confirmCustomIndustry();
                      }
                      if (e.key === "Escape") {
                        setCustomIndustryDraft("");
                        setCustomIndustryOpen(false);
                      }
                    }}
                    placeholder="Enter an industry"
                    className={INPUT}
                    aria-label="Custom industry"
                  />
                  <button
                    type="button"
                    disabled={!customIndustryDraft.trim()}
                    onClick={confirmCustomIndustry}
                    aria-label="Confirm custom industry"
                    title="Use this industry"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-primary text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Check size={16} strokeWidth={2.4} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomIndustryDraft("");
                      setCustomIndustryOpen(false);
                    }}
                    aria-label="Cancel custom industry"
                    title="Cancel"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-light bg-white text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary"
                  >
                    <X size={14} strokeWidth={2.2} />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setCustomIndustryDraft("");
                    setCustomIndustryOpen(true);
                  }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-border-light px-3.5 text-[13px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                >
                  <Plus size={14} strokeWidth={2.2} />
                  Custom industry
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-4">
            <div>
              <Label text="Size" />
              <ColorSelect
                value={draft.size_tier}
                onChange={set("size_tier")}
                ariaLabel="Company size"
                options={[
                  { value: "", label: "Not set" },
                  ...Object.entries(SIZE_TIER_LABEL).map(([value, label]) => ({
                    value,
                    label,
                    color: SIZE_TIER_META[value]?.color,
                    icon: SIZE_TIER_META[value]?.icon,
                  })),
                ]}
              />
            </div>
            <div>
              <Label text="Customer type" />
              {/* The app's own dropdown, NOT a datalist (Anir, Sep 4: "why is
                  the dropdown like this") — the browser's native suggestion
                  popup matched nothing else on the page. The list is the
                  admin-managed catalogue; Not set stays a choice. */}
              <ColorSelect
                value={draft.customer_type}
                onChange={set("customer_type")}
                ariaLabel="Customer type"
                /* One colour per FAMILY, not one blue for all. industryMeta
                   only knows the four industries, and the catalogue's family
                   words ("Pharmaceuticals", "Biologics") miss its keys — so
                   every row fell back to the same blue dot, which is exactly
                   the coloured-dot-that-tells-you-nothing look. The palette
                   cycles per distinct family, so the three Pharmaceuticals
                   rows share a hue and Biologics visibly changes. */
                options={[
                  { value: "", label: "Not set" },
                  ...(() => {
                    const FAMILY_PALETTE = [
                      "var(--ink-bright-blue)",
                      "var(--ink-violet-soft)",
                      "var(--ink-teal-deep)",
                      "var(--ink-orange)",
                      "#DB2777",
                      "#0891B2",
                      "#475569",
                    ];
                    const familyColor = new Map<string, string>();
                    return customerTypes.map((name) => {
                      const family = name.split(" - ")[0] ?? name;
                      if (!familyColor.has(family))
                        familyColor.set(
                          family,
                          FAMILY_PALETTE[familyColor.size % FAMILY_PALETTE.length]
                        );
                      return { value: name, label: name, color: familyColor.get(family) };
                    });
                  })(),
                ]}
              />
            </div>
            <div>
              <Label text="Ownership" />
              <ColorSelect
                value={draft.ownership}
                onChange={set("ownership")}
                ariaLabel="Ownership"
                options={[
                  { value: "", label: "Not set" },
                  ...OWNERSHIP_OPTIONS.map((name, i) => ({
                    value: name,
                    label: name,
                    color: [
                      "var(--ink-bright-blue)",
                      "var(--ink-violet-soft)",
                      "var(--ink-teal-deep)",
                      "var(--ink-orange)",
                      "#475569",
                    ][i],
                  })),
                ]}
              />
            </div>
            <div>
              <Label text="Revenue" />
              <MoneyInput
                value={draft.revenue}
                onChange={set("revenue")}
                className="h-10 text-[13px] font-normal focus:shadow-input-focus"
                placeholder="e.g. 337,000,000"
                ariaLabel="Revenue"
              />
            </div>
          </div>
        </Room>
      </div>

      {/* The offering edit page's footer: the page's state on the left, the
          two buttons on the right, riding the bottom of the window. */}
      <div
        data-agent-dock-clearance
        className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-light bg-white/95 py-3 pl-4 pr-4 shadow-card backdrop-blur"
      >
        <span
          className={cn(
            "text-[12.5px]",
            problem ? "font-semibold text-[color:var(--ink-orange)]" : "text-text-tertiary"
          )}
        >
          {problem ?? (dirty ? "Changes not saved yet." : "Everything on this page is saved.")}
        </span>
        {mayDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={busy || deleting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-error/30 px-3.5 py-2 text-[13px] font-semibold text-error transition-colors hover:bg-error/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 size={14} strokeWidth={2.2} />
            Delete account
          </button>
        )}
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/customers/${customer.id}`)}
            className="rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !!problem || !dirty}
            onClick={save}
            className="rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </span>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={`Delete ${customer.company_name}?`}
        body="The account and its contacts are removed. This cannot be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete account"}
        tone="destructive"
      />
    </div>
  );
}
