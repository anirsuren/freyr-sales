import { getDataMode } from "./dataMode";

/**
 * COMPETITION PER OFFERING (Suren via Anir, Aug 11: "for that particular
 * product... the competitive companies and their product names... some
 * document where people can add some material, like pricing and about
 * details"). Every offering carries its own list of competitor products, and
 * every row collects the team's intel on it: pricing notes, what it is, links
 * and uploaded documents. Anyone signed in can contribute — same rule as the
 * sales-materials library.
 *
 * Storage: one row in the offering_catalog_state document table (id text pk +
 * jsonb), keyed "offering-competition". Real mode only — mock shows samples
 * from this module so the showroom always looks full, and sample rows can
 * never leak into the live row.
 */

export type CompetitionMaterialKind = "pricing" | "about" | "link" | "file";

export type CompetitionMaterial = {
  id: string;
  kind: CompetitionMaterialKind;
  /** Short display name, e.g. "2026 list pricing" or "Their product page". */
  label: string;
  /** The body for pricing/about notes. */
  text?: string;
  /** Destination for links and uploaded files. */
  url?: string;
  addedBy: string;
  addedAt: string;
};

export type CompetitorProduct = {
  id: string;
  /** The competitor company, e.g. "Veeva". */
  company: string;
  /** Their product that competes with THIS offering, e.g. "Vault RIM". */
  product: string;
  /** Tracked in Market Intel → links to the live briefing. */
  marketIntelId: string | null;
  materials: CompetitionMaterial[];
  addedBy: string;
  addedAt: string;
};

type CompetitionRow = { byOffering: Record<string, CompetitorProduct[]> };

const ROW_ID = "offering-competition";

