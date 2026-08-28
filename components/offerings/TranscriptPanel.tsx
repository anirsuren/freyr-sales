"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

/**
 * WHAT WAS SAID, BESIDE THE RECORDING THAT SAID IT.
 *
 * Anir, Aug 28: "When I open it, I should be able to see the transcript…
 * Maybe on the side there can be a panel here. When I click on it, it'll keep
 * the video, but it'll just move it to the left, like shrink it, obviously. On
 * the right, it'll be the transcript… and it'll obviously be timestamped, kind
 * of like a Zoom meeting."
 *
 * So: timestamped lines, the line being spoken highlighted and scrolled to,
 * a click on any line seeks the video there, and a search box because the
 * reason to read a transcript is usually to find one sentence in it.
 *
 * Editing is here rather than on a separate screen because the moment you
 * notice a wrong word is the moment you are reading it. Whisper reliably
 * mangles exactly the words that matter — "FreyaFusion" for "Freya.Fusion" —
 * and only a person watching knows what was meant. Saving rewrites the text
 * the assistant searches, so a correction changes the answers too.
 */

export type Segment = { start: number; end: number; text: string };

export type TranscriptState = {
  segments: Segment[];
  source: "machine" | "owner" | "reconciled" | "edited";
  duration?: number;
  editedBy?: string;
  editedAt?: string;
};

