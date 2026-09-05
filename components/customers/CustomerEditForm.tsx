"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, ChevronDown, Tags } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { industryMeta } from "@/components/ui/IndustryTag";
import { SIZE_TIER_META } from "@/components/ui/Badge";
import { SIZE_TIER_LABEL, cn } from "@/lib/utils";
import { tint } from "@/lib/tint";
import { countryOnlyGeography, flagForGeography } from "@/lib/countryFlags";
import type { Customer } from "@/lib/types";

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
  startOpen = true,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`${title.replace(/\s+/g, "-").toLowerCase()}-panel`}
        className="flex w-full cursor-pointer items-center gap-2.5 px-5 py-3.5 text-left transition-colors"
        style={{
          background: tint(ACCENT, 5),
          borderBottom: open ? "1px solid var(--border-light)" : "none",
        }}
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
  customer,
  customerTypes,
}: {
  customer: Customer;
  /** The admin-managed list (Offerings → Customer types). */
  customerTypes: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    company_name: customer.company_name ?? "",
    industry: customer.industry ?? "",
    size_tier: customer.size_tier ?? "",
    geography: customer.geography ?? "",
    website_url: customer.website_url ?? "",
    customer_type: customer.customer_type ?? "",
    ownership: customer.ownership ?? "",
    revenue: customer.revenue ?? "",
  });
  const set = (k: keyof typeof draft) => (v: string) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const dirty = Object.entries(draft).some(
    ([k, v]) => v !== ((customer as unknown as Record<string, string | null>)[k] ?? "")
  );
  const problem = !draft.company_name.trim() ? "The account needs a name." : null;
  const flag = flagForGeography(countryOnlyGeography(draft.geography));

  async function save() {
    setBusy(true);
    try {
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
              <Label text="Locations" />
              <span className="relative flex items-center">
                {flag && (
                  <span aria-hidden="true" className="pointer-events-none absolute left-3 text-[14px]">
                    {flag}
                  </span>
                )}
                <input
                  value={draft.geography}
                  onChange={(e) => set("geography")(e.target.value)}
                  className={cn(INPUT, flag && "pl-9")}
                  placeholder="e.g. Switzerland"
                  aria-label="Locations"
                />
              </span>
            </div>
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
                    onClick={() => set("industry")(on ? "" : name)}
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
              <input
                value={KNOWN_INDUSTRIES.includes(draft.industry) ? "" : draft.industry}
                onChange={(e) => set("industry")(e.target.value)}
                placeholder="or type another…"
                className={cn(INPUT, "w-[190px]")}
                aria-label="Another industry"
              />
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
              <input
                value={draft.revenue}
                onChange={(e) => set("revenue")(e.target.value)}
                className={INPUT}
                placeholder="e.g. $4.1B"
                aria-label="Revenue"
              />
            </div>
          </div>
        </Room>
      </div>

      {/* The offering edit page's footer: the page's state on the left, the
          two buttons on the right, riding the bottom of the window. */}
      <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-xl border border-border-light bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
        <span
          className={cn(
            "text-[12.5px]",
            problem ? "font-semibold text-[color:var(--ink-orange)]" : "text-text-tertiary"
          )}
        >
          {problem ?? (dirty ? "Changes not saved yet." : "Everything on this page is saved.")}
        </span>
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
    </div>
  );
}
