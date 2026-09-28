import "server-only";
import { VIZ, VIZ_SERIES } from "@/components/charts/palette";

/**
 * A CHART THE PHONE CAN SEE.
 *
 * The agent answers with ```chart blocks; the web page draws them and
 * toWhatsAppText strips them, so on WhatsApp the person used to get the
 * sentence and none of the picture (Anir, Sep 28: "not just text but send
 * stuff... if Silvia can do it on iMessage our thing can do it on WhatsApp").
 * This renders the same specs the web parses — parseChartSpec in
 * AgentResponseChart.tsx, whose validation rules are mirrored here because
 * that module is client-marked — into a PNG that goes out as a WhatsApp
 * image. SVG text needs a real font at render time: the Mac has one, and the
 * prod image installs fonts-dejavu-core for the same reason.
 */

export type WhatsAppChartSpec = {
  type: "bar" | "donut" | "area" | "goal-progress";
  title?: string;
  unit?: string;
  format?: "money" | "number" | "percent";
  data?: { label: string; value: number; color?: string }[];
  center?: { label: string; sub?: string };
  goal?: { verified: number; pending: number; sentBack?: number; target?: number | null };
};

/** Same acceptance rules as the web's parseChartSpec: bad specs render nothing. */
export function parseWhatsAppChartSpec(raw: string): WhatsAppChartSpec | null {
  try {
    const spec = JSON.parse(raw) as WhatsAppChartSpec;
    if (!spec) return null;
    if (spec.type === "goal-progress") {
      const goal = spec.goal;
      if (!goal || !Number.isFinite(goal.verified) || !Number.isFinite(goal.pending) ||
        goal.verified < 0 || goal.pending < 0 ||
        (goal.target != null && (!Number.isFinite(goal.target) || goal.target < 0)) ||
        (goal.sentBack != null && (!Number.isFinite(goal.sentBack) || goal.sentBack < 0 || goal.sentBack > goal.pending))) return null;
      return spec;
    }
    if (!Array.isArray(spec.data) || spec.data.length === 0) return null;
    if (spec.type !== "bar" && spec.type !== "donut" && spec.type !== "area") return null;
    if (!spec.data.every((d) => typeof d.label === "string" && Number.isFinite(d.value))) return null;
    const labels = spec.data.map((d) => d.label.toLowerCase());
    if ((spec.type === "bar" || spec.type === "donut") &&
      labels.some((label) => /target|goal/.test(label)) &&
      labels.some((label) => /verified|pending|sent.back|completed/.test(label))) return null;
    return spec;
  } catch {
    return null;
  }
}

/** Every ```chart block in a reply, parsed; the malformed ones are dropped. */
export function chartSpecsIn(markdown: string): WhatsAppChartSpec[] {
  const specs: WhatsAppChartSpec[] = [];
  for (const match of String(markdown ?? "").matchAll(/```chart\s*\n([\s\S]*?)```/g)) {
    const spec = parseWhatsAppChartSpec(match[1].trim());
    if (spec) specs.push(spec);
  }
  return specs;
}

const FONT = "DejaVu Sans, Helvetica, Arial, sans-serif";
const INK = "#1D1D1F";
const INK_SOFT = "#6E6E73";
const GRID = "#E8E8ED";

function money(value: number, unit?: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: unit && /^[A-Z]{3}$/.test(unit) ? unit : "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}
function fmt(value: number, format: WhatsAppChartSpec["format"], unit?: string): string {
  if (format === "money") return money(value, unit);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value) + (format === "percent" ? "%" : "");
}
function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
/**
 * Raw SVG knows no CSS variables: an unresolved var() paints BLACK as a fill
 * and NOTHING as a stroke (the same trap as [[color-alpha-needs-color-mix]],
 * found here when VIZ.amber — "var(--ink-orange)" — turned the second series
 * black in the bar and invisible in the donut). Every palette entry is
 * resolved to a literal before it touches the SVG; the one var-valued slot is
 * pinned to its light-mode token from globals.css.
 */
const VAR_HEX: Record<string, string> = { "var(--ink-orange)": "#C2410C" };
const SERIES: string[] = VIZ_SERIES.map((c) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : VAR_HEX[c] ?? "#C2410C"));

function seriesColor(index: number, own?: string): string {
  return own && /^#[0-9a-fA-F]{3,8}$/.test(own) ? own : SERIES[index % SERIES.length];
}

const W = 1080;
const PAD = 48;
const TITLE_H = 74;

