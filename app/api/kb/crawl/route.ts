import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { crawlFreyrWebsite } from "@/lib/firecrawl";
import { extractKnowledgeBase } from "@/lib/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    const db = getDb();
    const pages = await crawlFreyrWebsite();
    const structured = await extractKnowledgeBase(pages);

    const current = await db.freyrKb.get();
    const version = (current?.version || 0) + 1;

    const updated = await db.freyrKb.update({
      structured_kb: structured,
      raw_crawl_text: pages.join("\n\n---\n\n").slice(0, 500000),
      crawled_at: new Date().toISOString(),
      page_count: pages.length,
      version,
    });

    return NextResponse.json({
      ok: true,
      kb: updated,
      page_count: pages.length,
      version,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Crawl failed" },
      { status: 500 }
    );
  }
}