function hasDatabase(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function client() {
  // Lazy require, same as the tracking module, so the SDK never rides into a
  // client bundle through this module's types.
  return require("@supabase/supabase-js").createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function normalize(value: unknown): CompetitionRow {
  if (!value || typeof value !== "object") return { byOffering: {} };
  const raw = value as Partial<CompetitionRow>;
  return {
    byOffering:
      raw.byOffering && typeof raw.byOffering === "object"
        ? (raw.byOffering as CompetitionRow["byOffering"])
        : {},
  };
}

async function readRow(): Promise<CompetitionRow> {
  if (!hasDatabase()) return { byOffering: {} };
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalize(data?.catalog);
}

async function writeRow(row: CompetitionRow): Promise<void> {
  const { error } = await client()
    .from("offering_catalog_state")
    .upsert({ id: ROW_ID, catalog: row, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Mock-mode showroom rows: obviously-sample intel so the tab never opens
 *  empty in the demo workspace. Never written anywhere. */
const SAMPLE_ROWS: CompetitorProduct[] = [
  {
    id: "sample-veeva",
    company: "Veeva Systems",
    product: "Vault RIM",
    marketIntelId: null,
    addedBy: "Sample data",
    addedAt: "2026-07-02T09:00:00.000Z",
    materials: [
      {
        id: "s-1",
        kind: "about",
        label: "What it is",
        text: "Cloud RIM suite covering registrations, submissions and health-authority correspondence. Strong with large pharma already on Vault Quality.",
        addedBy: "Sample data",
        addedAt: "2026-07-02T09:00:00.000Z",
      },
      {
        id: "s-2",
        kind: "pricing",
        label: "Pricing intel",
        text: "Per-module annual subscription, typically six figures for a mid-size sponsor; implementation billed separately.",
        addedBy: "Sample data",
        addedAt: "2026-07-08T09:00:00.000Z",
      },
      {
        id: "s-3",
        kind: "link",
        label: "Their product page",
        url: "https://www.veeva.com/products/vault-rim/",
        addedBy: "Sample data",
        addedAt: "2026-07-08T09:00:00.000Z",
      },
    ],
  },
  {
    id: "sample-arisglobal",
    company: "ArisGlobal",
    product: "LifeSphere Regulatory",
    marketIntelId: null,
    addedBy: "Sample data",
    addedAt: "2026-07-10T09:00:00.000Z",
    materials: [
      {
        id: "s-4",
        kind: "about",
        label: "What it is",
        text: "Regulatory information management inside the LifeSphere platform; pitched on automation and their Nava AI layer.",
        addedBy: "Sample data",
        addedAt: "2026-07-10T09:00:00.000Z",
      },
    ],
  },
  {
    id: "sample-ennov",
    company: "Ennov",
    product: "Ennov Regulatory",
    marketIntelId: null,
    addedBy: "Sample data",
    addedAt: "2026-07-15T09:00:00.000Z",
    materials: [],
  },
];

export async function readCompetition(
  offeringId: string
): Promise<CompetitorProduct[]> {
  if (getDataMode() !== "live") return structuredClone(SAMPLE_ROWS);
  const row: CompetitionRow = await readRow().catch(() => ({ byOffering: {} }));
  return row.byOffering[offeringId] ?? [];
}

export async function addCompetitorProduct(input: {
  offeringId: string;
  company: string;
  product: string;
  marketIntelId?: string | null;
  pricing?: string;
  about?: string;
  addedBy: string;
}): Promise<CompetitorProduct> {
  const company = input.company.trim().slice(0, 80);
  const product = input.product.trim().slice(0, 120);
  if (!company || !product) {
    throw new Error("Both the company and their product name are needed.");
  }
  const row = await readRow();
  const list = (row.byOffering[input.offeringId] ??= []);
  if (
    list.some(
      (c) =>
        c.company.toLowerCase() === company.toLowerCase() &&
        c.product.toLowerCase() === product.toLowerCase()
    )
  ) {
    throw new Error(`${company} ${product} is already on this list.`);
  }
  const now = new Date().toISOString();
  const entry: CompetitorProduct = {
    id: uid("cp"),
    company,
    product,
    marketIntelId: input.marketIntelId?.trim() || null,
    addedBy: input.addedBy,
    addedAt: now,
    materials: [],
  };
  const seed: [CompetitionMaterialKind, string, string | undefined][] = [
    ["pricing", "Pricing intel", input.pricing?.trim() || undefined],
    ["about", "What it is", input.about?.trim() || undefined],
  ];
  for (const [kind, label, text] of seed) {
    if (text) {
      entry.materials.push({
        id: uid("cm"),
        kind,
        label,
        text: text.slice(0, 2000),
        addedBy: input.addedBy,
        addedAt: now,
      });
    }
  }
  list.push(entry);
  await writeRow(row);
  return entry;
}

export async function removeCompetitorProduct(
  offeringId: string,
  competitorId: string
): Promise<void> {
  const row = await readRow();
  const list = row.byOffering[offeringId] ?? [];
  row.byOffering[offeringId] = list.filter((c) => c.id !== competitorId);
  await writeRow(row);
}

export async function addCompetitionMaterial(input: {
  offeringId: string;
  competitorId: string;
  kind: CompetitionMaterialKind;
  label: string;
  text?: string;
  url?: string;
  addedBy: string;
}): Promise<CompetitionMaterial> {
  const label = input.label.trim().slice(0, 120);
  const text = input.text?.trim().slice(0, 2000) || undefined;
  const url = input.url?.trim().slice(0, 600) || undefined;
  if (!label) throw new Error("Give the material a short name.");
  if ((input.kind === "pricing" || input.kind === "about") && !text) {
    throw new Error("Write the note itself, not just a title.");
  }
  if ((input.kind === "link" || input.kind === "file") && !url) {
    throw new Error("A link or file needs its URL.");
  }
  const row = await readRow();
  const entry = (row.byOffering[input.offeringId] ?? []).find(
    (c) => c.id === input.competitorId
  );
  if (!entry) throw new Error("That competitor row is gone. Refresh and retry.");
  const material: CompetitionMaterial = {
    id: uid("cm"),
    kind: input.kind,
    label,
    text,
    url,
    addedBy: input.addedBy,
    addedAt: new Date().toISOString(),
  };
  entry.materials.push(material);
  await writeRow(row);
  return material;
}

export async function removeCompetitionMaterial(
  offeringId: string,
  competitorId: string,
  materialId: string
): Promise<void> {
  const row = await readRow();
  const entry = (row.byOffering[offeringId] ?? []).find(
    (c) => c.id === competitorId
  );
  if (!entry) return;
  entry.materials = entry.materials.filter((m) => m.id !== materialId);
  await writeRow(row);
}

/** How many competitor products an offering has on file (for the tab label). */
export async function competitionCount(offeringId: string): Promise<number> {
  return (await readCompetition(offeringId)).length;
}
