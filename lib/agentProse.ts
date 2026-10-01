/**
 * NO DASHES IN THE AGENT'S OWN WRITING. The prompt asks for a period, comma or
 * colon where an em dash would go, and the model still writes "($180,000,
 * Qualify stage) — Next steps..." now and then (found testing Sep 30). This is
 * the deterministic backstop, applied to the finished answer.
 *
 * RECORD NAMES ARE DATA. "GRI — Novartis (ARR)" is what the deal is called, so
 * link labels, bold names, inline code and fenced blocks pass through
 * untouched; only the prose between them changes. A dash between two numbers
 * becomes a hyphen ("10–20" -> "10-20"); any other becomes a comma.
 */
const PROTECTED = /(```[\s\S]*?```|`[^`\n]*`|\[[^\]\n]*\]\([^)\s]*\)|\*\*[^*\n]+\*\*)/g;

export function withoutProseDashes(text: string): string {
  if (!/[—–]/.test(text)) return text;
  return text
    .split(PROTECTED)
    .map((segment, index) => {
      // split() with one capture group puts the protected pieces at odd indexes.
      if (index % 2 === 1) return segment;
      return segment
        .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
        .replace(/[ \t]*[—–][ \t]*/g, ", ")
        .replace(/,\s*,/g, ",")
        .replace(/\(,\s*/g, "(")
        // A comma left at the start of a LINE goes (a dash used as a bullet). The start of a
        // segment after a link or bold name is not a line start: "[B](/x) — while" kept
        // neither the comma nor the space and read "[B](/x)while" (found testing Sep 30).
        .replace(index === 0 ? /^,[ \t]*/gm : /(?<=\n),[ \t]*/g, "");
    })
    .join("");
}

/** The app's own top-level sections: only a path into one of these becomes a link. */
const APP_SECTIONS = new Set([
  "agent", "customers", "contacts", "opportunities", "meetings", "solutioning", "contracts", "leads",
  "offerings", "performance", "market-intel", "team", "settings", "notifications", "admin", "reports",
  "pipeline", "forecast", "sessions", "tasks", "campaigns", "sequences", "components", "revenue-accruals",
]);

/* Fixed pages one level down. A record page ("/opportunities/does-not-exist")
   is never linked from a bare path: on a missing-deal page the answer linked
   the missing deal (Sep 30). Records get their links from the tools. */
const KNOWN_SUBPAGES = new Set([
  "performance/org", "performance/groups", "performance/people", "performance/evidence",
  "admin/members", "admin/goal-master", "admin/groups", "agent/settings", "agent/impact", "agent/inbox",
  "agent/plan", "agent/review", "customers/groups", "customers/targets", "market-intel/manage",
  "meetings/completed", "offerings/customer-types", "offerings/materials", "offerings/offering-categories",
  "offerings/offering-types", "reports/activity-goal-flow", "reports/customer-offering-heat-map",
]);

const KEEP_AS_IS = /(```[\s\S]*?```|\[[^\]\n]*\]\([^)\s]*\))/g;
const APP_PATH = String.raw`\/[a-z][a-z0-9-]*(?:\/[A-Za-z0-9._-]+)*(?:\?[A-Za-z0-9=&_-]+)?`;

function pageLabel(path: string): string {
  const [route, query = ""] = path.split("?");
  const tab = /(?:^|&)tab=([A-Za-z0-9_-]+)/.exec(query)?.[1];
  const parts = route.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  // An id is not a name: "/customers/40a7a3c3-..." is the customer page.
  const word = tab ?? (/\d/.test(last) && last.length > 12 ? parts[0] : last);
  return word.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

/**
 * A PAGE IS A LINK, NEVER A PATH. "Click the People performance tab at
 * `/performance/people`" showed the path as code (found testing Sep 30). A
 * bare or code-formatted path into one of the app's own sections becomes a
 * link named after it; links and fenced blocks pass through untouched, and a
 * path outside the app's sections ("and/or", "24/7") is never touched.
 */
export function linkBarePaths(text: string): string {
  const pattern = new RegExp(String.raw`\x60(${APP_PATH})\x60|(?<=^|[\s(])(${APP_PATH})(?=[\s).,;:!?]|$)`, "gm");
  return text
    .split(KEEP_AS_IS)
    .map((segment, index) =>
      index % 2 === 1
        ? segment
        : segment.replace(pattern, (all, inCode: string | undefined, bare: string | undefined) => {
            const path = inCode ?? bare ?? "";
            const parts = (path.split("?")[0] ?? "").split("/").filter(Boolean);
            const linkable = APP_SECTIONS.has(parts[0] ?? "") && (parts.length === 1 || (parts.length === 2 && KNOWN_SUBPAGES.has(`${parts[0]}/${parts[1]}`)));
            return linkable ? `[${pageLabel(path)}](${path})` : all;
          }),
    )
    .join("");
}
