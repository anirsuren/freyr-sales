export type DocumentPassage = { text: string; location?: string };

/** Keep extracted slide/page labels on every continuation of their section.
 * Retrieval parts are arbitrary chunks, never document page numbers. */
export function documentPassages(text: string, limit = 1100): DocumentPassage[] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid passage limit");
  const passages: DocumentPassage[] = [];
  let buffer = "";
  let location: string | undefined;
  const flush = () => {
    if (buffer) passages.push({ text: buffer, ...(location ? { location } : {}) });
    buffer = "";
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const label = /^(?:\[)?(Slide|Page)\s+(\d+)(?:\])?(?::.*)?$/i.exec(line);
    if (label) {
      flush();
      location = `${label[1][0].toUpperCase()}${label[1].slice(1).toLowerCase()} ${label[2]}`;
    }
    if (buffer && buffer.length + line.length + 1 > limit) flush();
    if (line.length <= limit) {
      buffer = buffer ? `${buffer}\n${line}` : line;
      continue;
    }
    // Long lines (including a word with no whitespace) must never disappear.
    let rest = line;
    while (rest.length > limit) {
      const boundary = rest.slice(0, limit + 1).search(/\s+\S*$/);
      const at = boundary > 0 ? boundary : limit;
      passages.push({ text: rest.slice(0, at).trim(), ...(location ? { location } : {}) });
      rest = rest.slice(at).trimStart();
    }
    buffer = rest;
  }
  flush();
  return passages;
}
