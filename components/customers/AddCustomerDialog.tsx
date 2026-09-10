"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, MapPin, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { InfoHint } from "@/components/ui/InfoHint";
import { useToast } from "@/components/ui/Toast";
import { countryOptions } from "@/lib/countries";
import {
  addressHasAny,
  addressIsComplete,
  blankAddress,
  type CustomerAddress,
} from "@/lib/customerProfilesShared";
import { cn } from "@/lib/utils";

/**
 * ADD A CUSTOMER, WITH THE FIELDS MANOJ LISTED (Sep 10): "Customer Name*,
 * Website*, HQ Address* (Line 1, Line 2, City, State, Country, ZIP), Address
 * Other (Line 1, Line 2, City, State, Country, ZIP), Parent Company (drop-down
 * of all Customers, and NA), Owner* (drop-down of all BD members), Customer
 * Group*". The Customer ID is made on save ("Customer ID for every Customer to
 * be system generated").
 *
 * The button stays off until the form can work, and what is still missing is
 * said under it. The HQ address needs line 1, a city and a country; state and
 * ZIP do not exist everywhere, so they are optional. The other address is
 * optional, but once started it has to be finished or cleared.
 */
export type AddCustomerOwner = { id: string | null; name: string; role: string };
export type AddCustomerGroup = { id: string; name: string; color: string };

const NEW_GROUP = "__new_group__";

const INPUT =
  "h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] text-text-primary outline-none transition-shadow placeholder:text-text-tertiary focus:border-blue-subtle focus:shadow-input-focus";

