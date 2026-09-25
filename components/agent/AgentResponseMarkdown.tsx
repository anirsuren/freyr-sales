"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { normalizeAgentLinks, readableLinkLabel } from "@/lib/agentAnswerPresentation";
import { injectEntities, entityLink, entitiesForAnswer, type Entity } from "@/components/agent/EntityPills";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { ChatChart, parseChartSpec } from "@/components/agent/AgentResponseChart";

/**
 * The pages this app actually has. A code span naming one of them is turned
 * into a link; anything else stays literal text, so the agent can never mint a
 * route that 404s or point at an API endpoint.
 */
const APP_ROUTES = new Set([
  "agent",
  "offerings",
  "components",
  "opportunities",
  "customers",
  "contacts",
  "team",
  "reports",
  "performance",
  "market-intel",
  "admin",
  "pipeline",
  "forecast",
  "analytics",
  "activity",
  "tasks",
  "sessions",
  "sequences",
  "campaigns",
  "recordings",
  "voice",
  "deals",
  "dashboard",
  "settings",
  "notifications",
  "search",
]);

// --- lightweight markdown: [link](/path), **bold**, *italic*, `code` + bullets -
// Only app paths and HTTP(S) citations become links; other schemes remain text.
// The `entities` index turns bare names in the plain-text runs into pills.
// Markdown links are handled below and are left alone.
function renderInline(
  s: string,
  keyBase: string,
  entities: Entity[] = [],
  linkable = true
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last)
      nodes.push(
        ...injectEntities(s.slice(last, m.index), entities, `${keyBase}-t${k++}`, linkable)
      );
    if (m[2] != null && m[3] != null) {
      const href = m[3];
      const label = readableLinkLabel(m[2], href);
      const badge = entityLink(href, label, entities, `${keyBase}-${k++}`);
      if (badge) { nodes.push(badge); last = m.index + m[0].length; continue; }
      if (/^https?:\/\//i.test(href)) {
        nodes.push(<a key={`${keyBase}-${k++}`} href={href} target="_blank" rel="noopener noreferrer" className="text-blue-primary font-medium underline decoration-blue-subtle underline-offset-2 hover:decoration-blue-primary">{label}</a>);
        last = m.index + m[0].length; continue;
      }
      // Company/contact mentions render as a proper PILL: logo/headshot + bold
      // name in a rounded chip, not a bare blue link (Suren: "make it an actual
      // pill with the logo and the name bolded"). Still deep-links through.
      const isCompany = href.startsWith("/customers/");
      const isContact = href.startsWith("/contacts/");
      nodes.push(
        isCompany || isContact ? (
          <Link
            key={`${keyBase}-${k++}`}
            href={href}
            className="inline-flex items-center gap-1 align-middle rounded-full bg-blue-light/70 border border-blue-subtle/60 pl-1 pr-2 py-0.5 mx-0.5 font-semibold text-blue-primary no-underline hover:bg-blue-light hover:border-blue-subtle transition-colors"
          >
            {isCompany ? (
              <CompanyLogo name={label} className="w-4 h-4 text-[7px] shrink-0" />
            ) : (
              <Avatar name={label} className="w-4 h-4 text-[7px] shrink-0" />
            )}
            {label}
          </Link>
        ) : (
          <Link key={`${keyBase}-${k++}`} href={href} className="text-blue-primary font-medium hover:underline">
            {label}
          </Link>
        )
      );
    }
    // Emphasis carries entities through too, so a bolded name is still a pill
    // (Anir, Aug 15). Bare **Name** was the assistant's most common way of
    // naming somebody and the one shape that never pilled.
    else if (m[4] != null)
      nodes.push(
        <strong key={`${keyBase}-${k++}`}>
          {renderInline(m[4], `${keyBase}-b${k}`, entities, linkable)}
        </strong>
      );
    else if (m[5] != null)
      nodes.push(
        <strong key={`${keyBase}-${k++}`}>
          {renderInline(m[5], `${keyBase}-b${k}`, entities, linkable)}
        </strong>
      );
    else if (m[6] != null)
      nodes.push(
        <em key={`${keyBase}-${k++}`}>
          {renderInline(m[6], `${keyBase}-i${k}`, entities, linkable)}
        </em>
      );
    else if (m[7] != null)
      nodes.push(
        <em key={`${keyBase}-${k++}`}>
          {renderInline(m[7], `${keyBase}-i${k}`, entities, linkable)}
        </em>
      );
    else if (m[8] != null) {
      /**
       * A PATH IN BACKTICKS IS A DOOR (Anir, Aug 20: "you should have the
       * tags. I should be able to click, and you should be able to have a
       * link, and it takes me there").
       *
       * The agent answers "go to FDL Components (`/components`)" all day, and
       * every one of those was dead grey text you had to retype into the
       * address bar. Fixing the PROMPT would only help the next answer; this
       * fixes every answer, including the ones already on screen. Only paths
       * whose first segment is a real page in this app become links, so a
       * `/tmp/foo` or a `/api/...` in a code span stays exactly what it is.
       */
      const path = m[8].trim();
      const head = path.split(/[/?#]/)[1] ?? "";
      if (/^\/[A-Za-z0-9/_?=&.,%-]*$/.test(path) && APP_ROUTES.has(head)) {
        nodes.push(
          <Link
            key={`${keyBase}-${k++}`}
            href={path}
            className="inline-flex items-center rounded bg-blue-light/70 border border-blue-subtle/60 px-1.5 py-0.5 font-semibold text-blue-primary no-underline hover:bg-blue-light hover:border-blue-subtle transition-colors"
          >
            {readableLinkLabel(path, path)}
          </Link>
        );
      } else {
        nodes.push(
          <code key={`${keyBase}-${k++}`} className="px-1 py-0.5 rounded bg-border-light text-[13px]">
            {m[8]}
          </code>
        );
      }
    }
    last = m.index + m[0].length;
  }
  if (last < s.length)
    nodes.push(...injectEntities(s.slice(last), entities, `${keyBase}-t${k++}`, linkable));
  return nodes;
}


