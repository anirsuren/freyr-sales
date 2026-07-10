import { cn } from "@/lib/utils";

// A branded company mark: a rounded-square with the company's initials on a
// deterministic gradient, so every account reads as its own brand (Anir, Jul 8:
// "all the companies should have logos… different colors"). Free + instant +
// consistent — a curated palette keeps it premium (no random ugly HSL). Later
// this can swap to a real logo image (e.g. pulled from the company / LinkedIn)
// by passing `src`; until then the mark is the fallback everywhere a company
// name appears.
const GRADIENTS: [string, string][] = [
  ["#0071E3", "#4AA3FF"], // blue
  ["#5E5CE6", "#8A88FF"], // indigo
  ["#0F9E8E", "#2DD4BF"], // teal
  ["#7C3AED", "#A78BFA"], // violet
  ["#0891B2", "#22D3EE"], // cyan
  ["#059669", "#34D399"], // emerald
  ["#D97706", "#F5A623"], // amber
  ["#DB2777", "#F472B6"], // pink
  ["#475569", "#94A3B8"], // slate
  ["#C026D3", "#E879F9"], // fuchsia
];

function pick(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

// Real generated logo images, keyed by company name (lowercased). Companies
// with a real logo show it; everyone else falls back to the branded mark.
// Every seeded account now has its own generated brand mark (Anir, Jul 8:
// "everywhere there's a name of the company, you have the logo of the entity").
const LOGOS: Record<string, string> = {
  "helix biologics": "/logos/helix-biologics.png",
  "bionex therapeutics": "/logos/bionex-therapeutics.png",
  "indavel pharma": "/logos/indavel-pharma.png",
  "cortexa biopharma": "/logos/cortexa-biopharma.png",
  "solvance pharma": "/logos/solvance-pharma.png",
  "novagene therapeutics": "/logos/novagene-therapeutics.png",
  "aether medical devices": "/logos/aether-medical-devices.png",
  "solara consumer health": "/logos/solara-consumer-health.png",
  "quantum oncology": "/logos/quantum-oncology.png",
  "meridian pharmaceuticals": "/logos/meridian-pharmaceuticals.png",
  "northwind biosciences": "/logos/northwind-biosciences.png",
  "orion vaccines": "/logos/orion-vaccines.png",
};

function logoFor(name: string): string | null {
  return LOGOS[name.trim().toLowerCase()] || null;
}

export function CompanyLogo({
  name,
  className,
  src,
}: {
  name: string;
  className?: string;
  // Optional real logo image; falls back to the branded initials mark.
  src?: string | null;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const [a, b] = pick(name);
  const resolved = src || logoFor(name);

  if (resolved) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt={name}
        className={cn("object-cover rounded-xl shrink-0", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-semibold text-white shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.10)]",
        className
      )}
      style={{ backgroundImage: `linear-gradient(135deg, ${a}, ${b})` }}
      aria-label={name}
    >
      {initials}
    </span>
  );
}
