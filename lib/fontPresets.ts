/**
 * FONT PRESETS (Anir, Sep 26: "I really think it's the font... each user can
 * choose what font combination they want... preset options").
 *
 * Each preset names a heading face, a body face and a monospace face. The
 * faces themselves are loaded once in app/layout.tsx and exposed as CSS
 * variables; a preset only says which variable fills each slot. The chosen
 * preset is stored on the member's profile and stamped on <html> as
 * data-font, and app/globals.css turns that into --font-heading, --font-body
 * and --font-mono for any surface that opts in with `font-preset-scope`:
 * the app shell, so every signed-in page follows the choice (Sep 27).
 */
export type FontPreset = {
  key: string;
  label: string;
  note: string;
  /** CSS font-family values, empty for "leave the app's own font alone". */
  heading: string;
  body: string;
  mono: string;
};

export const FONT_PRESETS: FontPreset[] = [
  {
    key: "system",
    label: "Freyr today",
    note: "The Mac's own system font, as the app has always been.",
    heading: "",
    body: "",
    mono: "",
  },
  {
    key: "plex",
    label: "Plex",
    note: "IBM Plex Sans throughout, Plex Mono for ids and numbers. The Verify look.",
    heading: "var(--font-plex-sans)",
    body: "var(--font-plex-sans)",
    mono: "var(--font-plex-mono)",
  },
  {
    key: "editorial",
    label: "Editorial",
    note: "Newsreader serif headings over Source Sans text. Quiet and printed.",
    heading: "var(--font-newsreader)",
    body: "var(--font-source-sans)",
    mono: "var(--font-plex-mono)",
  },
  {
    key: "inter",
    label: "Inter",
    note: "Inter everywhere with JetBrains Mono. The standard product face.",
    heading: "var(--font-inter)",
    body: "var(--font-inter)",
    mono: "var(--font-jetbrains-mono)",
  },
  {
    key: "geist",
    label: "Geist",
    note: "Geist Sans and Geist Mono. Tighter and more technical.",
    heading: "var(--font-geist)",
    body: "var(--font-geist)",
    mono: "var(--font-geist-mono)",
  },
  {
    key: "manrope",
    label: "Manrope",
    note: "Rounded Manrope headings over Inter text.",
    heading: "var(--font-manrope)",
    body: "var(--font-inter)",
    mono: "var(--font-jetbrains-mono)",
  },
  {
    key: "fraunces",
    label: "Fraunces",
    note: "Fraunces display headings over DM Sans. The most character.",
    heading: "var(--font-fraunces)",
    body: "var(--font-dm-sans)",
    mono: "var(--font-plex-mono)",
  },
  {
    key: "jakarta",
    label: "Jakarta",
    note: "Plus Jakarta Sans throughout. Friendly, slightly wide.",
    heading: "var(--font-jakarta)",
    body: "var(--font-jakarta)",
    mono: "var(--font-jetbrains-mono)",
  },
];

export const FONT_PRESET_KEYS = FONT_PRESETS.map((p) => p.key);
export const DEFAULT_FONT_PRESET = "system";

export function isFontPreset(value: unknown): value is string {
  return typeof value === "string" && FONT_PRESET_KEYS.includes(value);
}
