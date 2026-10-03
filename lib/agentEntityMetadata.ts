import type { EntityFact, EntityFactKind } from "./agentEntityVisuals";
import type { Customer, Contact } from "./types";
import type { AccessMember } from "./accessStore";
import type { Offering, FdlComponent } from "./offerings";
import type { Opportunity } from "./opportunitiesShared";
import type { Contract } from "./contractsShared";
import type { Lead } from "./leadsShared";
import type { PrimaryGoal } from "./performanceShared";
import type { SolutionRequest } from "./solutioning";
import type { TrackedCompany, TrackedPerson } from "./marketIntelTracking";
import { DOCUMENT_TYPE_META, formatFileSize, materialFileTypeLabel, materialLinkHost, materialDivisions, type OfferingMaterial } from "./offeringMaterials";

/** Small, stored facts only. Opening the picker must never fetch a document,
 * parse its text, convert money, or make an enrichment request. */
const compact = (...values: (string | null | undefined)[]) =>
  [...new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))].slice(0, 6);
const join = (...values: (string | null | undefined)[]) => compact(...values).join(" · ");
const label = (value?: string | null) => value ? value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : undefined;
const owner = (name?: string | null) => name?.trim() ? `Owner: ${name.trim()}` : undefined;
const summary = (text?: string | null) => text?.replace(/\s+/g, " ").trim().slice(0, 180) || undefined;
export function pickerDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  // Preserve the record's calendar day rather than moving it across time zones.
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const date = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return undefined;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}
export function pickerMoney(value: number, currency = "USD"): string | undefined {
  if (!Number.isFinite(value)) return undefined;
  // Keep the recorded currency and value; no exchange-rate reads or rounding to millions.
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  return `${code} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}`;
}
const customerMetadataBase = (c: Customer) => ({
  subtitle: join(c.industry, c.geography),
  details: compact(c.customer_type, c.size_tier ? `${label(c.size_tier)} company` : undefined, c.ownership, owner(c.owner)),
});
const contactMetadataBase = (c: Contact, company?: string) => ({
  subtitle: join(company, c.job_title),
  details: compact(c.department, join(c.city, c.country), c.buying_role, c.email),
});
const teammateMetadataBase = (m: AccessMember) => ({
  subtitle: m.email || undefined,
  details: compact(({ admin: "Admin", bd_owner: "BD Owner", bd_member: "BD Member", sol_member: "Solutioning Member" } as Record<string, string>)[m.role], m.accountType === "test" ? "Test account" : undefined),
});
const offeringMetadataBase = (o: Offering) => ({
  subtitle: join(o.offering_type, o.offering_category),
  details: compact(o.current_availability, o.current_version ? `Version ${o.current_version}` : undefined, owner(o.owners?.filter((m) => m.status === "owner").map((m) => m.name).join(", "))),
  description: summary(o.offering_description),
});
const materialMetadataBase = (m: OfferingMaterial, offering: string) => ({
  subtitle: offering,
  details: compact(materialFileTypeLabel(m), Number.isFinite(m.bytes) ? formatFileSize(m.bytes) : undefined, m.documentType ? DOCUMENT_TYPE_META[m.documentType]?.label : undefined, m.folder, materialLinkHost(m), m.addedAt && pickerDate(m.addedAt) ? `Added ${pickerDate(m.addedAt)}` : undefined),
  description: summary(m.description),
});
const componentMetadataBase = (c: FdlComponent) => ({
  subtitle: c.type,
  details: compact(c.releases?.find((r) => r.current && r.status === "released")?.version ? `Version ${c.releases.find((r) => r.current && r.status === "released")!.version}` : undefined, `${c.features?.length || 0} features`),
});
const opportunityMetadataBase = (o: Opportunity) => ({
  subtitle: o.customer,
  details: compact(o.externalId, o.level, o.status, pickerMoney(o.value, o.currency), owner(o.owner), pickerDate(o.estSignDate) ? `Expected sign ${pickerDate(o.estSignDate)}` : undefined),
});
const contractMetadataBase = (c: Contract) => ({
  subtitle: c.customer,
  details: compact(c.reference, c.status, pickerMoney(c.value), owner(c.owner), pickerDate(c.startDate) ? `Starts ${pickerDate(c.startDate)}` : undefined, pickerDate(c.endDate) ? `Ends ${pickerDate(c.endDate)}` : undefined),
});
const leadMetadataBase = (l: Lead) => ({
  subtitle: join(l.company, l.title),
  details: compact(l.ref, l.status, l.source, owner(l.owner), l.country, l.email),
});
const goalMetadataBase = (g: PrimaryGoal) => ({
  subtitle: join(String(g.year), g.type),
  details: compact(g.target === 0 ? "Target not set" : `Target: ${g.unit === "currency" ? pickerMoney(g.target, g.currency) : `${new Intl.NumberFormat("en-US").format(g.target)}${g.unit === "percent" ? "%" : ""}`}`, g.verified ? "Verified" : "Not verified"),
});
const solutionMetadataBase = (r: SolutionRequest) => ({
  subtitle: r.customer,
  details: compact(r.ref, join(label(r.type || "request"), r.subtype || label(r.kind)), label(r.status), owner(r.owner), pickerDate(r.neededBy) ? `Due ${pickerDate(r.neededBy)}` : undefined, r.priority ? `${r.priority} priority` : undefined),
});
const trackedPersonMetadataBase = (p: TrackedPerson, company?: string) => ({
  subtitle: join(company, p.role || p.headline),
  details: compact(p.location),
});
const marketCompanyMetadataBase = (c: TrackedCompany) => ({
  subtitle: join(c.industry, c.hq),
  details: compact(c.group === "competitor" ? "Competitor" : "Customer", ...c.divisions || []),
});


