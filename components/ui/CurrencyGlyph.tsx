import type { LucideIcon } from "lucide-react";

/**
 * THE CURRENCY'S OWN SIGN AS THE ROW MARK (Anir, Aug 18: "this should be the
 * actual currencies for the logos, not some blue and green circles").
 *
 * ColorSelect draws an option's `icon` inside its colored square; these are
 * icon-shaped components that draw the symbol itself — $, €, £, ₹ — so a
 * currency row reads as money at a glance, exactly like the printed amounts.
 */
const cache = new Map<string, LucideIcon>();

export function currencyGlyph(symbol: string): LucideIcon {
  const glyph = symbol.trim();
  if (!cache.has(glyph)) {
    const scale = glyph.length >= 3 ? 0.52 : glyph.length === 2 ? 0.68 : 0.95;
    const Glyph = ({ size = 12 }: { size?: number; strokeWidth?: number }) => (
      <span
        aria-hidden="true"
        style={{
          fontSize: Math.max(7, Math.round(size * scale)),
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: glyph.length > 1 ? "-0.04em" : undefined,
        }}
      >
        {glyph}
      </span>
    );
    cache.set(glyph, Glyph as unknown as LucideIcon);
  }
  return cache.get(glyph)!;
}