function frame(body: string, height: number, title?: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">
  <rect width="${W}" height="${height}" rx="28" fill="#FFFFFF"/>
  ${title ? `<text x="${PAD}" y="${PAD + 18}" font-family="${FONT}" font-size="30" font-weight="700" fill="${INK}">${esc(cut(title, 52))}</text>` : ""}
  ${body}
</svg>`;
}

function barSvg(spec: WhatsAppChartSpec): string {
  const rows = (spec.data ?? []).slice(0, 10);
  const top = PAD + (spec.title ? TITLE_H : 10);
  const rowH = 74;
  const height = top + rows.length * rowH + PAD - 16;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const labelW = 300;
  const barMax = W - PAD * 2 - labelW - 170;
  const body = rows.map((row, i) => {
    const y = top + i * rowH;
    const w = Math.max(6, Math.round((Math.abs(row.value) / max) * barMax));
    const color = seriesColor(i, row.color);
    return `<text x="${PAD}" y="${y + 34}" font-family="${FONT}" font-size="24" fill="${INK}">${esc(cut(row.label, 24))}</text>
    <rect x="${PAD + labelW}" y="${y + 12}" width="${barMax}" height="30" rx="15" fill="${GRID}"/>
    <rect x="${PAD + labelW}" y="${y + 12}" width="${w}" height="30" rx="15" fill="${color}"/>
    <text x="${PAD + labelW + barMax + 14}" y="${y + 34}" font-family="${FONT}" font-size="22" font-weight="600" fill="${INK_SOFT}">${esc(fmt(row.value, spec.format, spec.unit))}</text>`;
  }).join("\n");
  return frame(body, height, spec.title);
}

function donutSvg(spec: WhatsAppChartSpec): string {
  const rows = (spec.data ?? []).slice(0, 8);
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0) || 1;
  const top = PAD + (spec.title ? TITLE_H : 10);
  const r = 170, cx = PAD + r + 30, thickness = 58;
  const legendX = cx + r + 90;
  const legendRow = 56;
  const height = Math.max(top + 2 * r + PAD, top + rows.length * legendRow + PAD);
  const cy = top + r + 10;
  let angle = -Math.PI / 2;
  const arcs = rows.map((row, i) => {
    const share = Math.max(0, row.value) / total;
    const sweep = share * Math.PI * 2;
    const a0 = angle, a1 = angle + Math.max(0.004, sweep - 0.02);
    angle += sweep;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const rMid = r - thickness / 2;
    const x0 = cx + rMid * Math.cos(a0), y0 = cy + rMid * Math.sin(a0);
    const x1 = cx + rMid * Math.cos(a1), y1 = cy + rMid * Math.sin(a1);
    return `<path d="M ${x0} ${y0} A ${rMid} ${rMid} 0 ${large} 1 ${x1} ${y1}" stroke="${seriesColor(i, row.color)}" stroke-width="${thickness}" fill="none" stroke-linecap="butt"/>`;
  }).join("\n");
  const center = spec.center
    ? `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="700" fill="${INK}">${esc(cut(spec.center.label, 14))}</text>
       ${spec.center.sub ? `<text x="${cx}" y="${cy + 30}" text-anchor="middle" font-family="${FONT}" font-size="20" fill="${INK_SOFT}">${esc(cut(spec.center.sub, 20))}</text>` : ""}`
    : "";
  const legend = rows.map((row, i) => {
    const y = top + 14 + i * legendRow;
    const pct = Math.round((Math.max(0, row.value) / total) * 100);
    return `<rect x="${legendX}" y="${y}" width="22" height="22" rx="6" fill="${seriesColor(i, row.color)}"/>
    <text x="${legendX + 36}" y="${y + 18}" font-family="${FONT}" font-size="23" fill="${INK}">${esc(cut(row.label, 22))}</text>
    <text x="${W - PAD}" y="${y + 18}" text-anchor="end" font-family="${FONT}" font-size="22" font-weight="600" fill="${INK_SOFT}">${esc(fmt(row.value, spec.format, spec.unit))} · ${pct}%</text>`;
  }).join("\n");
  return frame(`${arcs}\n${center}\n${legend}`, height, spec.title);
}

function areaSvg(spec: WhatsAppChartSpec): string {
  const rows = (spec.data ?? []).slice(0, 24);
  const top = PAD + (spec.title ? TITLE_H : 10);
  const plotH = 330;
  const height = top + plotH + 96;
  const x0 = PAD + 8, x1 = W - PAD - 8;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const min = Math.min(...rows.map((r) => r.value), 0);
  const span = max - min || 1;
  const px = (i: number) => rows.length === 1 ? (x0 + x1) / 2 : x0 + (i / (rows.length - 1)) * (x1 - x0);
  const py = (v: number) => top + plotH - ((v - min) / span) * plotH;
  const pts = rows.map((row, i) => `${px(i)},${py(row.value)}`).join(" ");
  const grid = [0, 0.5, 1].map((t) => {
    const y = top + plotH * t;
    return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${GRID}" stroke-width="2"/>`;
  }).join("\n");
  const labels = rows.length > 1 ? [0, Math.floor((rows.length - 1) / 2), rows.length - 1].map((i) =>
    `<text x="${px(i)}" y="${top + plotH + 44}" text-anchor="middle" font-family="${FONT}" font-size="21" fill="${INK_SOFT}">${esc(cut(rows[i].label, 14))}</text>`
  ).join("\n") : "";
  const yLabels = `<text x="${x1}" y="${py(max) - 12}" text-anchor="end" font-family="${FONT}" font-size="21" fill="${INK_SOFT}">${esc(fmt(max, spec.format, spec.unit))}</text>`;
  return frame(`${grid}
  <polygon points="${x0},${py(min < 0 ? min : 0)} ${pts} ${x1},${py(min < 0 ? min : 0)}" fill="${VIZ.blue}22"/>
  <polyline points="${pts}" fill="none" stroke="${VIZ.blue}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
  ${labels}\n${yLabels}`, height, spec.title);
}

