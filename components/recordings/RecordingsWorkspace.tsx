"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Gauge,
  Download,
  Share2,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Sparkles,
  Send,
  Clock,
  Flag,
  Plus,
  Upload,
  Phone,
  MessageSquarePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { InfoHint } from "@/components/ui/InfoHint";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { DonutChart } from "@/components/charts/Charts";
import { useToast } from "@/components/ui/Toast";
import {
  RECORDINGS,
  transcriptFor,
  talkSegments,
  talkRatio,
  scoreColor,
  scoreBg,
  type Recording,
  type TalkSegment,
} from "@/lib/recordings";

const TABS = [
  { key: "summary", label: "Summary" },
  { key: "transcript", label: "Transcript" },
  { key: "comments", label: "Comments" },
  { key: "moments", label: "Key Moments" },
  { key: "quality", label: "Quality" },
];
const RATES = [1, 1.25, 1.5, 2];
const DIALERS = ["Aircall", "RingCentral", "Dialpad"];

interface RecComment {
  id: string;
  sec: number;
  body: string;
  author: string;
}

function toSec(d: string) {
  const [m, s] = d.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}
function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ScorePill({ score }: { score: number }) {
  return (
    <span
      className="inline-flex items-center text-[12px] font-bold rounded-md px-2 py-0.5 tnum"
      style={{ background: scoreBg(score), color: scoreColor(score) }}
    >
      {score}
    </span>
  );
}

