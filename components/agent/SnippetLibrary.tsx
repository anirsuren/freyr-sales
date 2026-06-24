"use client";

import { useEffect, useState } from "react";
import { Library, Trash2, Check, Pencil } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import type { DraftSnippet } from "@/lib/types";

// Snippet management (V9 #41/#42) — view, rename, and prune the reusable outreach
// drafts the rep has saved from the agent's plays. Mock-first.
export function SnippetLibrary() {
  const { toast } = useToast();
  const [snippets, setSnippets] = useState<DraftSnippet[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [query, setQuery] = useState("");

  async function rename(id: string) {
    const title = draftTitle.trim();
    setEditing(null);
    if (!title) return;
    setSnippets((s) =>
      s ? s.map((x) => (x.id === id ? { ...x, title } : x)) : s
    );
    try {
      await fetch("/api/agent/snippets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title }),
      });
      toast("Snippet renamed");
    } catch {
      toast("Couldn't rename the snippet", "error");
    }
  }

  useEffect(() => {
    fetch("/api/agent/snippets")
      .then((r) => r.json())
      .then((d) => setSnippets(d.snippets || []))
      .catch(() => setSnippets([]));
  }, []);

  async function remove(id: string) {
    setBusy(id);
    try {
      const res = await fetch("/api/agent/snippets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await res.json();
      if (d.ok) {
        setSnippets((s) => (s ? s.filter((x) => x.id !== id) : s));
        toast("Snippet deleted");
      } else {
        toast("Couldn't delete the snippet", "error");
      }
    } catch {
      toast("Couldn't delete the snippet", "error");
    } finally {
      setBusy(null);
    }
  }

  if (snippets === null) return null; // pre-load

  const q = query.trim().toLowerCase();
  const visible = [...snippets]
    .filter(
      (s) =>
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.subject.toLowerCase().includes(q)
    )
    .sort((a, b) => (b.uses || 0) - (a.uses || 0));

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
          <Library size={17} strokeWidth={1.8} className="text-blue-primary" />
          Snippet library
        </h2>
        {snippets.length > 3 && (
          <input
            aria-label="Search snippets"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search snippets…"
            className="w-[200px] bg-surface border border-border rounded-md px-2.5 py-1 text-[12px] text-text-primary outline-none focus:border-blue-primary transition-colors"
          />
        )}
        <span className="text-[12px] text-text-secondary tnum shrink-0">
          {snippets.length} saved
        </span>
      </div>

      {snippets.length === 0 ? (
        <p className="text-[13px] text-text-secondary">
          No saved snippets yet — in a play, edit a draft and hit “Save as
          snippet” to reuse it later.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-[13px] text-text-secondary">
          No snippets match “{query.trim()}”.
        </p>
      ) : (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-border-light">
            {visible.map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                <span className="w-7 h-7 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={14} strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  {editing === s.id ? (
                    <input
                      autoFocus
                      aria-label="Snippet title"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") rename(s.id);
                        if (e.key === "Escape") setEditing(null);
                      }}
                      onBlur={() => rename(s.id)}
                      className="w-full bg-white border border-blue-primary rounded-md px-2 py-1 text-[13px] font-semibold text-text-primary outline-none"
                    />
                  ) : (
                    <p className="text-[13px] font-semibold text-text-primary truncate">
                      {s.title}
                    </p>
                  )}
                  <p className="text-[12px] text-text-secondary truncate">
                    {s.subject}
                  </p>
                </div>
                {(s.uses || 0) > 0 && (
                  <span className="text-[11px] font-semibold text-text-tertiary tnum shrink-0 mt-0.5">
                    {s.uses} use{s.uses === 1 ? "" : "s"}
                  </span>
                )}
                <button
                  onClick={() => {
                    setEditing(s.id);
                    setDraftTitle(s.title);
                  }}
                  aria-label={`Rename snippet ${s.title}`}
                  className="text-text-tertiary hover:text-blue-primary transition-colors shrink-0"
                >
                  <Pencil size={14} strokeWidth={1.8} />
                </button>
                <button
                  onClick={() => remove(s.id)}
                  disabled={busy === s.id}
                  aria-label={`Delete snippet ${s.title}`}
                  className="text-text-tertiary hover:text-error transition-colors shrink-0 disabled:opacity-50"
                >
                  <Trash2 size={15} strokeWidth={1.8} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
