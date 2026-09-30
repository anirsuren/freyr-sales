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
        .replace(/^,\s*/gm, "");
    })
    .join("");
}