/** The domain someone typed, or null when it is not a website. */
function websiteHost(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  let host = "";
  try {
    host = new URL(text.includes("://") ? text : `https://${text}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./i, "").toLowerCase();
  if (/(^|\.)linkedin\.com$/.test(host)) return null;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) ? host : null;
}

function Label({ text, required = false, hint }: { text: string; required?: boolean; hint?: string }) {
  return (
    <span className="mb-1.5 flex items-center gap-1 text-[12.5px] font-semibold text-text-primary">
      {text}
      {required && (
        <span className="text-[color:#DC2626]" aria-hidden="true">
          *
        </span>
      )}
      {hint && <InfoHint text={hint} />}
    </span>
  );
}

export function AddCustomerDialog({
  open,
  onClose,
  customers,
  owners,
  groups,
  viewer,
}: {
  open: boolean;
  onClose: () => void;
  /** Every customer, for Parent Company and the duplicate-name check. */
  customers: { id: string; name: string }[];
  /** The BD members who can own an account. */
  owners: AddCustomerOwner[];
  groups: AddCustomerGroup[];
  /** Who is adding: a BD Member may only make themselves the owner. */
  viewer: { name: string; role: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const selfOnly = viewer.role === "bd_member";
  const self = owners.find((o) => o.name.trim().toLowerCase() === viewer.name.trim().toLowerCase());
  const ownerChoices = selfOnly ? (self ? [self] : []) : owners;

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [hq, setHq] = useState<CustomerAddress>(blankAddress());
  const [other, setOther] = useState<CustomerAddress>(blankAddress());
  const [parentId, setParentId] = useState("NA");
  const [owner, setOwner] = useState(self?.name ?? "");
  const [groupId, setGroupId] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const host = websiteHost(website);
  const websiteWrong = website.trim().length > 0 && !host;
  const duplicate = customers.find(
    (c) => name.trim().length > 0 && c.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
  const otherStarted = addressHasAny(other);
  const otherUnfinished = otherStarted && !addressIsComplete(other);
  const groupReady = groupId === NEW_GROUP ? newGroup.trim().length > 0 : groupId.length > 0;

  const missing: string[] = [];
  if (!name.trim()) missing.push("customer name");
  if (!host) missing.push(websiteWrong ? "a real website" : "website");
  if (!addressIsComplete(hq)) missing.push("HQ line 1, city and country");
  if (otherUnfinished) missing.push("the rest of the other address");
  if (!owner) missing.push("owner");
  if (!groupReady) missing.push(groupId === NEW_GROUP ? "the new group's name" : "customer group");
  const ready = missing.length === 0 && !duplicate;

  function reset() {
    setName("");
    setWebsite("");
    setHq(blankAddress());
    setOther(blankAddress());
    setParentId("NA");
    setOwner(self?.name ?? "");
    setGroupId("");
    setNewGroup("");
    setError("");
  }

  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const pick = owners.find((o) => o.name === owner);
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          website: host,
          hq,
          other: otherStarted ? other : null,
          parentId: parentId === "NA" ? "" : parentId,
          owner,
          ownerUserId: pick?.id ?? "",
          groupId: groupId === NEW_GROUP ? "" : groupId,
          newGroupName: groupId === NEW_GROUP ? newGroup.trim() : "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not add that customer.");
        return;
      }
      toast(`${data.customer?.name ?? name.trim()} added as ${data.customer?.customerNo ?? "a new customer"}.`);
      if (data.warning) toast(String(data.warning), "error");
      reset();
      onClose();
      if (data.customer?.id) router.push(`/customers/${data.customer.id}`);
      else router.refresh();
    } catch {
      setError("Could not add that customer.");
    } finally {
      setBusy(false);
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void save();
  };

  const address = (
    title: string,
    required: boolean,
    value: CustomerAddress,
    set: (a: CustomerAddress) => void,
    hint: string
  ) => {
    const put = (k: keyof CustomerAddress) => (e: React.ChangeEvent<HTMLInputElement>) => {
      set({ ...value, [k]: e.target.value });
      if (error) setError("");
    };
    return (
      <fieldset className="rounded-xl border border-border-light p-3.5">
        <legend className="flex items-center gap-1 px-1 text-[12.5px] font-semibold text-text-primary">
          <MapPin size={13} strokeWidth={2.2} className="text-[color:var(--ink-orange)]" aria-hidden="true" />
          {title}
          {required && (
            <span className="text-[color:#DC2626]" aria-hidden="true">
              *
            </span>
          )}
          <InfoHint text={hint} />
        </legend>
        <div className="grid grid-cols-2 gap-2.5">
          <input className={cn(INPUT, "col-span-2")} placeholder="Line 1" aria-label={`${title} line 1`} value={value.line1} onChange={put("line1")} onKeyDown={onEnter} disabled={busy} />
          <input className={cn(INPUT, "col-span-2")} placeholder="Line 2" aria-label={`${title} line 2`} value={value.line2 ?? ""} onChange={put("line2")} onKeyDown={onEnter} disabled={busy} />
          <input className={INPUT} placeholder="City" aria-label={`${title} city`} value={value.city} onChange={put("city")} onKeyDown={onEnter} disabled={busy} />
          <input className={INPUT} placeholder="State" aria-label={`${title} state`} value={value.state ?? ""} onChange={put("state")} onKeyDown={onEnter} disabled={busy} />
          <ColorSelect
            value={value.country}
            ariaLabel={`${title} country`}
            className="w-full"
            collapsible={false}
            fill
            onChange={(v) => {
              set({ ...value, country: v });
              if (error) setError("");
            }}
            options={[{ value: "", label: "Country", color: "#C7CDD6" }, ...countryOptions()]}
          />
          <input className={INPUT} placeholder="ZIP" aria-label={`${title} ZIP`} value={value.zip ?? ""} onChange={put("zip")} onKeyDown={onEnter} disabled={busy} />
        </div>
      </fieldset>
    );
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Add a customer"
      size="workflow"
      titleAfter={<InfoHint text="The customer ID, like CUS-0018, is made for you when you save." />}
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-3.5">
          <label className="block">
            <Label text="Customer name" required />
            <input
              autoFocus
              className={cn(INPUT, duplicate && "border-[rgba(220,38,38,0.45)]")}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={onEnter}
              placeholder="e.g. GSK"
              aria-label="Customer name"
              aria-invalid={duplicate ? true : undefined}
              disabled={busy}
            />
            {duplicate && (
              <span className="mt-1 block text-[11.5px] font-medium text-[#B91C1C]">
                {duplicate.name} is already a customer.
              </span>
            )}
          </label>
          <label className="block">
            <Label text="Website" required hint="Their own website, like gsk.com." />
            <input
              className={cn(INPUT, websiteWrong && "border-[rgba(220,38,38,0.45)]")}
              value={website}
              onChange={(e) => {
                setWebsite(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={onEnter}
              placeholder="their-website.com"
              aria-label="Website"
              aria-invalid={websiteWrong ? true : undefined}
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
            />
            {websiteWrong && (
              <span className="mt-1 block text-[11.5px] font-medium text-[#B91C1C]">It should look like gsk.com.</span>
            )}
          </label>
          <div>
            <Label text="Parent company" hint="The customer this one belongs to, or NA when it stands alone." />
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
          <div>
            <Label
              text="Owner"
              required
              hint={selfOnly ? "A BD Member can only make themselves the owner." : "The BD member who looks after this customer."}
            />
            <ColorSelect
              value={owner}
              ariaLabel="Owner"
              className="w-full"
              collapsible={false}
              fill
              searchable
              onChange={setOwner}
              options={[
                ...(selfOnly ? [] : [{ value: "", label: "Pick the owner", color: "#C7CDD6" }]),
                ...ownerChoices.map((o) => ({
                  value: o.name,
                  label: o.name,
                  avatarName: o.name,
                  description: o.role === "bd_owner" ? "BD Owner" : "BD Member",
                })),
              ]}
            />
          </div>
          <div>
            <Label text="Customer group" required hint="Which group this customer goes into. Pick New group to start one." />
            <ColorSelect
              value={groupId}
              ariaLabel="Customer group"
              className="w-full"
              collapsible={false}
              fill
              onChange={setGroupId}
              options={[
                { value: "", label: "Pick a group", color: "#C7CDD6" },
                ...groups.map((g) => ({ value: g.id, label: g.name, color: g.color, icon: Layers })),
                { value: NEW_GROUP, label: "New group", color: "var(--ink-bright-blue)", icon: Plus },
              ]}
            />
            {groupId === NEW_GROUP && (
              <input
                className={cn(INPUT, "mt-2")}
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                onKeyDown={onEnter}
                placeholder="Name the new group"
                aria-label="New group name"
                disabled={busy}
              />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3.5">
          {address("HQ address", true, hq, setHq, "Where the company is headquartered. Line 1, city and country are needed; state and ZIP are optional.")}
          {address("Other address", false, other, setOther, "A second office, if there is one. Leave it empty, or fill in line 1, city and country.")}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border-light pt-4">
        <span className="min-h-[18px] text-[12px]" aria-live="polite">
          {error ? (
            <span className="font-medium text-[#DC2626]">{error}</span>
          ) : missing.length > 0 ? (
            <span className="text-text-tertiary">Still needed: {missing.join(", ")}.</span>
          ) : duplicate ? (
            <span className="text-text-tertiary">That name is already a customer.</span>
          ) : null}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!busy) onClose();
            }}
            className="rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!ready || busy}
            title={ready ? undefined : `Still needed: ${missing.join(", ") || "a different name"}`}
            className="rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add customer"}
          </button>
        </span>
      </div>
    </Modal>
  );
}
