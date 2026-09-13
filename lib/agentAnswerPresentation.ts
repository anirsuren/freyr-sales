/** Model-generated follow-ups travel with the answer, without a second model call. */
export function splitAgentAnswer(text: string): { reply: string; suggestions: string[] } {
  const marker = text.lastIndexOf('<followups>');
  if (marker < 0) return { reply: text.trim(), suggestions: [] };
  const reply = text.slice(0, marker).trim();
  try {
    const raw = JSON.parse(text.slice(marker + 11).split('</followups>')[0].trim());
    const suggestions = Array.isArray(raw) ? [...new Set(raw.filter((s): s is string => typeof s === 'string').map(s => s.trim()).filter(s => s.length > 0 && s.length <= 160))].slice(0, 3) : [];
    return { reply, suggestions };
  } catch { return { reply, suggestions: [] }; }
}

/** Repair line-wrapped citation syntax before the line-based renderer runs. */
export function normalizeAgentLinks(text: string): string {
  const safeText = text.replace(/\[([^\]\n]+)\]\(([^)\n]*(?:…|\.\.\.)[^)\n]*)\)/g, '$1 (source unavailable)');
  const joined = safeText.replace(/\[([^\]\n]+)\]\s*\(\s*((?:https?:\/\/|\/)[^\s)]+)\s*\)/g, '[$1]($2)');
  return joined.replace(/```[\s\S]*?```|`[^`]*`|\[[^\]]+\]\([^\s)]+\)|https?:\/\/[^\s<>]+/g, token => {
    if (!/^https?:\/\//.test(token)) return token;
    const url = token.replace(/[.,;!?)]+$/, '');
    return `[${readableLinkLabel(url, url)}](${url})${token.slice(url.length)}`;
  });
}

export function readableLinkLabel(label: string, href: string): string {
  if (!/^https?:\/\/|^\//i.test(label)) return label;
  if (/^https?:\/\//i.test(href)) {
    try { return new URL(href).hostname.replace(/^www\./, ''); } catch { return 'Source'; }
  }
  const pages: Record<string,string> = {
    '/admin/privileges':'Privileges','/admin/members':'Team members','/admin':'Admin',
    '/team':'Team','/offerings':'Offerings','/components':'FDL Components',
    '/market-intel':'Market Intel','/leads':'Leads','/opportunities':'Opportunities',
    '/customers':'Customers','/solutioning':'Solution requests','/meetings':'Meetings',
    '/contracts':'Contracts','/performance':'Goals','/reports':'Reports','/agent':'Agent',
    '/performance/groups':'Group performance','/performance/people':'People performance',
    '/performance/org':'Org performance','/performance/goal-master':'Goal Master',
  };
  return pages[href] || 'Open record';
}
