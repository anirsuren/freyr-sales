import { countryOnlyGeography } from "@/lib/countryFlags";
import { dialTriggerLabel, findCountry, splitPhone } from "@/lib/countries";
import { formatPhoneNumber } from "@/lib/phone";

type RawLinkedIn =
  | {
      country?: unknown;
      location?: unknown;
      geography?: unknown;
    }
  | null
  | undefined;

/**
 * Pull a contact's own country hint from enrichment data. We never use the
 * account's country here: people at the same company can sit in different
 * offices, and shared dial codes such as +1 need the person's country to pick
 * the right flag when that fact is available.
 */
function contactCountry(raw: RawLinkedIn): string {
  if (!raw || typeof raw !== "object") return "";
  const value = [raw.country, raw.location, raw.geography].find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0
  );
  return countryOnlyGeography(value, "");
}

export function contactPhoneDisplay(
  phone: string,
  rawLinkedIn?: RawLinkedIn
): { countryAndCode: string; nationalNumber: string } {
  const { dial, number } = splitPhone(phone);
  const country = contactCountry(rawLinkedIn);
  const enrichedCountry = findCountry(country);
  const inferredDial = dial || (enrichedCountry ? `+${enrichedCountry.dial}` : "");
  return {
    countryAndCode: inferredDial ? dialTriggerLabel(inferredDial, country) : "🌐",
    nationalNumber: formatPhoneNumber(number),
  };
}
