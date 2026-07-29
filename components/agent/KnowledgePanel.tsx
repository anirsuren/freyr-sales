"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  FileText,
  Package,
  Users,
  Globe,
  BotOff,
  CheckCheck,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * EVERYTHING THE ASSISTANT KNOWS, ON SCREEN, AND PICKABLE FOR THIS CHAT.
 *
 * Two things a person needs and could not get before (Anir, Jul 29: "I should
 * be able to see the whole knowledge base... literally everything, including
 * the documents, if I want to pick and choose per chat").
 *
 * SEEING IT: when an answer is wrong the first question is "what did it read?"
 * Every source is listed by name with its size, so a deck that uploaded but
 * came back empty is visible as 0 words instead of being a mystery.
 *
 * PICKING IT: a chat about one offering should not be able to drift into
 * another's pricing. Ticking a subset scopes THIS conversation to it — the
 * whole base stays available to every other chat, so narrowing is never
 * destructive.
 */

export type KnowledgeSource = {
  id: string;
  title: string;
  href: string;
  words: number;
  offering?: string;
  readByAgent?: boolean;
};

type Knowledge = {
  files: KnowledgeSource[];
  offerings: KnowledgeSource[];
  materials: KnowledgeSource[];
  customerTypes: KnowledgeSource[];
  markets: KnowledgeSource[];
  totals: { sources: number; words: number; filesRead: number };
};

export function KnowledgePanel({
  open,
  onClose,
  selected,
  onSelectedChange,
}: {
  open: boolean;
  onClose: () => void;
  /** Empty = the whole base. Anything else scopes this chat to those ids. */
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
}) {
  const [data, setData] = useState<Knowledge | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    fetch("/api/agent/knowledge")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [open, data]);

  const toggle = (id: string) =>
    onSelectedChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id]
    );

  const groups: {
    key: keyof Knowledge;
    label: string;
    icon: typeof FileText;
    blurb: string;
  }[] = [
    {
      key: "files",
      label: "Uploaded documents",
      icon: FileText,
      blurb: "Decks, one-pagers and transcripts the assistant has read.",
    },
    {
      key: "offerings",
      label: "Offerings",
      icon: Package,
      blurb: "What each offering is, who it suits and where it sells.",
    },
    {
      key: "customerTypes",
      label: "Customer types",
      icon: Users,
      blurb: "The segments in Suren's master list.",
    },
    { key: "markets", label: "Markets", icon: Globe, blurb: "Where we sell." },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Knowledge base" size="wide">
      {loading && !data ? (
        <p className="py-8 text-center text-[13px] text-text-secondary">
          Reading what the assistant knows…
        </p>
      ) : !data ? (
        <p className="py-8 text-center text-[13px] text-text-secondary">
          Couldn&apos;t load the knowledge base.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light pb-3">
            <p className="text-[12.5px] text-text-secondary">
              <span className="font-semibold text-text-primary">
                {data.totals.sources}
              </span>{" "}
              sources ·{" "}
              <span className="font-semibold text-text-primary">
                {data.totals.words.toLocaleString()}
              </span>{" "}
              words ·{" "}
              <span className="font-semibold text-text-primary">
                {data.totals.filesRead}
              </span>{" "}
              {data.totals.filesRead === 1 ? "file" : "files"} read
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-tertiary">
                {selected.length === 0
                  ? "This chat uses everything"
                  : `This chat uses ${selected.length} selected`}
              </span>
              {selected.length > 0 && (
                <button
                  onClick={() => onSelectedChange([])}
                  className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
                >
                  <CheckCheck size={13} strokeWidth={2.1} /> Use everything
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 max-h-[58vh] space-y-5 overflow-y-auto pr-1">
            {groups.map(({ key, label, icon: Icon, blurb }) => {
              const rows = (data[key] as KnowledgeSource[]) || [];
              if (!rows.length) return null;
              return (
                <section key={key}>
                  <header className="mb-2 flex items-center gap-2">
                    <Icon
                      size={14}
                      strokeWidth={1.9}
                      className="shrink-0 text-blue-primary"
                    />
                    <h3 className="text-[13px] font-semibold text-text-primary">
                      {label}
                    </h3>
                    <span className="tnum text-[11.5px] text-text-tertiary">
                      {rows.length}
                    </span>
                    <span className="min-w-0 text-[11.5px] text-text-tertiary">
                      · {blurb}
                    </span>
                  </header>
                  <ul className="divide-y divide-border-light rounded-lg border border-border-light">
                    {rows.map((row) => {
                      const picked = selected.includes(row.id);
                      const blind = row.readByAgent === false;
                      return (
                        <li
                          key={row.id}
                          className="flex items-center gap-2.5 px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={picked}
                            onChange={() => toggle(row.id)}
                            aria-label={`Use ${row.title} in this chat`}
                            className="h-4 w-4 shrink-0 cursor-pointer accent-[color:#0071E3]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-[13px] font-medium text-text-primary">
                              {row.title}
                            </span>
                            {row.offering && (
                              <span className="block text-[11.5px] text-text-tertiary">
                                {row.offering}
                              </span>
                            )}
                          </span>
                          {blind && (
                            <span
                              title="The assistant never reads this file"
                              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                              style={{
                                color: "#475569",
                                background: "rgba(71,85,105,0.10)",
                              }}
                            >
                              <BotOff size={11} strokeWidth={2} /> Not used
                            </span>
                          )}
                          {/* The number that answers "did my upload work?" */}
                          <span
                            className={`tnum shrink-0 text-[11.5px] ${
                              row.words === 0
                                ? "font-semibold text-[color:#B02020]"
                                : "text-text-tertiary"
                            }`}
                          >
                            {row.words === 0
                              ? "no text"
                              : `${row.words.toLocaleString()} words`}
                          </span>
                          <Link
                            href={row.href}
                            className="shrink-0 text-[11.5px] font-semibold text-blue-primary hover:underline"
                          >
                            Open
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** The rail entry that opens it. */
export function KnowledgeRailButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-text-secondary transition-colors hover:bg-surface"
    >
      <BookOpen size={16} strokeWidth={1.7} /> Knowledge base
    </button>
  );
}
