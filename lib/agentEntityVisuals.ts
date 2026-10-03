/** Presentation metadata for the authorized Agent catalogue. No extra reads. */
export const ENTITY_FACT_KINDS = [
  "company", "person", "owner", "uploader", "offering", "location", "date", "email", "format",
  "size", "folder", "link", "value", "reference", "status", "version",
  "type", "role", "industry", "features", "target", "priority", "source",
  "verification", "division", "goalType", "text",
] as const;
export type EntityFactKind = typeof ENTITY_FACT_KINDS[number];
export type EntityFact = { kind: EntityFactKind; text: string; logoUrl?: string };

/** Whitelist API data before rendering it in either Agent surface. */
export function readEntityFacts(value: unknown): EntityFact[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item): EntityFact[] => {
    if (!item || typeof item !== "object" || !ENTITY_FACT_KINDS.includes(item.kind) || typeof item.text !== "string" || !item.text.trim()) return [];
    return [{ kind: item.kind, text: item.text.trim().slice(0, 300), ...(typeof item.logoUrl === "string" ? { logoUrl: item.logoUrl } : {}) }];
  }).slice(0, 24);
}
