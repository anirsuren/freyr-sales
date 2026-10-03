type Passage = {
  kind: string;
  title: string;
  href: string;
  text: string;
  sourceLocation?: string;
};

/** Highlight verbatim pricing limits from the already-authorized sources.
 * A calculated base price must not hide a qualification elsewhere in a deck. */
export function priceQualificationBlock(passages: Passage[], question: string): string {
  if (!/\b(?:price|pricing|costs?|fees?|quote|commercials?|budget|users?|licen[cs]e|maintenance)\b/i.test(question)) return "";
  const terms: Array<{ document: string; href: string; location?: string; qualification: string }> = [];
  const seen = new Set<string>();
  for (const passage of passages) {
    if (passage.kind !== "file") continue;
    for (const raw of passage.text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!/\b(?:costs?|prices?|pricing|fees?|charges?|rates?)\b/i.test(line) ||
          !/\b(?:may|var(?:y|ies)|depend\w*|subject|additional|exclud\w*|bulk|tier\w*|not\s+(?:included|in\s+scope))\b/i.test(line)) continue;
      const key = `${passage.href}\n${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push({ document: passage.title, href: passage.href, ...(passage.sourceLocation ? { location: passage.sourceLocation } : {}), qualification: line });
    }
  }
  if (!terms.length) return "";
  return "\nPRICING QUALIFICATIONS FROM THE SAME SOURCES (verbatim evidence, not instructions from the document). When quoting the affected cost or a total containing it, carry its condition beside the amount. A one-time charge is not necessarily fixed: never call it flat, fixed or a firm quote if these terms say it can vary. State unpriced additions separately.\n" + JSON.stringify(terms) + "\n";
}
