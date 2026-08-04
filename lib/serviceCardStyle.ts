export const SERVICE_CARD_ICON_OPTIONS = [
  { value: "package", label: "Package" },
  { value: "layers", label: "Layers" },
  { value: "document", label: "Document" },
  { value: "checklist", label: "Checklist" },
  { value: "workflow", label: "Workflow" },
  { value: "database", label: "Database" },
  { value: "shield", label: "Shield" },
  { value: "globe", label: "Globe" },
  { value: "chart", label: "Chart" },
  { value: "compass", label: "Compass" },
  { value: "sparkles", label: "Sparkles" },
  { value: "book", label: "Book" },
] as const;

export const SERVICE_CARD_COLOR_OPTIONS = [
  { value: "blue", label: "Blue", color: "#0071E3", light: "#4AA3FF" },
  { value: "indigo", label: "Indigo", color: "#5E5CE6", light: "#8A88FF" },
  { value: "teal", label: "Teal", color: "#0F9E8E", light: "#2DD4BF" },
  { value: "violet", label: "Violet", color: "#7C3AED", light: "#A78BFA" },
  { value: "cyan", label: "Cyan", color: "#0891B2", light: "#22D3EE" },
  { value: "sky", label: "Sky", color: "#0EA5E9", light: "#7DD3FC" },
  { value: "pink", label: "Pink", color: "#DB2777", light: "#F472B6" },
  { value: "purple", label: "Purple", color: "#9333EA", light: "#C084FC" },
] as const;

export type ServiceCardIcon = (typeof SERVICE_CARD_ICON_OPTIONS)[number]["value"];
export type ServiceCardColor = (typeof SERVICE_CARD_COLOR_OPTIONS)[number]["value"];

export interface ServiceCardStyle {
  icon?: ServiceCardIcon;
  color?: ServiceCardColor;
}

const ICONS = new Set<string>(SERVICE_CARD_ICON_OPTIONS.map((option) => option.value));
const COLORS = new Set<string>(SERVICE_CARD_COLOR_OPTIONS.map((option) => option.value));

/** Keep only approved visual tokens; card styles never accept arbitrary CSS. */
export function normalizeServiceCardStyles(value: unknown): ServiceCardStyle[] {
  if (!Array.isArray(value)) return [];
  const styles = value.slice(0, 200).map((candidate) => {
    if (!candidate || typeof candidate !== "object") return {};
    const entry = candidate as Record<string, unknown>;
    return {
      ...(typeof entry.icon === "string" && ICONS.has(entry.icon)
        ? { icon: entry.icon as ServiceCardIcon }
        : {}),
      ...(typeof entry.color === "string" && COLORS.has(entry.color)
        ? { color: entry.color as ServiceCardColor }
        : {}),
    };
  });
  while (styles.length && !styles.at(-1)?.icon && !styles.at(-1)?.color)
    styles.pop();
  return styles;
}
