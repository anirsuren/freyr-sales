/** Keep the acquired Amplexor Life Sciences record visually distinct from its
 * parent. Its current LinkedIn image is ArisGlobal's logo, so the collected
 * URL is accurate for that page but misleading for an Amplexor row. */
export const AMPLEXOR_LEGACY_LOGO = "/logos/real/amplexor-life-sciences.png";

export function isAmplexorLifeSciences(name: string): boolean {
  return ["amplexor", "amplexor life sciences"].includes(name.trim().toLowerCase());
}

export function marketIntelLogoUrl(name: string, stored?: string | null): string | null {
  return isAmplexorLifeSciences(name) ? AMPLEXOR_LEGACY_LOGO : stored || null;
}
