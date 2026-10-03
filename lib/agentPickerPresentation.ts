import type { EntityFact } from "./agentEntityVisuals";

// The complete metadata remains searchable; the picker shows a short reading
// hierarchy instead of turning every field into a badge.
const priorities: Record<string, EntityFact["kind"][]> = {
  material: ["format", "size", "division"],
  company: ["owner", "industry"],
  marketCompany: ["division", "type"],
  contact: ["email", "location"],
  person: ["role"],
  trackedPerson: ["location"],
  lead: ["status", "owner"],
  deal: ["value", "status"],
  offering: ["division", "owner"],
  component: ["version", "features"],
  marketItem: ["date"],
  contract: ["value", "status"],
  solution: ["status", "date"],
  goal: ["target", "verification"],
  report: [],
};
export function pickerPreviewFacts(kind: string, facts: EntityFact[] = []): EntityFact[] {
  const preferred = (priorities[kind] || []).flatMap((key) => facts.filter((fact) => fact.kind === key));
  return (preferred.length ? preferred : facts).slice(0, 3);
}