type PlainMetadata = { subtitle?: string; details: string[]; description?: string };
const fact = (kind: EntityFactKind, text?: string | null, logoUrl?: string): EntityFact[] =>
  text?.trim() ? [{ kind, text: text.trim(), ...(logoUrl ? { logoUrl } : {}) }] : [];
function visuals<T extends PlainMetadata>(base: T, subtitleFacts: EntityFact[], specifics: EntityFact[] = [], owners: string[] = []) {
  return {
    ...base,
    subtitleFacts,
    facts: base.details.flatMap((text): EntityFact[] => {
      if (text.startsWith("Owner: ")) return owners.flatMap((name) => fact("owner", name));
      return [specifics.find((item) => item.text === text) || { kind: "text", text }];
    }),
  };
}
export const customerMetadata = (c: Customer) => visuals(customerMetadataBase(c), [
  ...fact("industry", c.industry), ...fact("location", c.geography),
], [], c.owner ? [c.owner] : []);
export const contactMetadata = (c: Contact, company?: string, logoUrl?: string) => visuals(contactMetadataBase(c, company), [
  ...fact("company", company, logoUrl), ...fact("role", c.job_title),
], [...fact("location", join(c.city, c.country)), ...fact("email", c.email), ...fact("role", c.buying_role)]);
export const teammateMetadata = (m: AccessMember) => visuals(teammateMetadataBase(m), fact("email", m.email),
  teammateMetadataBase(m).details.map((text) => ({ kind: "role", text })));
export const offeringMetadata = (o: Offering) => visuals(offeringMetadataBase(o), [
  ...fact("type", o.offering_type), ...fact("type", o.offering_category),
], [...fact("status", o.current_availability), ...fact("version", o.current_version ? `Version ${o.current_version}` : undefined)],
  o.owners?.filter((m) => m.status === "owner").map((m) => m.name) || []);