/** The Goals rail: verified counts now, the rest is honestly striped. */
function goalSvg(spec: WhatsAppChartSpec): string {
  const goal = spec.goal!;
  const verified = goal.verified;
  const sentBack = goal.sentBack || 0;
  const waiting = Math.max(0, goal.pending - sentBack);
  const total = verified + sentBack + waiting;
  const target = goal.target && goal.target > 0 ? goal.target : null;
  const domain = Math.max(total, target || 0, 1);
  const top = PAD + (spec.title ? TITLE_H : 10);
  const railY = top + 46, railH = 52;
  const x0 = PAD, x1 = W - PAD;
  const px = (v: number) => x0 + (v / domain) * (x1 - x0);
  const seg = (from: number, to: number, color: string, striped: boolean, key: string) => {
    const w = Math.max(0, px(to) - px(from));
    if (w <= 0) return "";
    return `<rect x="${px(from)}" y="${railY}" width="${w}" height="${railH}" fill="${striped ? `url(#stripe-${key})` : color}"/>`;
  };
  const stripes = (key: string, color: string) =>
    `<pattern id="stripe-${key}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="14" height="14" fill="${color}" opacity="0.35"/><rect width="7" height="14" fill="${color}" opacity="0.75"/>
    </pattern>`;
  const parts = [
    { key: "verified", label: "Verified, counts now", value: verified, color: "#16a34a", striped: false },
    { key: "sentback", label: "Sent back, needs a fix", value: sentBack, color: "#dc2626", striped: true },
    { key: "waiting", label: "Waiting for verification", value: waiting, color: "#eab308", striped: true },
  ];
  let at = 0;
  const rail = parts.map((p) => { const s = seg(at, at + p.value, p.color, p.striped, p.key); at += p.value; return s; }).join("\n");
  const targetTick = target
    ? `<line x1="${px(target)}" y1="${railY - 14}" x2="${px(target)}" y2="${railY + railH + 14}" stroke="${INK}" stroke-width="4" stroke-dasharray="8 6"/>
       <text x="${Math.min(px(target), x1 - 4)}" y="${railY - 24}" text-anchor="end" font-family="${FONT}" font-size="21" font-weight="600" fill="${INK}">Target ${esc(fmt(target, spec.format, spec.unit))}</text>`
    : "";
  const legend = parts.filter((p) => p.value > 0).map((p, i) => {
    const y = railY + railH + 52 + i * 38;
    return `<rect x="${x0}" y="${y - 18}" width="20" height="20" rx="5" fill="${p.color}" ${p.striped ? 'opacity="0.6"' : ""}/>
    <text x="${x0 + 32}" y="${y}" font-family="${FONT}" font-size="22" fill="${INK}">${esc(p.label)}</text>
    <text x="${x1}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="22" font-weight="600" fill="${INK_SOFT}">${esc(fmt(p.value, spec.format, spec.unit))}</text>`;
  }).join("\n");
  const totalLine = `<text x="${x0}" y="${railY - 24}" font-family="${FONT}" font-size="22" fill="${INK_SOFT}">${esc(fmt(total, spec.format, spec.unit))} recorded${target ? "" : " · no period target"}</text>`;
  const legendCount = parts.filter((p) => p.value > 0).length;
  return frame(`<defs>${parts.filter((p) => p.striped).map((p) => stripes(p.key, p.color)).join("")}</defs>
  <rect x="${x0}" y="${railY}" width="${x1 - x0}" height="${railH}" rx="10" fill="${GRID}"/>
  ${rail}\n${targetTick}\n${totalLine}\n${legend}`, railY + railH + 70 + legendCount * 38 + 24, spec.title);
}

/** PNG bytes for one spec, or null when the spec cannot be drawn. */
export async function renderChartPng(spec: WhatsAppChartSpec): Promise<Buffer | null> {
  try {
    const svg =
      spec.type === "bar" ? barSvg(spec)
      : spec.type === "donut" ? donutSvg(spec)
      : spec.type === "area" ? areaSvg(spec)
      : goalSvg(spec);
    const { default: sharp } = await import("sharp");
    return await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  } catch (error) {
    console.error("[whatsapp] chart render failed", error instanceof Error ? error.message : error);
    return null;
  }
}
