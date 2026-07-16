"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  PhoneIncoming,
  PhoneOutgoing,
  Search,
  SearchX,
  UserRound,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export type ContactConversationItem = {
  id: string;
  href?: string;
  contactName: string;
  company?: string;
  direction: "inbound" | "outbound";
  agentName?: string;
  agentColor?: string;
  outcomeLabel?: string;
  outcomeClassName?: string;
  startedAt: string;
  duration: string;
  summary: string;
  transcript: Array<{
    role: "agent" | "user";
    speaker: string;
    message: string;
    time?: string;
  }>;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const pattern = new RegExp(`(${escapeRegExp(needle)})`, "ig");
  return (
    <>
      {text.split(pattern).map((part, index) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <mark
            key={`${part}-${index}`}
            className="rounded-sm bg-warning/20 px-0.5 font-semibold text-text-primary"
          >
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}

function searchableText(item: ContactConversationItem) {
  return [
    item.contactName,
    item.company,
    item.agentName,
    item.direction,
    item.outcomeLabel,
    item.summary,
    ...item.transcript.flatMap((turn) => [turn.speaker, turn.message]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function transcriptMatch(item: ContactConversationItem, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  return item.transcript.find((turn) => turn.message.toLowerCase().includes(needle)) || null;
}

export function ContactConversations({
  firstName,
  items,
}: {
  firstName: string;
  items: ContactConversationItem[];
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => searchableText(item).includes(needle));
  }, [items, query]);

  if (items.length === 0) {
    return (
      <section>
        <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          Conversations <span className="text-text-primary tnum">(0)</span>
        </h2>
        <Card>
          <p className="text-[13px] text-text-secondary">
            No calls with {firstName} yet. When the first call lands, its recording,
            transcript, summary, and analysis will appear here.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section aria-labelledby="contact-conversations-heading">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2
            id="contact-conversations-heading"
            className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary"
          >
            Conversations <span className="text-text-primary tnum">({items.length})</span>
          </h2>
          <p className="mt-1 text-[12px] text-text-tertiary">
            Every call with {firstName}, searchable down to the exact transcript phrase.
          </p>
        </div>
        {query && (
          <span className="shrink-0 text-[12px] text-text-tertiary tnum">
            {matches.length} {matches.length === 1 ? "match" : "matches"}
          </span>
        )}
      </div>

      <div className="relative mb-3">
        <Search
          size={16}
          strokeWidth={1.8}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search conversations, summaries, or transcripts..."
          aria-label="Search conversations, summaries, or transcripts"
          className="h-11 w-full rounded-lg border border-border bg-white pl-10 pr-10 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary focus:ring-2 focus:ring-blue-primary/10"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear conversation search"
            className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-tertiary hover:bg-surface hover:text-text-primary"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>

      {matches.length === 0 ? (
        <Card className="flex items-center gap-3 py-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-text-tertiary">
            <SearchX size={17} strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-text-primary">No transcript matches</p>
            <p className="mt-0.5 text-[12px] text-text-tertiary">
              Try a person, company, outcome, topic, or a phrase used during the call.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3 stagger">
          {matches.map((item) => {
            const DirectionIcon = item.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
            const matchedTurn = transcriptMatch(item, query);
            const previewTurn =
              item.transcript.find((turn) => turn.role === "user") ||
              item.transcript[0];
            const body = (
              <Card className="group overflow-hidden p-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-card-hover">
                <div className="flex items-start gap-3 px-5 py-4">
                  <span
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{ background: item.agentColor || "#0B73E0" }}
                  >
                    <DirectionIcon size={18} strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-text-primary group-hover:text-blue-primary">
                        {item.direction === "inbound" ? "Inbound" : "Outbound"} call with {item.contactName}
                      </span>
                      {item.outcomeLabel && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]",
                            item.outcomeClassName
                          )}
                        >
                          {item.outcomeLabel}
                        </span>
                      )}
                      <span className="ml-auto whitespace-nowrap text-[12px] text-text-tertiary tnum">
                        {item.startedAt}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-tertiary">
                      {item.agentName && (
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound size={12} strokeWidth={1.8} />
                          {item.agentName}
                        </span>
                      )}
                      {item.company && (
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 size={12} strokeWidth={1.8} />
                          {item.company}
                        </span>
                      )}
                      <span className="tnum">{item.duration}</span>
                    </div>

                    <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-text-secondary">
                      <HighlightedText text={item.summary} query={query} />
                    </p>

                    {(matchedTurn || previewTurn) && (
                      <div
                        className={cn(
                          "mt-3 rounded-md border px-3 py-2.5",
                          matchedTurn
                            ? "border-warning/30 bg-warning/[0.06]"
                            : "border-border-light bg-surface/55"
                        )}
                      >
                        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                          <span>{matchedTurn ? "Transcript match" : "Conversation preview"}</span>
                          {(matchedTurn || previewTurn)?.time && (
                            <span className="tnum">{(matchedTurn || previewTurn)?.time}</span>
                          )}
                        </div>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-text-primary">
                          <span className="font-semibold">{(matchedTurn || previewTurn)?.speaker}: </span>
                          <HighlightedText
                            text={(matchedTurn || previewTurn)?.message || ""}
                            query={query}
                          />
                        </p>
                      </div>
                    )}
                  </div>
                  {item.href && (
                    <ArrowRight
                      size={16}
                      strokeWidth={1.7}
                      className="mt-1 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-blue-primary"
                    />
                  )}
                </div>
              </Card>
            );

            return item.href ? (
              <Link key={item.id} href={item.href} className="block" aria-label={`Open call with ${item.contactName} from ${item.startedAt}`}>
                {body}
              </Link>
            ) : (
              <div key={item.id}>{body}</div>
            );
          })}
        </div>
      )}
    </section>
  );
}