export const materialMetadata = (m: OfferingMaterial, offering: string) => {
  const metadata = visuals(materialMetadataBase(m, offering), fact("offering", offering), [
    ...fact("format", materialFileTypeLabel(m)), ...fact("size", Number.isFinite(m.bytes) ? formatFileSize(m.bytes) : undefined),
    ...fact("folder", m.folder), ...fact("link", materialLinkHost(m)),
    ...fact("type", m.documentType ? DOCUMENT_TYPE_META[m.documentType]?.label : undefined),
    ...fact("date", pickerDate(m.addedAt) ? `Added ${pickerDate(m.addedAt)}` : undefined),
  ]);
  return { ...metadata, facts: [...metadata.facts, ...fact("uploader", m.addedBy), ...materialDivisions(m).flatMap((division) => fact("division", division))], fileType: materialFileTypeLabel(m) };
};
export const componentMetadata = (c: FdlComponent) => visuals(componentMetadataBase(c), fact("type", c.type),
  componentMetadataBase(c).details.map((text) => ({ kind: text.startsWith("Version ") ? "version" : "features", text })));
export const opportunityMetadata = (o: Opportunity, logoUrl?: string) => visuals(opportunityMetadataBase(o), fact("company", o.customer, logoUrl), [
  ...fact("reference", o.externalId), ...fact("status", o.level), ...fact("status", o.status), ...fact("value", pickerMoney(o.value, o.currency)),
  ...fact("date", pickerDate(o.estSignDate) ? `Expected sign ${pickerDate(o.estSignDate)}` : undefined),
], o.owner ? [o.owner] : []);
export const contractMetadata = (c: Contract, logoUrl?: string) => visuals(contractMetadataBase(c), fact("company", c.customer, logoUrl), [
  ...fact("reference", c.reference), ...fact("status", c.status), ...fact("value", pickerMoney(c.value)),
  ...fact("date", pickerDate(c.startDate) ? `Starts ${pickerDate(c.startDate)}` : undefined), ...fact("date", pickerDate(c.endDate) ? `Ends ${pickerDate(c.endDate)}` : undefined),
], c.owner ? [c.owner] : []);
export const leadMetadata = (l: Lead, logoUrl?: string) => visuals(leadMetadataBase(l), [...fact("company", l.company, logoUrl), ...fact("role", l.title)], [
  ...fact("reference", l.ref), ...fact("status", l.status), ...fact("source", l.source), ...fact("location", l.country), ...fact("email", l.email),
], l.owner ? [l.owner] : []);
export const leadPickerEntity = (lead: Lead, companyLogoUrl?: string) => ({
  id: lead.id,
  name: lead.name?.trim() || lead.ref || "Unnamed lead",
  ...leadMetadata(lead, companyLogoUrl),
});
export const goalMetadata = (g: PrimaryGoal) => visuals(goalMetadataBase(g), [...fact("date", String(g.year)), ...fact("goalType", g.type)],
  goalMetadataBase(g).details.map((text) => ({ kind: text.includes("erified") ? "verification" : "target", text })));
export const solutionMetadata = (r: SolutionRequest, logoUrl?: string) => visuals(solutionMetadataBase(r), fact("company", r.customer, logoUrl), [
  ...fact("reference", r.ref), ...fact("type", join(label(r.type || "request"), r.subtype || label(r.kind))), ...fact("status", label(r.status)),
  ...fact("date", pickerDate(r.neededBy) ? `Due ${pickerDate(r.neededBy)}` : undefined), ...fact("priority", r.priority ? `${r.priority} priority` : undefined),
], r.owner ? [r.owner] : []);
export const trackedPersonMetadata = (p: TrackedPerson, company?: string, logoUrl?: string) => visuals(trackedPersonMetadataBase(p, company), [
  ...fact("company", company, logoUrl), ...fact("role", p.role || p.headline),
], fact("location", p.location));
export const marketCompanyMetadata = (c: TrackedCompany) => visuals(marketCompanyMetadataBase(c), [
  ...fact("industry", c.industry), ...fact("location", c.hq),
], [...fact("type", c.group === "competitor" ? "Competitor" : "Customer"), ...materialDivisions(c).flatMap((division) => fact("division", division))]);
export const articleMetadata = (company: string, logoUrl: string | undefined, source: string | undefined, published: string | null | undefined) => ({
  subtitle: join(company, source), details: compact("Article", pickerDate(published)),
  subtitleFacts: [...fact("company", company, logoUrl), ...fact("source", source)],
  facts: [...fact("format", "Article"), ...fact("date", pickerDate(published))],
});
