// Reusable email templates for the pitch composer (V3 #2). Tokens like
// {{company}} / {{contact}} / {{rep}} are substituted at insert time.

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "intro",
    name: "Intro — submission timeline",
    subject: "Freyr × {{company}} — de-risking your submission timeline",
    body:
      "Hi {{contact}},\n\nNoticed {{company}} is moving toward a key filing. Freyr's former FDA/EMA reviewers have run 5,000+ submissions — happy to share how teams at your stage compress timelines without adding headcount.\n\nWorth a 20-minute call next week?\n\n{{rep}}\nFreyr Solutions",
  },
  {
    id: "value",
    name: "Value — reviewer credibility",
    subject: "Agency-side judgment for {{company}}'s dossiers",
    body:
      "Hi {{contact}},\n\nThe difference on a pivotal filing is usually judgment, not hours. Every Freyr dossier has former agency reviewers on it — so you catch issues before the agency does.\n\nCan I show you how we'd approach your next submission?\n\n{{rep}}",
  },
  {
    id: "breakup",
    name: "Breakup — leave the door open",
    subject: "Closing the loop, {{contact}}",
    body:
      "Hi {{contact}},\n\nI'll stop reaching out for now — I know timing is everything. If a submission or remediation lands on your desk this year, we're a good team to have on speed-dial.\n\nWishing {{company}} smooth filings,\n{{rep}}",
  },
];

export function fillTemplate(
  text: string,
  vars: { company?: string; contact?: string; rep?: string }
): string {
  return text
    .replace(/\{\{company\}\}/g, vars.company || "your team")
    .replace(/\{\{contact\}\}/g, (vars.contact || "there").split(" ")[0])
    .replace(/\{\{rep\}\}/g, vars.rep || "Suren Dheen");
}
