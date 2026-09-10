"use client";

import { useRef, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction } from "react";
import { Building2, MapPin } from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { LookupField, type LookupAnswer, type LookupOption } from "@/components/ui/LookupField";
import { blankAddress, type CustomerAddress } from "@/lib/customerProfilesShared";
import {
  newLookupSession,
  type AddressSuggestion,
  type CompanyDetails,
  type CompanySuggestion,
  type LookupSource,
} from "@/lib/placeLookupShared";
import { tint } from "@/lib/tint";

/**
 * THE CUSTOMER FORMS' TWO LOOKUPS (Anir, Sep 10: "when i search it up it looks
 * it up"). A customer's name offers real companies; an address's first line
 * offers real addresses. Both fill in the boxes around them, and every box
 * stays editable.
 */

/** Who answered. Google's terms require "Google Maps" wherever its answers show. */
export function LookupCredit({ source, kind }: { source: LookupSource; kind: "company" | "address" }) {
  if (source === "google") return <span className="whitespace-nowrap font-medium">Google Maps</span>;
  return (
    <span className="whitespace-nowrap">
      {kind === "company" ? "Wikidata and GLEIF" : "© OpenStreetMap contributors"}
    </span>
  );
}

function Mark({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="flex h-7 w-7 items-center justify-center rounded-md"
      style={{ color, background: tint(color, 12) }}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const data = (await response.json().catch(() => null)) as unknown;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function sourceOf(data: Record<string, unknown>): LookupSource {
  return data.source === "google" ? "google" : "open";
}

export function CompanyNameLookup({
  value,
  onChange,
  customers,
  onOpenExisting,
  onLookupStart,
  onFilled,
  onLookupFailed,
  inputClassName,
  invalid = false,
  disabled = false,
  autoFocus = false,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Customers already in the app are offered first, so nobody adds one twice. */
  customers: { id: string; name: string }[];
  onOpenExisting: (id: string) => void;
  onLookupStart: (name: string) => void;
  onFilled: (fill: { details: CompanyDetails; source: LookupSource }) => void;
  onLookupFailed: () => void;
  inputClassName: string;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  onEnter?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const session = useRef(newLookupSession());
  const offered = useRef(new Map<string, CompanySuggestion>());

  const load = async (query: string, signal: AbortSignal): Promise<LookupAnswer> => {
    const needle = query.toLowerCase();
    const existing = customers.filter((customer) => customer.name.toLowerCase().includes(needle)).slice(0, 3);
    const existingGroup = {
      title: "Already a customer",
      options: existing.map((customer) => ({
        key: `existing:${customer.id}`,
        main: customer.name,
        detail: "Open their page",
        icon: <CompanyLogo name={customer.name} className="h-7 w-7 text-[10px]" />,
      })),
    };
    let data: Record<string, unknown>;
    try {
      const response = await fetch(
        `/api/lookup/companies?q=${encodeURIComponent(query)}&session=${session.current}`,
        { signal }
      );
      data = await readJson(response);
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "The lookup failed.");
    } catch (error) {
      if (signal.aborted || existing.length === 0) throw error;
      return { groups: [existingGroup] };
    }
    const results = Array.isArray(data.results) ? (data.results as CompanySuggestion[]) : [];
    results.forEach((result) => offered.current.set(result.ref, result));
    return {
      groups: [
        existingGroup,
        {
          title: existing.length > 0 && results.length > 0 ? "Companies" : undefined,
          options: results.map((result) => ({
            key: result.ref,
            main: result.name,
            detail: result.detail,
            icon: (
              <Mark color="var(--ink-bright-blue)">
                <Building2 size={14} strokeWidth={2.2} />
              </Mark>
            ),
          })),
        },
      ],
      footer: results.length > 0 ? <LookupCredit source={sourceOf(data)} kind="company" /> : undefined,
    };
  };

  const pick = async (option: LookupOption) => {
    if (option.key.startsWith("existing:")) {
      onOpenExisting(option.key.slice("existing:".length));
      return;
    }
    const name = offered.current.get(option.key)?.name ?? option.main;
    onLookupStart(name);
    onChange(name);
    try {
      const response = await fetch(
        `/api/lookup/companies/details?ref=${encodeURIComponent(option.key)}&session=${session.current}`
      );
      const data = await readJson(response);
      const details = data.company as CompanyDetails | undefined;
      if (!response.ok || !details) throw new Error("No details came back.");
      /* The name keeps the casing it was offered in, so CuraTeQ does not come back as Curateq. */
      const sameName = details.name.toLowerCase() === name.toLowerCase();
      onFilled({ details: sameName ? { ...details, name } : details, source: sourceOf(data) });
    } catch {
      onLookupFailed();
    } finally {
      session.current = newLookupSession();
    }
  };

  return (
    <LookupField
      value={value}
      onChange={onChange}
      load={load}
      onPick={(option) => void pick(option)}
      ariaLabel="Customer name"
      placeholder="Type to look it up, e.g. GSK"
      inputClassName={inputClassName}
      invalid={invalid}
      disabled={disabled}
      autoFocus={autoFocus}
      onEnter={onEnter}
      emptyText="No company found. Type the name in yourself."
    />
  );
}

export function AddressLineLookup({
  title,
  value,
  onChange,
  inputClassName,
  className,
  disabled = false,
  onEnter,
}: {
  title: string;
  value: CustomerAddress;
  onChange: Dispatch<SetStateAction<CustomerAddress>>;
  inputClassName: string;
  className?: string;
  disabled?: boolean;
  onEnter?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const session = useRef(newLookupSession());
  const offered = useRef(new Map<string, AddressSuggestion>());

  const load = async (query: string, signal: AbortSignal): Promise<LookupAnswer> => {
    const response = await fetch(
      `/api/lookup/addresses?q=${encodeURIComponent(query)}&session=${session.current}`,
      { signal }
    );
    const data = await readJson(response);
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "The lookup failed.");
    const results = Array.isArray(data.results) ? (data.results as AddressSuggestion[]) : [];
    results.forEach((result) => offered.current.set(result.ref, result));
    return {
      groups: [
        {
          options: results.map((result) => ({
            key: result.ref,
            main: result.main,
            detail: result.detail,
            icon: (
              <Mark color="var(--ink-orange)">
                <MapPin size={14} strokeWidth={2.2} />
              </Mark>
            ),
          })),
        },
      ],
      footer: <LookupCredit source={sourceOf(data)} kind="address" />,
    };
  };

  /* Line 2 is usually a floor or a suite the lookup cannot know, so it stays unless the lookup has one. */
  const fill = (address: CustomerAddress) =>
    onChange((previous) => ({ ...blankAddress(), ...address, line2: address.line2 ?? previous.line2 ?? "" }));

  const pick = async (option: LookupOption) => {
    const offer = offered.current.get(option.key);
    try {
      if (offer?.address) {
        fill(offer.address);
        return;
      }
      onChange((previous) => ({ ...previous, line1: option.main }));
      const response = await fetch(
        `/api/lookup/addresses/details?ref=${encodeURIComponent(option.key)}&session=${session.current}`
      );
      const data = await readJson(response);
      const address = data.address as CustomerAddress | undefined;
      if (response.ok && address) fill(address);
    } catch {
      /* Line 1 is already in; the rest can be typed. */
    } finally {
      session.current = newLookupSession();
    }
  };

  return (
    <LookupField
      value={value.line1}
      onChange={(line1) => onChange((previous) => ({ ...previous, line1 }))}
      load={load}
      onPick={(option) => void pick(option)}
      ariaLabel={`${title} line 1`}
      placeholder="Line 1, type to look it up"
      minChars={3}
      inputClassName={inputClassName}
      className={className}
      disabled={disabled}
      onEnter={onEnter}
      emptyText="No address found. Type it in yourself."
    />
  );
}
