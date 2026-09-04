"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Field, Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { SIZE_TIER_LABEL } from "@/lib/utils";
import type { Customer } from "@/lib/types";

/**
 * THE ACCOUNT'S EDIT PAGE, THE OFFERING WAY (Anir, Sep 4: "look at the
 * offering page. That is what it's supposed to be when I press edit. Copy
 * that everywhere on the customers page").
 *
 * An offering's detail is read-only and Edit walks you to its own page with a
 * form and one Save. This is that page for an account: the eight About facts,
 * saved together through the same PATCH the card's inline pencils used to
 * call one field at a time.
 */
const FIELDS = [
  ["company_name", "Company name"],
  ["website_url", "Website"],
  ["geography", "Locations"],
  ["customer_type", "Customer type"],
  ["ownership", "Ownership"],
  ["revenue", "Revenue"],
] as const;

export function CustomerEditForm({ customer }: { customer: Customer }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({
    company_name: customer.company_name ?? "",
    industry: customer.industry ?? "",
    size_tier: customer.size_tier ?? "",
    geography: customer.geography ?? "",
    website_url: customer.website_url ?? "",
    customer_type: customer.customer_type ?? "",
    ownership: customer.ownership ?? "",
    revenue: customer.revenue ?? "",
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  /* The one rule the API enforces too: an account cannot lose its name. */
  const problem = !draft.company_name.trim()
    ? "The account needs a name."
    : null;

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
    <Card className="max-w-[760px] p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.slice(0, 1).map(([k, label]) => (
          <div key={k} className="sm:col-span-2">
            <Field label={label}>
              <Input value={draft[k]} onChange={set(k)} />
            </Field>
          </div>
        ))}
        <Field label="Industry" hint="The word the industry chip wears, e.g. Pharmaceutical.">
          <Input value={draft.industry} onChange={set("industry")} />
        </Field>
        <Field label="Size">
          {/* The STORED words (small / mid / large) — the same list the card
              offered, because a select offering words the store never holds
              quietly rewrites a correct value to blank on save. */}
          <select
            value={draft.size_tier}
            onChange={set("size_tier")}
            className="h-11 w-full cursor-pointer rounded-md border border-border bg-surface px-3 text-[15px] text-text-primary outline-none transition focus:border-blue-primary focus:shadow-focus"
          >
            <option value="">Not set</option>
            {Object.entries(SIZE_TIER_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {FIELDS.slice(1).map(([k, label]) => (
          <Field key={k} label={label}>
            <Input value={draft[k]} onChange={set(k)} />
          </Field>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-border-light pt-4">
        {problem && (
          <span className="text-[12.5px] font-semibold text-[color:var(--ink-orange)]">
            {problem}
          </span>
        )}
        <button
          type="button"
          onClick={() => router.push(`/customers/${customer.id}`)}
          className="rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !!problem}
          onClick={save}
          className="rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Card>
  );
}
