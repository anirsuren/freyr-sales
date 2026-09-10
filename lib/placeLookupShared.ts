import type { CustomerAddress } from "@/lib/customerProfilesShared";

/**
 * LOOK IT UP INSTEAD OF TYPING IT IN (Anir, Sep 10: "i want it where like when
 * i search it up it looks it up (like u know how those work?)").
 *
 * Two lookups share these shapes. Typing a customer's name offers real
 * companies, and picking one fills in its name, website and HQ address.
 * Typing into an address's first line offers real addresses, and picking one
 * fills in the rest of that address. Nothing is saved until the person saves,
 * so every filled field can still be corrected.
 */

/** Google Places when its key is set, the open sources otherwise. */
export type LookupSource = "google" | "open";

export type CompanySuggestion = {
  /** Handle for the details call: g:<Google place id>, wd:<Wikidata id> or lei:<LEI>. */
  ref: string;
  name: string;
  /** Where it is, and its website when that is already known. */
  detail: string;
};

export type AddressSuggestion = {
  /** g:<Google place id>, or osm:<id> when the search returned the whole address. */
  ref: string;
  main: string;
  detail: string;
  /** Present when no second call is needed to fill the fields. */
  address?: CustomerAddress;
};

export type CompanyDetails = {
  name: string;
  /** Host only, like gsk.com. */
  website?: string;
  hq?: CustomerAddress;
};

export type LookupResponse<T> = { source: LookupSource; results: T[] };

export const COMPANY_REF_RE = /^(g:[A-Za-z0-9_-]{10,300}|wd:Q\d{1,12}|lei:[A-Z0-9]{20})$/;
export const ADDRESS_REF_RE = /^g:[A-Za-z0-9_-]{10,300}$/;
export const LOOKUP_SESSION_RE = /^[A-Za-z0-9-]{8,64}$/;

/** One Google billing session per search-then-pick. */
export function newLookupSession(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
