export type MaterialKind =
  | "video" | "presentation" | "whitepaper" | "pricing" | "competition"
  | "case_study" | "reference" | "one_pager" | "datasheet";

export interface OfferingMaterial {
  id: string;
  kind: MaterialKind;
  label: string;
  url: string;
}

export const MATERIAL_META: Record<MaterialKind, { label: string; plural: string }> = {
  video: { label: "Video", plural: "Videos" },
  presentation: { label: "Sales presentation", plural: "Sales presentations" },
  whitepaper: { label: "Whitepaper / thought leadership", plural: "Whitepapers & thought leadership" },
  pricing: { label: "Pricing", plural: "Pricing" },
  competition: { label: "Competition", plural: "Competition" },
  case_study: { label: "Case study", plural: "Case studies" },
  reference: { label: "Customer reference", plural: "Customer references" },
  one_pager: { label: "One-pager", plural: "One-pagers" },
  datasheet: { label: "Datasheet", plural: "Datasheets" },
};
