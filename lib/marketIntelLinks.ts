/** Accept an actual LinkedIn host, with the requested company/profile path. */
export function linkedInIdentifier(raw: string, kind: "company" | "in"): string | null {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return null;
  try {
    const url = new URL(text.includes("://") ? text : `https://${text}`);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return null;
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(new RegExp(`^/${kind}/([a-z0-9_%\\-]+)(?:/.*)?$`, "i"));
    return match?.[1] ?? null;
  } catch { return null; }
}

/** A company's feed can start with a reshared person's post. Only its own
 * company-page author can establish the company's identity and logo. */
export function companyFeedAuthor(items: any[], slug: string): any | null {
  return items.find(item => {
    const author = item?.author;
    return typeof author?.name === "string" &&
      typeof author?.company_url === "string" &&
      linkedInIdentifier(author.company_url, "company")?.toLowerCase() === slug.toLowerCase();
  })?.author ?? null;
}
