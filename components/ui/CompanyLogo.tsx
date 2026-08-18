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
  // "these are fucking cheap-ass logos"). CuraTeQ keeps the generated
  // mark; Pierre Fabre, Zydus and Gedeon Richter got real marks from their
  // verified LinkedIn pages on Aug 18.
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

  // THE PIPELINE'S OWN BRANDS, from each company's LinkedIn page (Anir,
  // Aug 18: "go find these guys on LinkedIn and get the profile pictures").
  // Every file was fetched ONLY after the LinkedIn page's own title named the
  // company — a real account never wears a guessed mark. Apotex, Astellas,
  // Bausch + Lomb, CJ Cheiljedang, Fresenius SE and Therakos would not
  // verify, so they keep the initials tile. Files are JPEG bytes with a .png
  // name, which every browser reads by content, not extension.
  abbvie: "/logos/real/abbvie.png",
  "advanz pharma": "/logos/real/advanz-pharma.png",
  "amgen inc": "/logos/real/amgen.png",
  amgen: "/logos/real/amgen.png",
  amneal: "/logos/real/amneal.png",
  astrazeneca: "/logos/real/astrazeneca.png",
  bms: "/logos/real/bristol-myers-squibb.png",
  "bavarian nordic": "/logos/real/bavarian-nordic.png",
  "becton, dickinson and company": "/logos/real/becton-dickinson.png",
  beiersdorf: "/logos/real/beiersdorf.png",
  blackmores: "/logos/real/blackmores.png",
  cipla: "/logos/real/cipla.png",
  deephealth: "/logos/real/deephealth.png",
  "dr reddy’s": "/logos/real/dr-reddys.png",
  "dr reddy's": "/logos/real/dr-reddys.png",
  enovis: "/logos/real/enovis.png",
  essity: "/logos/real/essity.png",
  "estee lauder": "/logos/real/estee-lauder.png",
  esteve: "/logos/real/esteve.png",
  "esteve pharma": "/logos/real/esteve.png",
  "eva pharma": "/logos/real/eva-pharma.png",
  fortrea: "/logos/real/fortrea.png",
  "fresenius medical care": "/logos/real/fresenius-medical-care.png",
  fujifilm: "/logos/real/fujifilm.png",
  "gedeon richter": "/logos/real/gedeon-richter.png",
  haleon: "/logos/real/haleon.png",
  hartmann: "/logos/real/hartmann.png",
  hikma: "/logos/real/hikma.png",
  "hikma pharmaceuticals": "/logos/real/hikma.png",
  indivior: "/logos/real/indivior.png",
  ipsen: "/logos/real/ipsen.png",
  jamieson: "/logos/real/jamieson.png",
  jubilant: "/logos/real/jubilant.png",
  "kimberly clark": "/logos/real/kimberly-clark.png",
  "kenvue/kc": "/logos/real/kenvue.png",
  lavazza: "/logos/real/lavazza.png",
  livanova: "/logos/real/livanova.png",
  lonza: "/logos/real/lonza.png",
  "lotus pharmaceutical": "/logos/real/lotus-pharmaceutical.png",
  medisca: "/logos/real/medisca.png",
  merz: "/logos/real/merz.png",
  millipore: "/logos/real/millipore.png",
  "novo nordisk": "/logos/real/novo-nordisk.png",
  olaplex: "/logos/real/olaplex.png",
  philips: "/logos/real/philips.png",
  "pierre fabre": "/logos/real/pierre-fabre.png",
  pricesmart: "/logos/real/pricesmart.png",
  protalix: "/logos/real/protalix.png",
  sandoz: "/logos/real/sandoz.png",
  sanofi: "/logos/real/sanofi.png",
  // The sheet spells it "Healthneers"; the key matches the data as written.
  "siemens healthneers": "/logos/real/siemens-healthineers.png",
  "siemens healthineers": "/logos/real/siemens-healthineers.png",
  "sirtex medical": "/logos/real/sirtex-medical.png",
  sony: "/logos/real/sony.png",
  sumitomo: "/logos/real/sumitomo-pharma.png",
  "sun pharma": "/logos/real/sun-pharma.png",
  taiho: "/logos/real/taiho.png",
  taisho: "/logos/real/taisho.png",
  terumo: "/logos/real/terumo.png",
  teva: "/logos/real/teva.png",
  tiofarma: "/logos/real/tiofarma.png",
  "west pharma": "/logos/real/west-pharma.png",
  "zydus group": "/logos/real/zydus.png",
  "zydus lifesciences": "/logos/real/zydus.png",
};

/**
 * THE SAME COMPANY, WRITTEN FIVE WAYS.
 *
 * Suren's pipeline sheet carries the account plus whatever the deal was about:
 * "GSK - RTQ", "Novartis FTE", "Novo Nordisk (LATAM)", "Medisca (expansion)",
 * "Gedeon Richter (Not in KC)", "BMS - Bristol Myers Squibb". Matched on the
 * whole string those all missed logos we already have, so Novartis showed its
 * real mark on one row and an initials tile on the next (Anir, Aug 16: "you
 * might as well just go find the company logos for all of them. It will just
 * look a lot better").
 *
 * So the lookup tries the name as written first, then again with the trailing
 * qualifier removed. Only trailing qualifiers are stripped: "Bristol Myers
 * Squibb" must never be reduced to "Bristol", and a leading token is never
 * matched on its own for the same reason.
 */
function logoKeys(name: string): string[] {
  const raw = name.trim().toLowerCase();
  const keys = [raw];
  // "novo nordisk (latam)" → "novo nordisk"
  const noParens = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (noParens && noParens !== raw) keys.push(noParens);
  // "gsk - rtq" → "gsk"; "bms - bristol myers squibb" → "bms"
  const beforeDash = noParens.split(/\s+[-–—]\s+/)[0].trim();
  if (beforeDash && !keys.includes(beforeDash)) keys.push(beforeDash);
  // "novartis fte" → "novartis". Only these known suffixes, so a real
  // two-word brand is never truncated into a different company.
  const suffix = beforeDash.replace(
    /\s+(fte|rtq|expansion|consumer|services)$/,
    ""
  );
  if (suffix && !keys.includes(suffix)) keys.push(suffix);
  return keys;
}

function logoFor(name: string): string | null {
  for (const key of logoKeys(name)) {
    if (LOGOS[key]) return LOGOS[key];
  }
  return null;
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
    // Every logo file — generated mark or real brand mark — is a square tile
    // with its padding already composed in, so this is one branch: fill the
    // rounded square exactly like the initials mark it replaces. Fitting a
    // wide wordmark at render time was what produced the three-pixel sliver
    // that read as a broken image (Anir, Aug 9).
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt={name}
        className={cn("rounded-xl object-cover shrink-0", className)}
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
