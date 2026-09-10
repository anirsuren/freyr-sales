/**
 * A CUSTOMER'S ID, ADDRESSES AND PARENT (Manoj, Sep 10: "In Add Customer,
 * include the following fields... HQ Address* (Line 1, Line 2, City, State,
 * Country, ZIP), Address Other (Line 1, Line 2, City, State, Country, ZIP),
 * Parent Company (drop-down of all Customers, and NA)" and "Customer ID for
 * every Customer to be system generated").
 *
 * Client-safe: types and pure helpers only. The store is lib/customerProfiles.
 */
export type CustomerAddress = {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  country: string;
  zip?: string;
};

export type CustomerProfile = {
  /** CUS-0001, handed out once and never reused. */
  customerNo: string;
  hq?: CustomerAddress;
  other?: CustomerAddress;
  /** The parent company's customer id. Absent means NA. */
  parentId?: string;
  updatedAt?: string;
};

export type CustomerProfilesState = {
  profiles: Record<string, CustomerProfile>;
  /** The highest number ever issued, so a deleted customer's number is retired. */
  lastCustomerNo: number;
};

export const EMPTY_CUSTOMER_PROFILES: CustomerProfilesState = { profiles: {}, lastCustomerNo: 0 };

export const CUSTOMER_NO_RE = /^CUS-(\d+)$/;

export function formatCustomerNo(n: number): string {
  return `CUS-${String(n).padStart(4, "0")}`;
}

const ADDRESS_MAX = { line1: 160, line2: 160, city: 80, state: 80, country: 80, zip: 20 } as const;
type AddressField = keyof typeof ADDRESS_MAX;
const ADDRESS_FIELDS = Object.keys(ADDRESS_MAX) as AddressField[];

export function blankAddress(): CustomerAddress {
  return { line1: "", line2: "", city: "", state: "", country: "", zip: "" };
}

/** Trimmed, capped, and absent when nothing was typed. */
export function normalizeAddress(raw: unknown): CustomerAddress | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const pick = (k: AddressField) =>
    typeof r[k] === "string" ? (r[k] as string).trim().slice(0, ADDRESS_MAX[k]) : "";
  const out: CustomerAddress = { line1: pick("line1"), city: pick("city"), country: pick("country") };
  const line2 = pick("line2");
  const state = pick("state");
  const zip = pick("zip");
  if (line2) out.line2 = line2;
  if (state) out.state = state;
  if (zip) out.zip = zip;
  return addressHasAny(out) ? out : undefined;
}

export function addressHasAny(a: Partial<CustomerAddress> | undefined | null): boolean {
  return !!a && ADDRESS_FIELDS.some((k) => String(a[k] ?? "").trim().length > 0);
}

/** Line 1, a city and a country: the parts every address has. State and ZIP
 *  do not exist everywhere, so they are never required. */
export function addressIsComplete(a: Partial<CustomerAddress> | undefined | null): boolean {
  return (
    !!a &&
    String(a.line1 ?? "").trim().length > 0 &&
    String(a.city ?? "").trim().length > 0 &&
    String(a.country ?? "").trim().length > 0
  );
}

/** One line, for headers and hovers: "1 Main St, Suite 4, Brentford, Middlesex TW8 9GS, United Kingdom". */
export function formatAddress(a: CustomerAddress | undefined | null): string {
  if (!a) return "";
  const cityLine = [a.city, a.state].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
  return [a.line1, a.line2, [cityLine, a.zip].map((x) => String(x ?? "").trim()).filter(Boolean).join(" "), a.country]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(", ");
}
