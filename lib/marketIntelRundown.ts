/**
 * A RUNDOWN THAT SAYS NOTHING IS NOT A RUNDOWN (Sep 13 loop). Given nothing to
 * read, the model sometimes writes about the emptiness ("No recent news items
 * or LinkedIn posts available for Qserve. Unable to provide current
 * intelligence..."), and the briefing showed that line as the company's
 * rundown above four of its own press releases. Such a line counts as no
 * rundown at all, so the card hides and the next collection writes a real one.
 */
const FILLER =
  /^(no (recent |new |current |relevant )?(news|items|posts|updates|information|data|activity)|unable to|there (is|are|was|were) no|not enough|insufficient|nothing (new|recent|to report))/i;

export function usableRundown(text: string | null | undefined): string | null {
  const line = String(text ?? "").trim();
  if (!line) return null;
  if (FILLER.test(line) || /\bunable to provide\b/i.test(line)) return null;
  return line;
}