/* ---------------- Player ---------------- */
function Player({
  total,
  cur,
  playing,
  rate,
  onToggle,
  onSeekFraction,
  onSkip,
  onCycleRate,
}: {
  total: number;
  cur: number;
  playing: boolean;
  rate: number;
  onToggle: () => void;
  onSeekFraction: (f: number) => void;
  onSkip: (d: number) => void;
  onCycleRate: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = total ? (cur / total) * 100 : 0;

  function seekAt(clientX: number) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    onSeekFraction(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  }
  function down(e: React.PointerEvent) {
    e.preventDefault();
    seekAt(e.clientX);
    const mv = (ev: PointerEvent) => seekAt(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="flex items-center gap-3 bg-surface border border-border-light rounded-lg px-3 py-2.5">
      <button
        onClick={() => onSkip(-10)}
        aria-label="Back 10 seconds"
        className="text-text-secondary hover:text-text-primary transition-colors"
      >
        <SkipBack size={17} strokeWidth={1.75} />
      </button>
      <button
        onClick={onToggle}
        aria-label={playing ? "Pause" : "Play"}
        className="w-9 h-9 rounded-full bg-blue-primary text-white flex items-center justify-center hover:bg-blue-hover transition-colors shrink-0"
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <button
        onClick={() => onSkip(10)}
        aria-label="Forward 10 seconds"
        className="text-text-secondary hover:text-text-primary transition-colors"
      >
        <SkipForward size={17} strokeWidth={1.75} />
      </button>
      <span className="text-[12px] text-text-secondary tnum w-9 text-right">
        {fmt(cur)}
      </span>
      <div
        ref={ref}
        onPointerDown={down}
        className="relative flex-1 h-2 rounded-full bg-border-light cursor-pointer group"
      >
        <div
          className="absolute inset-y-0 left-0 bg-blue-primary rounded-full"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-blue-primary shadow ring-2 ring-white opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${pct}%` }}
        />
      </div>
      <span className="text-[12px] text-text-tertiary tnum w-9">{fmt(total)}</span>
      <button
        onClick={onCycleRate}
        className="flex items-center gap-1 text-[12px] font-semibold text-text-secondary hover:text-text-primary border border-border-light rounded-md px-2 py-1 transition-colors tnum"
      >
        <Gauge size={14} strokeWidth={1.75} />
        {rate}x
      </button>
    </div>
  );
}

/* ---------------- Coach chat ---------------- */
function CoachChat({ rec }: { rec: Recording }) {
  const [msgs, setMsgs] = useState<{ role: "ai" | "me"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const tipIdx = useRef(0);

  useEffect(() => {
    setMsgs([
      {
        role: "ai",
        text: `I analyzed the ${rec.company} call — overall ${rec.score}/100. Ask me anything, e.g. "how could the rep have closed better?"`,
      },
    ]);
    tipIdx.current = 0;
  }, [rec.id, rec.company, rec.score]);

  function send() {
    if (!input.trim()) return;
    const me = input.trim();
    const tip =
      rec.coaching[tipIdx.current % rec.coaching.length] ||
      "Aim for a 70/30 listen ratio and always lock a concrete next step.";
    tipIdx.current += 1;
    setMsgs((m) => [...m, { role: "me", text: me }, { role: "ai", text: tip }]);
    setInput("");
  }

  return (
    <section className="hidden lg:flex w-[320px] shrink-0 bg-white border-l border-border-light flex-col">
      <div className="p-4 border-b border-border-light flex items-center gap-2">
        <Sparkles size={18} strokeWidth={1.75} className="text-blue-primary" />
        <h2 className="text-[15px] font-semibold text-text-primary">Call Coach</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
              m.role === "ai"
                ? "bg-surface text-text-primary"
                : "bg-blue-primary text-white ml-auto"
            )}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-border-light">
        <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask the coach…"
            className="flex-1 bg-transparent outline-none text-[13px] py-2 text-text-primary placeholder:text-text-tertiary"
          />
          <button onClick={send} className="text-blue-primary hover:text-blue-hover p-1" aria-label="Send">
            <Send size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Workspace ---------------- */
export function RecordingsWorkspace() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState(RECORDINGS[0].id);
  const [tab, setTab] = useState("summary");
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "score" | "duration">("recent");
  const [tq, setTq] = useState(""); // transcript search

  // playback state (lifted so transcript + key moments can drive/read it)
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);

  // timestamped coaching comments (#15) + upload/dialer (#16)
  const [comments, setComments] = useState<RecComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [fileName, setFileName] = useState("");

  const rec = RECORDINGS.find((r) => r.id === selectedId) || RECORDINGS[0];
  const total = toSec(rec.duration);
  const transcript = useMemo(() => transcriptFor(rec), [rec]);
  const segments = useMemo<TalkSegment[]>(() => talkSegments(rec), [rec]);
  const ratio = useMemo(() => talkRatio(rec), [rec]);

  // load pinned comments for the selected call
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`freyr.rec.comments.${selectedId}`);
      setComments(raw ? JSON.parse(raw) : []);
    } catch {
      setComments([]);
    }
    setCommentDraft("");
  }, [selectedId]);

  function addComment() {
    const body = commentDraft.trim();
    if (!body) return;
    const next = [
      ...comments,
      { id: `c-${Date.now()}`, sec: Math.round(cur), body, author: "Suren Dheen" },
    ].sort((a, b) => a.sec - b.sec);
    setComments(next);
    try {
      localStorage.setItem(
        `freyr.rec.comments.${selectedId}`,
        JSON.stringify(next)
      );
    } catch {}
    setCommentDraft("");
    toast(`Comment pinned at ${fmt(Math.round(cur))}`);
  }

  // reset playback when switching calls
  useEffect(() => {
    setCur(0);
    setPlaying(false);
    setRate(1);
    setTab("summary");
    setTq("");
  }, [selectedId]);

  // ticking
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(
      () => setCur((s) => Math.min(total, s + rate * 0.2)),
      200
    );
    return () => window.clearInterval(id);
  }, [playing, rate, total]);
  useEffect(() => {
    if (cur >= total && total > 0) setPlaying(false);
  }, [cur, total]);

  const activeIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < transcript.length; i++) {
      if (transcript[i].sec <= cur) idx = i;
      else break;
    }
    return idx;
  }, [transcript, cur]);

  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (tab === "transcript" && !tq)
      activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, tab, tq]);

  function seekSec(s: number) {
    setCur(Math.min(total, Math.max(0, s)));
  }

  const list = useMemo(() => {
    const filtered = RECORDINGS.filter(
      (r) =>
        !q ||
        r.company.toLowerCase().includes(q.toLowerCase()) ||
        r.contact.toLowerCase().includes(q.toLowerCase()) ||
        r.rep.toLowerCase().includes(q.toLowerCase())
    );
    const sorted = [...filtered];
    if (sortBy === "score") sorted.sort((a, b) => b.score - a.score);
    else if (sortBy === "duration")
      sorted.sort((a, b) => toSec(b.duration) - toSec(a.duration));
    return sorted;
  }, [q, sortBy]);

  const shownTranscript = tq
    ? transcript.filter((l) => l.text.toLowerCase().includes(tq.toLowerCase()))
    : transcript;

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <section className="hidden md:flex w-[340px] shrink-0 bg-surface border-r border-border-light flex-col">
        <div className="p-4 border-b border-border-light space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <h2 className="text-[17px] font-semibold text-text-primary">Recordings</h2>
              <span className="text-[10px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded bg-blue-light text-blue-primary">
                Sample
              </span>
              <InfoHint text="These are sample calls so you can explore the coaching features. Upload a recording or connect your dialer (top-right) to analyze your real ones." />
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-[12px] bg-white border border-border-light rounded-md px-2 py-1 outline-none focus:border-blue-primary"
              aria-label="Sort recordings"
            >
              <option value="recent">Recent</option>
              <option value="score">Top score</option>
              <option value="duration">Longest</option>
            </select>
          </div>
          <div className="relative">
            <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search calls, reps…"
              className="w-full bg-white border border-border-light rounded-md pl-9 pr-3 py-2 text-[13px] outline-none focus:border-blue-primary"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={cn(
                "w-full text-left px-4 py-3 border-b border-border-light transition-colors",
                r.id === selectedId ? "bg-blue-light" : "hover:bg-white"
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[14px] font-semibold text-text-primary truncate flex items-center gap-1.5">
                  {r.score < 65 && (
                    <Flag size={12} className="text-error shrink-0" strokeWidth={2} />
                  )}
                  {r.company}
                </span>
                <ScorePill score={r.score} />
              </div>
              <p className="text-[12px] text-text-secondary truncate">
                {r.contact} · {r.contactTitle}
              </p>
              <p className="text-[11px] text-text-tertiary mt-1 flex items-center gap-2">
                <Clock size={12} strokeWidth={1.5} /> {r.duration}
                <span>·</span>
                {r.date}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Detail */}
      <section className="flex-1 min-w-0 bg-white overflow-y-auto">
        <div className="px-8 pt-7 pb-5 border-b border-border-light">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2 text-[13px]">
                <span
                  className="font-bold rounded-md px-2 py-0.5"
                  style={{ background: scoreBg(rec.score), color: scoreColor(rec.score) }}
                >
                  Score {rec.score}/100
                </span>
                <span className="text-text-tertiary">·</span>
                <span className="text-text-secondary">{rec.outcome}</span>
              </div>
              <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
                {rec.title}
              </h1>
              <div className="flex items-center gap-2 mt-2 text-[13px] text-text-secondary">
                <Avatar name={rec.rep} className="w-6 h-6 text-[10px]" />
                {rec.rep} · {rec.contact} ({rec.contactTitle}) · {rec.date}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setUploadOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-primary text-white text-[13px] font-semibold hover:bg-blue-hover transition-colors"
              >
                <Plus size={15} strokeWidth={2.2} />
                Add recording
              </button>
              <button
                onClick={() => toast("Preparing download…")}
                className="p-2 border border-border-light rounded-lg hover:bg-surface transition-colors text-text-secondary"
                aria-label="Download recording"
              >
                <Download size={18} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => toast("Share link copied")}
                className="p-2 border border-border-light rounded-lg hover:bg-surface transition-colors text-text-secondary"
                aria-label="Share recording"
              >
                <Share2 size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>
          <div className="mt-4 max-w-2xl">
            <Player
              total={total}
              cur={cur}
              playing={playing}
              rate={rate}
              onToggle={() => setPlaying((p) => !p)}
              onSeekFraction={(f) => seekSec(f * total)}
              onSkip={(d) => seekSec(cur + d)}
              onCycleRate={() =>
                setRate((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length])
              }
            />
            {/* Talk-to-listen ratio meter on the timeline (#17) */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  Talk ratio
                </span>
                <span className="text-[12px] text-text-secondary tnum">
                  Rep <b className="text-text-primary">{ratio.repPct}%</b> · Prospect{" "}
                  <b className="text-text-primary">{ratio.prospectPct}%</b>
                </span>
              </div>
              <div
                className="relative h-2.5 rounded-full overflow-hidden bg-border-light flex"
                aria-label="Talk-to-listen timeline"
              >
                {segments.map((s, i) => (
                  <div
                    key={i}
                    title={`${s.speaker} talking · ${fmt(s.start)}`}
                    style={{ width: `${total ? ((s.end - s.start) / total) * 100 : 0}%` }}
                    className={s.speaker === "Rep" ? "bg-blue-primary" : "bg-blue-subtle"}
                  />
                ))}
              </div>
              <div className="flex gap-4 mt-1.5 text-[11px] text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-primary" />
                  Rep talking
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-subtle" />
                  Prospect talking
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* tabs */}
        <div
          role="tablist"
          aria-label="Call sections"
          className="px-8 border-b border-border-light flex gap-8 h-12"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "h-full flex items-center border-b-2 text-[14px] px-1 transition-colors",
                tab === t.key
                  ? "border-blue-primary text-blue-primary font-semibold"
                  : "border-transparent text-text-secondary hover:text-text-primary font-medium"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-8">
          {tab === "summary" && (
            <div className="space-y-6 max-w-3xl">
              <p className="text-[15px] text-text-secondary leading-relaxed">{rec.summary}</p>
              <div>
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3 flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-success" /> What went well
                </h3>
                <ul className="space-y-2">
                  {rec.didWell.map((d, i) => (
                    <li key={i} className="flex gap-2 text-[14px] text-text-primary">
                      <CheckCircle2 size={16} className="text-success mt-0.5 shrink-0" strokeWidth={1.75} />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3 flex items-center gap-2">
                  <AlertTriangle size={15} className="text-warning" /> Needs improvement
                </h3>
                <ul className="space-y-2">
                  {rec.needsImprovement.map((d, i) => (
                    <li key={i} className="flex gap-2 text-[14px] text-text-primary">
                      <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" strokeWidth={1.75} />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-blue-light/60 border border-blue-subtle rounded-xl p-4">
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-blue-primary mb-3 flex items-center gap-2">
                  <Lightbulb size={15} /> Coaching advice
                </h3>
                <ul className="space-y-2">
                  {rec.coaching.map((d, i) => (
                    <li key={i} className="text-[14px] text-text-primary leading-relaxed">• {d}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === "transcript" && (
            <div className="max-w-3xl">
              <div className="relative mb-4">
                <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input
                  value={tq}
                  onChange={(e) => setTq(e.target.value)}
                  placeholder="Search the transcript…"
                  className="w-full bg-surface border border-border-light rounded-md pl-9 pr-3 py-2 text-[13px] outline-none focus:border-blue-primary"
                />
              </div>
              <div className="space-y-1">
                {shownTranscript.map((l) => {
                  const active = !tq && transcript[activeIdx]?.sec === l.sec;
                  return (
                    <button
                      key={l.sec}
                      ref={active ? activeRef : undefined}
                      onClick={() => {
                        seekSec(l.sec);
                        setPlaying(true);
                      }}
                      className={cn(
                        "w-full text-left flex gap-3 px-3 py-2 rounded-lg transition-colors",
                        active ? "bg-blue-light" : "hover:bg-surface"
                      )}
                    >
                      <span className="text-[12px] font-semibold tnum text-blue-primary w-10 shrink-0 pt-0.5">
                        {l.at}
                      </span>
                      <span className="shrink-0 pt-0.5">
                        <span
                          className={cn(
                            "text-[11px] font-semibold rounded px-1.5 py-0.5",
                            l.speaker === "Rep"
                              ? "bg-blue-light text-blue-primary"
                              : "bg-surface text-text-secondary border border-border-light"
                          )}
                        >
                          {l.speaker}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "text-[14px] leading-relaxed",
                          l.key ? "text-text-primary font-medium" : "text-text-secondary"
                        )}
                      >
                        {l.text}
                      </span>
                    </button>
                  );
                })}
                {shownTranscript.length === 0 && (
                  <p className="text-[13px] text-text-tertiary px-3 py-4">
                    No transcript lines match “{tq}”.
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === "comments" && (
            <div className="max-w-3xl">
              {/* composer pinned to the current playhead */}
              <div className="bg-surface border border-border-light rounded-xl p-4 mb-5">
                <div className="flex items-center gap-2 mb-2 text-[12px] text-text-secondary">
                  <MessageSquarePlus size={15} strokeWidth={1.7} className="text-blue-primary" />
                  Pin a coaching comment at{" "}
                  <span className="font-semibold text-blue-primary tnum">{fmt(cur)}</span>
                </div>
                <textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="e.g. Great discovery question — let the prospect finish next time."
                  rows={2}
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-[14px] outline-none focus:border-blue-primary resize-y"
                />
                <div className="flex justify-end mt-2">
                  <Button
                    onClick={addComment}
                    disabled={!commentDraft.trim()}
                    className="px-4 py-2 text-[13px]"
                  >
                    <Plus size={15} strokeWidth={2.2} />
                    Pin at {fmt(cur)}
                  </Button>
                </div>
              </div>

              {comments.length === 0 ? (
                <p className="text-[13px] text-text-secondary">
                  No comments yet. Play the call and pin feedback to a moment.
                </p>
              ) : (
                <ul className="space-y-3">
                  {comments.map((c) => (
                    <li
                      key={c.id}
                      className="flex gap-3 border border-border-light rounded-lg p-3"
                    >
                      <button
                        onClick={() => seekSec(c.sec)}
                        className="shrink-0 h-fit text-[12px] font-bold text-blue-primary tnum bg-blue-light rounded-md px-2 py-1 hover:bg-blue-subtle transition-colors"
                      >
                        {fmt(c.sec)}
                      </button>
                      <div className="min-w-0">
                        <p className="text-[14px] text-text-primary leading-relaxed whitespace-pre-wrap">
                          {c.body}
                        </p>
                        <p className="text-[12px] text-text-tertiary mt-1">{c.author}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "moments" && (
            <div className="relative pl-6 space-y-5 max-w-3xl before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border-light">
              {rec.keyMoments.map((m, i) => {
                const c = m.tone === "good" ? "#34C759" : m.tone === "warn" ? "#FF9F0A" : "#8E8E93";
                return (
                  <button
                    key={i}
                    onClick={() => {
                      seekSec(toSec(m.at));
                      setTab("transcript");
                      setPlaying(true);
                    }}
                    className="relative block text-left w-full hover:bg-surface rounded-lg p-2 -ml-2 transition-colors group"
                  >
                    <span
                      className="absolute left-[-15px] top-3 w-3.5 h-3.5 rounded-full ring-4 ring-white"
                      style={{ background: c }}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold tnum text-blue-primary group-hover:underline">
                        {m.at}
                      </span>
                      <span className="text-[13px] font-semibold text-text-primary">{m.label}</span>
                      <Play size={11} className="text-text-tertiary opacity-0 group-hover:opacity-100" />
                    </div>
                    <p className="text-[14px] text-text-secondary italic mt-1">“{m.quote}”</p>
                  </button>
                );
              })}
            </div>
          )}

          {tab === "quality" && (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-8 items-center max-w-3xl">
              <div className="space-y-4">
                {rec.quality.map((q2) => (
                  <div key={q2.label}>
                    <div className="flex justify-between text-[13px] mb-1">
                      <span className="text-text-secondary">{q2.label}</span>
                      <span className="font-semibold tnum" style={{ color: scoreColor(q2.score) }}>
                        {q2.score}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-surface overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${q2.score}%`, background: scoreColor(q2.score) }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-center">
                <DonutChart
                  segments={[
                    { label: "Score", value: rec.score, color: "#0071E3" },
                    { label: "Gap", value: 100 - rec.score, color: "#EEF0F3" },
                  ]}
                  centerLabel={`${rec.score}`}
                  centerSub="overall"
                />
                <p className="text-[12px] text-text-tertiary mt-2">Call quality</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <CoachChat rec={rec} />

      {/* Upload recording / connect a dialer (#16) */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Add a recording">
        <div className="space-y-5">
          <div>
            <p className="text-[13px] font-semibold text-text-primary mb-2">
              Upload an audio file
            </p>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl px-4 py-6 cursor-pointer hover:border-blue-subtle hover:bg-surface transition-colors text-center">
              <Upload size={22} strokeWidth={1.6} className="text-blue-primary" />
              <span className="text-[13px] text-text-secondary">
                {fileName || "Click to choose an .mp3 / .wav / .m4a file"}
              </span>
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
              />
            </label>
            <div className="flex justify-end mt-3">
              <Button
                disabled={!fileName}
                onClick={() => {
                  toast(`Uploaded “${fileName}” — transcription queued`);
                  setFileName("");
                  setUploadOpen(false);
                }}
                className="px-4 py-2 text-[13px]"
              >
                Upload & transcribe
              </Button>
            </div>
          </div>

          <div className="border-t border-border-light pt-4">
            <p className="text-[13px] font-semibold text-text-primary mb-1">
              Or connect a dialer
            </p>
            <p className="text-[12px] text-text-tertiary mb-3">
              Calls land here automatically and get coached.
            </p>
            <div className="flex flex-wrap gap-2">
              {DIALERS.map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    toast(`Connected to ${d}`);
                    setUploadOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-[13px] font-medium text-text-primary hover:border-blue-subtle hover:bg-surface transition-colors"
                >
                  <Phone size={15} strokeWidth={1.7} className="text-blue-primary" />
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
