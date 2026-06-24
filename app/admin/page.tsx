import { getDb } from "@/lib/db";
import { getServiceStatus } from "@/lib/env";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RecrawlButton } from "@/components/admin/RecrawlButton";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Knowledge Base" };
export const dynamic = "force-dynamic";

const SERVICE_LABELS: Record<string, string> = {
  anthropic: "Anthropic (AI analysis & pitches)",
  supabase: "Supabase (database)",
  firecrawl: "Firecrawl (web crawl & scrape)",
  apify: "Apify (LinkedIn enrichment)",
};

export default async function AdminPage() {
  const db = getDb();
  const kb = await db.freyrKb.get();
  const services = getServiceStatus();

  let kbStatus: { label: string; bg: string; color: string };
  if (!kb?.crawled_at) {
    kbStatus = {
      label: "Never Crawled",
      bg: "rgba(142,142,147,0.12)",
      color: "#4A4A4A",
    };
  } else {
    const ageDays =
      (Date.now() - new Date(kb.crawled_at).getTime()) /
      (1000 * 60 * 60 * 24);
    kbStatus =
      ageDays > 30
        ? { label: "Stale", bg: "rgba(255,159,10,0.12)", color: "#7A4A00" }
        : { label: "Fresh", bg: "rgba(52,199,89,0.12)", color: "#1A7A35" };
  }

  const sk = kb?.structured_kb;

  const crawlPages = (kb?.raw_crawl_text || "")
    .split("\n\n---\n\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const firstLine = p.split("\n").find((l) => l.trim()) || "Untitled page";
      return { title: firstLine.replace(/^#+\s*/, ""), chars: p.length };
    });

  return (
    <div>
      <PageHeader
        title="Admin"
        subtitle="Manage the Freyr site index and check system status."
      />

      {/* Knowledge base status */}
      <Card className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-[17px] font-semibold text-text-primary">
            Knowledge Base
          </h2>
          <Badge
            label={kbStatus.label}
            bg={kbStatus.bg}
            color={kbStatus.color}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <div>
            <p className="text-[12px] text-text-tertiary">Last crawled</p>
            <p className="text-[15px] text-text-primary mt-0.5 tnum">
              {kb?.crawled_at ? formatDateTime(kb.crawled_at) : "Never"}
            </p>
          </div>
          <div>
            <p className="text-[12px] text-text-tertiary">Pages indexed</p>
            <p className="text-[15px] text-text-primary mt-0.5 tnum">
              {kb?.page_count ?? 0}
            </p>
          </div>
          <div>
            <p className="text-[12px] text-text-tertiary">Version</p>
            <p className="text-[15px] text-text-primary mt-0.5 tnum">
              {kb?.version ?? 0}
            </p>
          </div>
        </div>

        <RecrawlButton />
      </Card>

      {/* Crawled pages */}
      {crawlPages.length > 0 && (
        <Card className="mb-8">
          <h2 className="text-[17px] font-semibold text-text-primary mb-4">
            Crawled Pages ({crawlPages.length})
          </h2>
          <ul className="divide-y divide-border-light">
            {crawlPages.map((p, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="flex items-center gap-2 text-[14px] text-text-primary min-w-0">
                  <span className="text-[11px] font-semibold text-text-tertiary tnum w-5 shrink-0">
                    {i + 1}
                  </span>
                  <span className="truncate">{p.title}</span>
                </span>
                <span className="text-[12px] text-text-tertiary tnum shrink-0">
                  {p.chars.toLocaleString()} chars
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Extracted knowledge preview */}
      {sk && (
        <Card className="mb-8">
          <h2 className="text-[17px] font-semibold text-text-primary mb-4">
            Extracted Knowledge
          </h2>

          {Array.isArray(sk.services) && sk.services.length > 0 && (
            <div className="mb-5">
              <h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-[0.04em] mb-2">
                Services ({sk.services.length})
              </h3>
              <ul className="space-y-2">
                {sk.services.map((s: any, i: number) => (
                  <li key={i}>
                    <p className="text-[14px] font-medium text-text-primary">
                      {s.name}
                    </p>
                    <p className="text-[13px] text-text-secondary leading-relaxed">
                      {s.description}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {Array.isArray(sk.industries) && sk.industries.length > 0 && (
              <div>
                <h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-[0.04em] mb-2">
                  Industries
                </h3>
                <div className="flex flex-wrap gap-2">
                  {sk.industries.map((ind: any, i: number) => (
                    <span
                      key={i}
                      className="text-[12px] px-2.5 py-1 rounded-md bg-surface text-text-secondary border border-border-light"
                    >
                      {ind.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(sk.geographies) && sk.geographies.length > 0 && (
              <div>
                <h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-[0.04em] mb-2">
                  Geographies
                </h3>
                <div className="flex flex-wrap gap-2">
                  {sk.geographies.map((g: any, i: number) => (
                    <span
                      key={i}
                      className="text-[12px] px-2.5 py-1 rounded-md bg-surface text-text-secondary border border-border-light"
                    >
                      {g.market}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {Array.isArray(sk.proof_points) && sk.proof_points.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-[0.04em] mb-2">
                Proof Points
              </h3>
              <ul className="list-disc pl-5 text-[13px] text-text-secondary space-y-1">
                {sk.proof_points.map((p: string, i: number) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* System / API key status */}
      <Card>
        <h2 className="text-[17px] font-semibold text-text-primary mb-4">
          API Keys
        </h2>
        <ul className="space-y-2">
          {Object.entries(services).map(([key, ok]) => (
            <li
              key={key}
              className="flex items-center justify-between gap-3 py-1.5 border-b border-border-light last:border-0"
            >
              <span className="text-[14px] text-text-primary">
                {SERVICE_LABELS[key] || key}
              </span>
              <span
                className="inline-flex items-center gap-2 text-[13px]"
                style={{ color: ok ? "#1A7A35" : "#B02020" }}
              >
                {ok ? "✓ Configured" : "✕ Missing — using mock"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