export function stamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60) % 60;
  const hh = Math.floor(s / 3600);
  const ss = s % 60;
  return hh > 0
    ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${mm}:${String(ss).padStart(2, "0")}`;
}

const SOURCE_LABEL: Record<TranscriptState["source"], string> = {
  machine: "Transcribed automatically",
  owner: "Supplied by the uploader",
  reconciled: "Transcribed automatically, corrected against the uploader's copy",
  edited: "Edited by hand",
};

export function TranscriptPanel({
  offeringId,
  path,
  currentTime,
  onSeek,
  onClose,
}: {
  offeringId: string;
  path: string;
  /** Where the video is now, so the spoken line can be highlighted. */
  currentTime: number;
  onSeek: (seconds: number) => void;
  onClose?: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [transcript, setTranscript] = useState<TranscriptState | null>(null);
  const [plainText, setPlainText] = useState<string | null>(null);
  const [reason, setReason] = useState<string | undefined>();
  const [canEdit, setCanEdit] = useState(false);
  const [transcribable, setTranscribable] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Segment[]>([]);
  const [busy, setBusy] = useState<"retry" | "save" | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(
      `/api/offerings/${encodeURIComponent(offeringId)}/materials/transcript?path=${encodeURIComponent(path)}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setTranscript(d.transcript ?? null);
        setPlainText(d.text ?? null);
        setReason(d.reason);
        setCanEdit(Boolean(d.canEdit));
        setTranscribable(Boolean(d.transcribable));
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [offeringId, path]);

  const segments = transcript?.segments ?? [];

  /** The line being spoken: the last one that has started. */
  const activeIndex = useMemo(() => {
    if (!segments.length) return -1;
    let found = -1;
    for (let i = 0; i < segments.length; i += 1) {
      if (segments[i].start <= currentTime + 0.25) found = i;
      else break;
    }
    return found;
  }, [segments, currentTime]);

  /* Follow the recording, but never fight the reader: while a search is open
     or the transcript is being edited, the list stays where it was put. */
  useEffect(() => {
    if (editing || query) return;
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex, editing, query]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return segments.map((s, i) => ({ s, i }));
    return segments
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.text.toLowerCase().includes(q));
  }, [segments, query]);

  async function retry() {
    setBusy("retry");
    try {
      const res = await fetch(
        `/api/offerings/${encodeURIComponent(offeringId)}/materials/transcript`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path, op: "retry" }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "That could not be transcribed.", "error");
        setReason(data.error);
        return;
      }
      setTranscript(data.transcript);
      setReason(undefined);
      toast(`Transcribed. ${data.words} words.`);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    try {
      const res = await fetch(
        `/api/offerings/${encodeURIComponent(offeringId)}/materials/transcript`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path, op: "save", segments: draft }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "That did not save.", "error");
        return;
      }
      setTranscript(data.transcript);
      setEditing(false);
      toast("Transcript saved. Freyr AI answers from it now.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col rounded-xl border border-border-light bg-white dark:bg-[var(--surface-elevated)]">
      <header className="flex items-center gap-2 border-b border-border-light px-3 py-2.5">
        <h3 className="min-w-0 flex-1 text-[13px] font-semibold text-text-primary">
          Transcript
        </h3>
        {canEdit && segments.length > 0 && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(segments.map((s) => ({ ...s })));
              setQuery("");
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-semibold text-blue-primary hover:bg-blue-light"
          >
            <Pencil size={12} strokeWidth={2.3} /> Edit
          </button>
        )}
        {editing && (
          <>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md px-1.5 py-1 text-[12px] font-semibold text-text-secondary hover:bg-[var(--surface)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy === "save"}
              className="inline-flex items-center gap-1 rounded-md bg-blue-primary px-2 py-1 text-[12px] font-semibold text-white disabled:opacity-60"
            >
              {busy === "save" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Check size={12} strokeWidth={2.6} />
              )}
              Save
            </button>
          </>
        )}
        {onClose && !editing && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide the transcript"
            className="rounded-md p-1 text-text-secondary hover:bg-[var(--surface)]"
          >
            <X size={14} strokeWidth={2.2} />
          </button>
        )}
      </header>

      {segments.length > 2 && !editing && (
        <div className="border-b border-border-light px-3 py-2">
          <span className="flex items-center gap-2 rounded-lg border border-border-light px-2.5 py-1.5">
            <Search size={13} className="shrink-0 text-text-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a line"
              aria-label="Search the transcript"
              className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-text-tertiary"
            />
          </span>
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {loading && (
          <p className="flex items-center gap-2 px-2 py-6 text-[12.5px] text-text-secondary">
            <Loader2 size={14} className="animate-spin" /> Reading the transcript…
          </p>
        )}

        {!loading && editing &&
          draft.map((seg, i) => (
            <div key={i} className="flex gap-2 px-1.5 py-1">
              <span className="mt-1.5 w-11 shrink-0 text-right text-[11px] font-semibold tnum text-text-tertiary">
                {stamp(seg.start)}
              </span>
              <textarea
                value={seg.text}
                rows={Math.max(1, Math.ceil(seg.text.length / 42))}
                aria-label={`Transcript at ${stamp(seg.start)}`}
                onChange={(e) =>
                  setDraft((d) =>
                    d.map((s, j) => (j === i ? { ...s, text: e.target.value } : s))
                  )
                }
                className="min-w-0 flex-1 resize-y rounded-md border border-border-light px-2 py-1 text-[12.5px] leading-snug outline-none focus:border-blue-subtle"
              />
            </div>
          ))}

        {!loading && !editing &&
          shown.map(({ s, i }) => (
            <button
              key={i}
              type="button"
              ref={i === activeIndex ? activeRef : undefined}
              onClick={() => onSeek(s.start)}
              className={cn(
                "flex w-full gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors",
                i === activeIndex
                  ? "bg-blue-light"
                  : "hover:bg-[var(--surface)]"
              )}
            >
              <span
                className={cn(
                  "mt-px w-11 shrink-0 text-right text-[11px] font-semibold tnum",
                  i === activeIndex ? "text-blue-primary" : "text-text-tertiary"
                )}
              >
                {stamp(s.start)}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 text-[12.5px] leading-snug",
                  i === activeIndex
                    ? "font-semibold text-text-primary"
                    : "text-text-secondary"
                )}
              >
                {s.text}
              </span>
            </button>
          ))}

        {!loading && !editing && query && shown.length === 0 && (
          <p className="px-2 py-6 text-center text-[12.5px] text-text-secondary">
            Nothing in this recording says “{query}”.
          </p>
        )}

        {/* A file with words but no timings — an uploader's own transcript, or
            a document. Still worth reading; just not clickable. */}
        {!loading && !segments.length && plainText && (
          <p className="whitespace-pre-wrap px-2 py-2 text-[12.5px] leading-relaxed text-text-secondary">
            {plainText}
          </p>
        )}

        {!loading && !segments.length && !plainText && (
          <div className="px-3 py-8 text-center">
            <p className="text-[13px] font-semibold text-text-primary">
              No transcript yet
            </p>
            <p className="mt-1 text-[12px] leading-snug text-text-secondary">
              {reason
                ? `It could not be transcribed: ${reason}`
                : transcribable
                  ? "This recording has not been transcribed."
                  : "This file has no audio to transcribe."}
            </p>
            {canEdit && transcribable && (
              <button
                type="button"
                onClick={retry}
                disabled={busy === "retry"}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-1.5 text-[12.5px] font-semibold text-blue-primary hover:border-blue-subtle hover:bg-blue-light disabled:opacity-60"
              >
                {busy === "retry" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RefreshCw size={13} strokeWidth={2.2} />
                )}
                {busy === "retry" ? "Listening to it…" : "Transcribe it now"}
              </button>
            )}
          </div>
        )}
      </div>

      {!loading && transcript && (
        <footer className="border-t border-border-light px-3 py-2 text-[11px] leading-snug text-text-tertiary">
          {SOURCE_LABEL[transcript.source]}
          {transcript.editedBy && ` · ${transcript.editedBy}`}
          {canEdit && transcribable && !editing && (
            <button
              type="button"
              onClick={retry}
              disabled={busy === "retry"}
              className="ml-2 font-semibold text-blue-primary hover:underline disabled:opacity-60"
            >
              {busy === "retry" ? "Listening…" : "Transcribe again"}
            </button>
          )}
        </footer>
      )}
    </aside>
  );
}
