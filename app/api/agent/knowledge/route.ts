import { NextResponse } from "next/server";
import { buildKnowledgeBaseAsync } from "@/lib/knowledgeBase";
import { listOfferings } from "@/lib/offerings";
import { loadMaterialText } from "@/lib/materialText";
import { isReadByAgent } from "@/lib/offeringMaterials";

export const dynamic = "force-dynamic";

/**
 * WHAT THE ASSISTANT KNOWS, ITEMISED.
 *
 * A knowledge base you cannot see is a knowledge base you cannot trust: when
 * an answer is wrong the first question is always "what did it read?", and
 * until now the only way to find out was to read the code (Anir, Jul 29: "I
 * should be able to see the whole knowledge base... literally everything,
 * including the documents, if I want to pick and choose per chat").
 *
 * So this returns every source by name, grouped the way a person thinks about
 * them — the documents somebody uploaded, the offerings catalogue, the master
 * lists — with the size of each so "did it actually read my deck?" has a
 * number next to it. The TEXT itself is deliberately not returned: this is an
 * index, not a dump, and a page does not need 60,000 characters per file to
 * list what exists.
 */
export async function GET() {
  const [corpus, textIndex] = await Promise.all([
    buildKnowledgeBaseAsync(),
    loadMaterialText().catch(() => ({})),
  ]);

  // Files first: they are the part a person uploaded by hand and the part they
  // most want to confirm landed.
  const files: {
    id: string;
    title: string;
    offering: string;
    href: string;
    words: number;
    readByAgent: boolean;
    uploadedAt: string | null;
  }[] = [];
  for (const offering of listOfferings()) {
    for (const material of offering.materials || []) {
      if (!material.docsPath) continue;
      const entry = (textIndex as Record<string, { text?: string; extractedAt?: string }>)[
        material.docsPath
      ];
      files.push({
        // The MATERIAL id, not the storage path: that is the key the retrieval
        // passages are built from (the offering's material row, plus one
        // chunk per part as `${id}#n`). Keying this list on docsPath instead
        // meant a ticked-off document still answered, because nothing it was
        // compared against ever carried that string.
        id: material.id,
        title: material.label,
        offering: offering.offering_name,
        href: `/offerings/${offering.id}`,
        words: entry?.text?.match(/\S+/g)?.length ?? 0,
        readByAgent: isReadByAgent(material),
        uploadedAt: entry?.extractedAt ?? null,
      });
    }
  }

  const group = (kind: string) =>
    corpus
      .filter((p) => p.kind === kind)
      .map((p) => ({
        id: p.id,
        title: p.title,
        href: p.href,
        words: p.text.match(/\S+/g)?.length ?? 0,
      }));

  return NextResponse.json({
    files: files.sort((a, b) => a.offering.localeCompare(b.offering)),
    offerings: group("offering"),
    materials: group("material"),
    customerTypes: group("customer-type"),
    markets: group("market"),
    totals: {
      sources: corpus.length,
      words: corpus.reduce(
        (n, p) => n + (p.text.match(/\S+/g)?.length ?? 0),
        0
      ),
      filesRead: files.filter((f) => f.words > 0 && f.readByAgent).length,
    },
  });
}
