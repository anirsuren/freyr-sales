import { cn } from "@/lib/utils";

// A branded company mark: a rounded-square with the company's initials on a
// deterministic gradient, so every account reads as its own brand (Anir, Jul 8:
// "all the companies should have logos… different colors"). Free + instant +
// consistent — a curated palette keeps it premium (no random ugly HSL). Later
// this can swap to a real logo image (e.g. pulled from the company / LinkedIn)
// by passing `src`; until then the mark is the fallback everywhere a company
// name appears.
const GRADIENTS: [string, string][] = [
// IDENTITY HUES ONLY. Red, green, amber and burnt orange are RESERVED in this
// app for meaning: red is a problem, green is healthy, orange is caution. An
// identity palette that reaches for them paints a perfectly good record in the
// colour of a warning. Anir, Jul 28, on a 90%-fit service rendered in red:
// "Why is it red? You have to understand that red means horrible, red means
// negative... colors like red, green, and yellow are reserved for actually
// signifying something else." Purple, blue, indigo, teal, cyan, sky, pink,
// fuchsia and slate all carry no status meaning, so they are safe here.
  ["#0071E3", "#4AA3FF"], // blue
  ["#5E5CE6", "#8A88FF"], // indigo
  ["#0F9E8E", "#2DD4BF"], // teal
  ["#7C3AED", "#A78BFA"], // violet
  ["#0891B2", "#22D3EE"], // cyan
  ["#4338CA", "#818CF8"], // deep indigo
  ["#0EA5E9", "#7DD3FC"], // sky
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

  // THE REAL ACCOUNTS WEAR THEIR OWN BRANDS. These sixteen are actual Freyr
  // customers, not showroom fiction, so a generated initials tile was standing
  // in for a logo anyone in the building would recognise (Anir, Aug 8: "go pull
  // actual logos since these are real companies"). Fetched from each company's
  // own site and committed, so nothing is loaded from a third party at runtime.
  // Sources are the companies' own logo files on Wikipedia, rendered at 960px —
  // favicons were the first attempt and they upscaled to mush (Anir, Aug 8:
  // "these are fucking cheap-ass logos"). CuraTeQ, Pierre Fabre, Zydus and
  // Gideon keep the generated mark: no logo file exists for them and guessing
  // at which company a name refers to is not something to do to a real account.
  gilead: "/logos/real/gilead.png",
  gsk: "/logos/real/gsk.png",
  incyte: "/logos/real/incyte.png",
  "j&j medtech": "/logos/real/j-j-medtech.png",
  kenvue: "/logos/real/kenvue.png",
  novartis: "/logos/real/novartis.png",
  // The joint account carries the Novartis mark; Cognizant is the partner.
  "novartis + cognizant": "/logos/real/novartis.png",
  cognizant: "/logos/real/cognizant.png",
  otsuka: "/logos/real/otsuka.png",
  takeda: "/logos/real/takeda.png",
  vertex: "/logos/real/vertex.png",
  galderma: "/logos/real/galderma.png",
  opella: "/logos/real/opella.png",
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
    // The real files are pre-composed 512x512 tiles: the source wordmark is
    // trimmed of its transparent margin, fitted to 80% of the square and
    // centred on white. Fitting a 960x145 wordmark into a 24px box at render
    // time instead produced a three-pixel sliver that read as "the logo isn't
    // loading" (Anir, Aug 8) — a square source is the only thing that survives
    // every place this component is used, from a 20px row icon to a 96px
    // account header.
    const wordmark = resolved.startsWith("/logos/real/");
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt={name}
        className={cn(
          "rounded-xl shrink-0",
          wordmark
            ? "border border-border-light bg-white object-contain"
            : "object-cover",
          className
        )}
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
