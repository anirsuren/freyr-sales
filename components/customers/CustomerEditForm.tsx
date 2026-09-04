"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Landmark, Tags } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Field, Input } from "@/components/ui/Input";
import { FormRoom } from "@/components/ui/FormRoom";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { AttributeTag } from "@/components/ui/AttributeTag";
import { industryMeta } from "@/components/ui/IndustryTag";
import { SIZE_TIER_META } from "@/components/ui/Badge";
import { SIZE_TIER_LABEL, cn } from "@/lib/utils";
import { countryOnlyGeography, flagForGeography } from "@/lib/countryFlags";
import type { Customer } from "@/lib/types";

/**
 * THE ACCOUNT'S EDIT PAGE, BUILT LIKE THE OTHER TWO (Anir, Sep 4, holding the
 * offering and deal edit pages side by side: "does it look the same as this?
 * Let's do better. It should look exactly like this, with all the pages as
 * dropdowns").
 *
 * So: the same FormRoom dropdowns those pages are made of — the first room
 * open, the rest folded — and the same sticky footer with the state of the
 * page on the left and Cancel / Save changes on the right. The first cut of
 * this page was a bare card of naked inputs, which is exactly the "grey box"
 * this app does not do.
 */
const KNOWN_INDUSTRIES = [
  "Pharmaceutical",
  "Biotechnology",
  "Medical Device",
  "Consumer Health",
];

export function CustomerEditForm({
  customer,
  customerTypes,
}: {
  customer: Customer;
  /** The admin-managed list (Offerings → Customer types), offered as
   *  suggestions — the field stays free-typeable. */
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
    <div className="max-w-[980px]">
      <div className="space-y-4">
        <FormRoom
          icon={Building2}
          title="Who they are"
          hint="The account's name and where to find them. The name is the one thing every deal, contract and meeting hangs off."
          defaultOpen
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Company name">
                <Input
                  value={draft.company_name}
                  onChange={(e) => set("company_name")(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Website" hint="Where their site lives — the intelligence briefing reads it.">
              <Input
                value={draft.website_url}
                onChange={(e) => set("website_url")(e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Field label="Locations" hint="Where they are headquartered or operate. One country shows its flag.">
              <span className="relative flex items-center">
                {flag && (
                  <span aria-hidden="true" className="pointer-events-none absolute left-3 text-[15px]">
                    {flag}
                  </span>
                )}
                <Input
                  value={draft.geography}
                  onChange={(e) => set("geography")(e.target.value)}
                  className={flag ? "pl-9" : undefined}
                  placeholder="e.g. Switzerland"
                />
              </span>
            </Field>
          </div>
        </FormRoom>

        <FormRoom
          icon={Tags}
          title="How they're classified"
          hint="The chips the account wears across the app — industry, size and customer type drive which offerings are recommended for it."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field
                label="Industry"
                hint="Pick one of the app's four, or type another — the chip takes the industry's own colour."
              >
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
                          "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                          on ? "border-transparent" : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                        )}
                        style={on ? { color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` } : undefined}
                      >
                        <Icon size={13} strokeWidth={2.2} />
                        {name}
                      </button>
                    );
                  })}
                  <Input
                    value={KNOWN_INDUSTRIES.includes(draft.industry) ? "" : draft.industry}
                    onChange={(e) => set("industry")(e.target.value)}
                    placeholder="or type another…"
                    className="h-9 w-[180px] text-[13px]"
                    aria-label="Another industry"
                  />
                  {/* Only a TYPED industry earns the preview chip — for the
                      four known ones the pressed chip already is the preview,
                      and showing it twice reads as two industries. */}
                  {draft.industry && !KNOWN_INDUSTRIES.includes(draft.industry) && (
                    <AttributeTag
                      value={draft.industry}
                      icon={industryMeta(draft.industry).icon}
                      label="Industry"
                      color={industryMeta(draft.industry).color}
                    />
                  )}
                </div>
              </Field>
            </div>
            <Field label="Size" hint="Small, mid-size or large — the same three words the size chip wears.">
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
            </Field>
            <Field
              label="Customer type"
              hint="The catalogue's own families (managed under Offerings → Customer types), offered as suggestions — anything can be typed."
            >
              <Input
                value={draft.customer_type}
                onChange={(e) => set("customer_type")(e.target.value)}
                list="customer-type-suggestions"
                placeholder="e.g. Pharmaceutical - Small"
              />
              <datalist id="customer-type-suggestions">
                {customerTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
          </div>
        </FormRoom>

        <FormRoom
          icon={Landmark}
          title="The business"
          hint="Who owns them and what they turn over — the two facts the account analysis fills in."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Ownership" hint="Public, private, PE-backed — however they are held.">
              <Input
                value={draft.ownership}
                onChange={(e) => set("ownership")(e.target.value)}
                list="ownership-suggestions"
                placeholder="e.g. Public"
              />
              <datalist id="ownership-suggestions">
                {["Public", "Private", "PE-backed", "Family-owned", "Government"].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Revenue" hint="Their reported annual revenue, as a figure people say — $4.1B, not a spreadsheet number.">
              <Input
                value={draft.revenue}
                onChange={(e) => set("revenue")(e.target.value)}
                placeholder="e.g. $4.1B"
              />
            </Field>
          </div>
        </FormRoom>
      </div>

      {/* THE SAME FOOTER THE OFFERING EDIT PAGE HAS: the page's state on the
          left, the two buttons on the right, riding the bottom of the window
          so Save never has to be scrolled to. */}
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