export function AgentResponseMarkdown({
  text,
  entities: allEntities = [],
  entityContext = [],
  linkable = true,
}: {
  text: string;
  entities?: Entity[];
  entityContext?: string[];
  linkable?: boolean;
}) {
  const entities = entitiesForAnswer(text, allEntities, entityContext);
  const lines = normalizeAgentLinks(text).split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={key} className="list-disc pl-5 space-y-1 my-1.5">
        {items.map((it, idx) => (
          <li key={idx}>{renderInline(it, `${key}-${idx}`, entities, linkable)}</li>
        ))}
      </ul>
    );
  };

  const isTableRow = (l: string) => /^\s*\|.+\|/.test(l);
  const isTableSep = (l: string) => /^\s*\|[\s\-:|]+\|\s*$/.test(l);
  const splitRow = (l: string) =>
    l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // ```chart fenced block → a real chart. An unclosed fence means the
    // typewriter is mid-reveal — hide it until it finishes rather than
    // flashing raw JSON.
    const fence = line.trim().match(/^```(\w*)\s*$/);
    if (fence) {
      flush(`ul-${i}`);
      let j = i + 1;
      const body: string[] = [];
      while (j < lines.length && !/^```\s*$/.test(lines[j].trim())) {
        body.push(lines[j]);
        j++;
      }
      const closed = j < lines.length;
      if (!closed) break; // streaming: wait for the closing fence
      if (fence[1] === "chart") {
        const spec = parseChartSpec(body.join("\n"));
        if (spec) blocks.push(<ChatChart key={`ch-${i}`} spec={spec} />);
      } else {
        blocks.push(
          <pre
            key={`code-${i}`}
            className="my-2 overflow-x-auto rounded-lg bg-surface px-3 py-2 text-[12px] leading-relaxed"
          >
            {body.join("\n")}
          </pre>
        );
      }
      i = j + 1;
      continue;
    }

    // Markdown table → a real table, cells still through renderInline so the
    // company/contact pills keep working inside it (Anir: "make sure I can do
    // tables… I like the tag for the company").
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush(`ul-${i}`);
      const header = splitRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j])) {
        rows.push(splitRow(lines[j]));
        j++;
      }
      blocks.push(
        <div key={`tbl-${i}`} className="agent-response-table my-2 max-w-full overflow-x-auto rounded-lg border border-border-light">
          <table className="w-max min-w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-surface/70">
                {header.map((h, hi) => (
                  <th
                    key={hi}
                    className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary"
                  >
                    {renderInline(h, `th-${i}-${hi}`, entities, linkable)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t border-border-light">
                  {r.map((c, ci) => (
                    <td key={ci} className="whitespace-nowrap px-3 py-2 align-middle">
                      {renderInline(c, `td-${i}-${ri}-${ci}`, entities, linkable)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = j;
      continue;
    }

    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*$/);
    if (heading) {
      flush(`ul-${i}`);
      blocks.push(<h3 key={`h-${i}`} className="mt-3 mb-1 font-semibold">{renderInline(heading[1], `h-${i}`, entities, linkable)}</h3>);
      i++;
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      i++;
      continue;
    }
    flush(`ul-${i}`);
    if (line.trim() === "") {
      blocks.push(<div key={`sp-${i}`} className="h-2.5" />);
      i++;
      continue;
    }
    blocks.push(
      <p key={`p-${i}`} className="whitespace-pre-wrap">
        {renderInline(line, `p-${i}`, entities, linkable)}
      </p>
    );
    i++;
  }
  flush("ul-end");
  return <>{blocks}</>;
}

