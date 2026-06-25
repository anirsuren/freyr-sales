"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  GripVertical,
  Search,
  Flame,
  Plus,
  Check,
  CheckSquare,
  Square,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { SizeBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { Tooltip, Term } from "@/components/ui/Tooltip";
import { stageKey } from "@/lib/glossary";
import { cn } from "@/lib/utils";
import {
  STAGES,
  STAGE_TO_OUTCOME,
  STAGE_PROBABILITY,
  ROTTING_DAYS,
  CURRENT_REP,
  formatMoney,
  type Deal,
  type Stage,
} from "@/lib/pipeline";

const ORDER_KEY = "freyr.pipeline.order.v1";
const WIP_KEY = "freyr.pipeline.wip.v1";
const VIEWS_KEY = "freyr.pipeline.views.v1";

type SavedView = { name: string; q: string; size: string; mine: boolean };
const BUILTIN_VIEWS: SavedView[] = [
  { name: "All deals", q: "", size: "all", mine: false },
  { name: "My deals", q: "", size: "all", mine: true },
  { name: "Large deals", q: "", size: "large", mine: false },
  { name: "Mid-market", q: "", size: "mid", mine: false },
];

const SIZE_FILTERS = [
  { key: "all", label: "All" },
  { key: "large", label: "Large" },
  { key: "mid", label: "Mid" },
  { key: "small", label: "Small" },
];

const EMPTY_ADD = {
  company: "",
  contactName: "",
  value: "",
  sizeTier: "mid",
  stage: "Prospect" as Stage,
};

export function PipelineBoard({ deals: initial }: { deals: Deal[] }) {
  const { toast } = useToast();
  const [deals, setDeals] = useState<Deal[]>(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [q, setQ] = useState("");
  const [size, setSize] = useState("all");
  const [mine, setMine] = useState(false); // team vs my-deals (#27)

  // saved views (V2 #4)
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [showSaveView, setShowSaveView] = useState(false);
  const [viewName, setViewName] = useState("");

  // persisted column order + WIP limits (#35)
  const [order, setOrder] = useState<Stage[]>([...STAGES]);
  const [wip, setWip] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const o = localStorage.getItem(ORDER_KEY);
      if (o) {
        const parsed: Stage[] = JSON.parse(o);
        // keep only known stages + append any missing (schema drift safe)
        const valid = parsed.filter((s) => STAGES.includes(s));
        const merged = [...valid, ...STAGES.filter((s) => !valid.includes(s))];
        setOrder(merged);
      }
      const w = localStorage.getItem(WIP_KEY);
      if (w) setWip(JSON.parse(w));
      const v = localStorage.getItem(VIEWS_KEY);
      if (v) setSavedViews(JSON.parse(v));
    } catch {}
  }, []);

  function applyView(v: SavedView) {
    setQ(v.q);
    setSize(v.size);
    setMine(v.mine);
    setViewsOpen(false);
  }
  function saveView() {
    const name = viewName.trim();
    if (!name) return;
    const next = [...savedViews.filter((s) => s.name !== name), { name, q, size, mine }];
    setSavedViews(next);
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {}
    setViewName("");
    setShowSaveView(false);
    toast(`Saved view “${name}”`);
  }

  function persistOrder(next: Stage[]) {
    setOrder(next);
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(next));
    } catch {}
  }
  function moveColumn(stage: Stage, dir: -1 | 1) {
    const i = order.indexOf(stage);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    persistOrder(next);
  }
  function setWipLimit(stage: Stage, value: string) {
    const n = Math.max(0, Math.round(Number(value.replace(/[^0-9]/g, ""))));
    const next = { ...wip };
    if (!value || !n) delete next[stage];
    else next[stage] = n;
    setWip(next);
    try {
      localStorage.setItem(WIP_KEY, JSON.stringify(next));
    } catch {}
  }

  // inline value edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  // bulk select
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState<Stage>("Qualified");

  // manual add
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const [manualSeq, setManualSeq] = useState(0);

  // Per-card agent hint (V9) — one-click re-engage on cooling deals.
  const [reengaging, setReengaging] = useState<string | null>(null);
  const [reengaged, setReengaged] = useState<Set<string>>(new Set());

  async function reengage(d: Deal) {
    setReengaging(d.sessionId);
    try {
      const res = await fetch("/api/agent/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "reengage", customerId: d.customerId }),
      });
      const data = await res.json();
      if (data.ok) {
        setReengaged((s) => new Set(s).add(d.sessionId));
        toast(`Agent drafted re-engagement for ${d.company}`);
      } else {
        toast(data.error || "Agent couldn't draft that", "error");
      }
    } catch {
      toast("Agent couldn't draft that", "error");
    } finally {
      setReengaging(null);
    }
  }

  const visible = useMemo(
    () =>
      deals.filter(
        (d) =>
          (size === "all" || d.sizeTier === size) &&
          (!mine || d.owner === CURRENT_REP) &&
          (!q ||
            d.company.toLowerCase().includes(q.toLowerCase()) ||
            d.contactName.toLowerCase().includes(q.toLowerCase()))
      ),
    [deals, q, size, mine]
  );

  const byStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const st of STAGES) map[st] = [];
    for (const d of visible) (map[d.stage] || (map[d.stage] = [])).push(d);
    return map;
  }, [visible]);

  const weighted = visible.reduce(
    (s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0),
    0
  );

  function persistStage(deal: Deal, stage: Stage) {
    if (deal.sessionId.startsWith("manual-")) return; // board-local card
    fetch(`/api/sessions/${deal.sessionId}/outcome`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: deal.customerId,
        contact_id: deal.contactId,
        outcome: STAGE_TO_OUTCOME[stage],
        notes: `Stage moved to ${stage} from pipeline board`,
      }),
    }).catch(() => {});
  }

  function onDrop(stage: Stage) {
    setOver(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const deal = deals.find((d) => d.sessionId === id);
    if (!deal || deal.stage === stage) return;
    setDeals((ds) => ds.map((d) => (d.sessionId === id ? { ...d, stage } : d)));
    toast(`${deal.company} → ${stage}`);
    persistStage(deal, stage);
  }

  function commitValue(id: string) {
    const n = Math.round(Number(editVal.replace(/[^0-9.]/g, "")));
    setEditingId(null);
    if (!Number.isFinite(n) || n <= 0) return;
    setDeals((ds) => ds.map((d) => (d.sessionId === id ? { ...d, value: n } : d)));
    toast(`Value updated to ${formatMoney(n)}`);
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function applyBulkMove() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setDeals((ds) =>
      ds.map((d) => {
        if (!selected.has(d.sessionId) || d.stage === bulkStage) return d;
        persistStage(d, bulkStage);
        return { ...d, stage: bulkStage };
      })
    );
    toast(`Moved ${ids.length} deal${ids.length > 1 ? "s" : ""} → ${bulkStage}`);
    setSelected(new Set());
    setSelectMode(false);
  }

  function submitAdd() {
    if (!addForm.company.trim()) return;
    const id = `manual-${manualSeq + 1}`;
    setManualSeq((n) => n + 1);
    const value =
      Math.round(Number(addForm.value.replace(/[^0-9.]/g, ""))) || 200000;
    const deal: Deal = {
      sessionId: id,
      customerId: id,
      contactId: id,
      company: addForm.company.trim(),
      sizeTier: addForm.sizeTier,
      contactName: addForm.contactName.trim() || "—",
      title: "Manually added",
      service: "Untriaged opportunity",
      value,
      stage: addForm.stage,
      lastActivity: new Date().toISOString(),
      staleDays: 0,
      owner: CURRENT_REP,
      createdAt: new Date().toISOString(),
    };
    setDeals((ds) => [deal, ...ds]);
    toast(`Added ${deal.company} to ${deal.stage}`);
    setAddForm(EMPTY_ADD);
    setShowAdd(false);
  }

  const inputCls =
    "w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary";

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        {/* Saved views (#4) */}
        <div className="relative shrink-0">
          <button
            onClick={() => setViewsOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={viewsOpen}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
          >
            <SlidersHorizontal size={15} strokeWidth={1.8} />
            Views
            <ChevronDown size={14} strokeWidth={2} />
          </button>
          {viewsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setViewsOpen(false)} />
              <div
                role="menu"
                aria-label="Saved views"
                className="absolute left-0 mt-2 w-[220px] bg-white border border-border-light rounded-xl shadow-card z-50 p-1.5"
              >
                <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  Built-in
                </p>
                {BUILTIN_VIEWS.map((v) => (
                  <button
                    key={v.name}
                    role="menuitem"
                    onClick={() => applyView(v)}
                    className="w-full text-left px-2.5 py-2 rounded-lg text-[13px] text-text-primary hover:bg-surface transition-colors"
                  >
                    {v.name}
                  </button>
                ))}
                {savedViews.length > 0 && (
                  <>
                    <div className="h-px bg-border-light my-1" />
                    <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      Saved
                    </p>
                    {savedViews.map((v) => (
                      <button
                        key={v.name}
                        role="menuitem"
                        onClick={() => applyView(v)}
                        className="w-full text-left px-2.5 py-2 rounded-lg text-[13px] text-text-primary hover:bg-surface transition-colors"
                      >
                        {v.name}
                      </button>
                    ))}
                  </>
                )}
                <div className="h-px bg-border-light my-1" />
                <button
                  onClick={() => {
                    setViewsOpen(false);
                    setShowSaveView(true);
                  }}
                  className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-[13px] font-medium text-blue-primary hover:bg-surface transition-colors"
                >
                  <Plus size={14} strokeWidth={2.2} />
                  Save current view…
                </button>
              </div>
            </>
          )}
        </div>
        <div className="relative sm:max-w-[240px] w-full">
          <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search deals…"
            className="w-full bg-surface border border-border rounded-md pl-9 pr-3 py-2 text-[13px] outline-none focus:border-blue-primary"
          />
        </div>
        <div className="flex gap-2">
          {SIZE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setSize(f.key)}
              className={cn(
                "text-[13px] font-medium px-3 py-1.5 rounded-md border transition-colors",
                size === f.key
                  ? "border-blue-primary bg-blue-light text-blue-primary"
                  : "border-border text-text-secondary hover:bg-surface"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="text-[13px] text-text-secondary hidden lg:block">
            <Term k="weighted" side="bottom">Weighted</Term>:{" "}
            <span className="font-semibold text-text-primary tnum">
              {formatMoney(weighted)}
            </span>
          </span>
          <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-border-light">
            {[
              { k: false, l: "Team" },
              { k: true, l: "My deals" },
            ].map((o) => (
              <button
                key={o.l}
                onClick={() => setMine(o.k)}
                aria-pressed={mine === o.k}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[12px] font-semibold transition-colors",
                  mine === o.k
                    ? "bg-white shadow-card text-text-primary"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {o.l}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setSelectMode((m) => !m);
              setSelected(new Set());
            }}
            className={cn(
              "inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-md border transition-colors",
              selectMode
                ? "border-blue-primary bg-blue-light text-blue-primary"
                : "border-border text-text-secondary hover:bg-surface"
            )}
          >
            <CheckSquare size={15} strokeWidth={1.8} />
            {selectMode ? "Done" : "Select"}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
          >
            <Plus size={15} strokeWidth={2.2} />
            Add deal
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-2.5 rounded-lg border border-blue-primary bg-blue-light">
          <span className="text-[13px] font-semibold text-blue-primary tnum">
            {selected.size} deal{selected.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[12px] text-text-secondary">Move to</span>
            <select
              aria-label="Bulk move stage"
              value={bulkStage}
              onChange={(e) => setBulkStage(e.target.value as Stage)}
              className="bg-white border border-border rounded-md px-2 py-1.5 text-[13px] outline-none focus:border-blue-primary"
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Button onClick={applyBulkMove} className="px-3 py-1.5 text-[13px]">
              Move
            </Button>
            <button
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
              className="text-text-tertiary hover:text-text-primary"
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4 stagger">
      {order.map((stage, colIdx) => {
        const items = byStage[stage] || [];
        const total = items.reduce((sum, d) => sum + d.value, 0);
        const wt = total * (STAGE_PROBABILITY[stage] ?? 0);
        const limit = wip[stage];
        const overLimit = limit != null && items.length > limit;
        return (
          <div
            key={stage}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(stage);
            }}
            onDragLeave={() => setOver((o) => (o === stage ? null : o))}
            onDrop={() => onDrop(stage)}
            className={cn(
              "w-[280px] shrink-0 rounded-xl border transition-colors",
              overLimit
                ? "border-error bg-error/5"
                : over === stage
                ? "border-blue-primary bg-blue-light/40"
                : "border-border-light bg-surface"
            )}
          >
            <div className="p-3 border-b border-border-light flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Term
                  k={stageKey(stage)}
                  side="bottom"
                  align="left"
                  underline={false}
                  className="text-[13px] font-semibold text-text-primary"
                >
                  {stage}
                </Term>
                <span
                  className={cn(
                    "text-[11px] font-semibold rounded-full px-1.5 py-0.5 tnum border",
                    overLimit
                      ? "bg-error text-white border-error"
                      : "text-text-tertiary bg-white border-border-light"
                  )}
                  title={limit != null ? `${items.length} of WIP limit ${limit}` : undefined}
                >
                  {items.length}
                  {limit != null ? `/${limit}` : ""}
                </span>
                <span className="flex items-center">
                  <button
                    onClick={() => moveColumn(stage, -1)}
                    disabled={colIdx === 0}
                    aria-label={`Move ${stage} left`}
                    className="text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => moveColumn(stage, 1)}
                    disabled={colIdx === order.length - 1}
                    aria-label={`Move ${stage} right`}
                    className="text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={14} strokeWidth={2} />
                  </button>
                </span>
              </div>
              <span className="text-right leading-tight">
                <span className="block text-[12px] font-semibold text-text-secondary tnum">
                  {formatMoney(total)}
                </span>
                <span className="block text-[10px] text-text-tertiary tnum">
                  {formatMoney(wt)}{" "}
                  <Term k="wtd" side="bottom" align="right" underline={false} className="underline decoration-dotted decoration-text-tertiary/50 underline-offset-2">
                    wtd
                  </Term>
                </span>
              </span>
            </div>
            <div className="px-3 py-1.5 border-b border-border-light flex items-center gap-1.5">
              <Term
                k="wip_limit"
                side="bottom"
                align="left"
                underline={false}
                className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary underline decoration-dotted decoration-text-tertiary/50 underline-offset-2"
              >
                WIP limit
              </Term>
              <input
                type="text"
                inputMode="numeric"
                aria-label={`WIP limit for ${stage}`}
                value={limit ?? ""}
                onChange={(e) => setWipLimit(stage, e.target.value)}
                placeholder="∞"
                className="w-12 bg-white border border-border-light rounded px-1.5 py-0.5 text-[12px] text-center tnum outline-none focus:border-blue-primary"
              />
              {overLimit && (
                <span className="text-[10px] font-bold text-error">over limit</span>
              )}
            </div>
            <div className="p-2 space-y-2 min-h-[120px]">
              {items.map((d) => {
                const isManual = d.sessionId.startsWith("manual-");
                const isSel = selected.has(d.sessionId);
                return (
                <div
                  key={d.sessionId}
                  draggable={!selectMode}
                  onDragStart={() => setDragId(d.sessionId)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  className={cn(
                    "group bg-white border rounded-lg p-3 shadow-card transition-colors",
                    selectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                    isSel ? "border-blue-primary ring-1 ring-blue-primary" : "border-border-light hover:border-blue-subtle",
                    dragId === d.sessionId ? "opacity-50" : ""
                  )}
                  onClick={() => selectMode && toggleSelect(d.sessionId)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {selectMode && (
                        <button
                          aria-label="Select deal"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(d.sessionId);
                          }}
                          className="shrink-0 mt-0.5 text-blue-primary"
                        >
                          {isSel ? (
                            <CheckSquare size={16} strokeWidth={1.8} />
                          ) : (
                            <Square size={16} strokeWidth={1.8} className="text-text-tertiary" />
                          )}
                        </button>
                      )}
                      {isManual ? (
                        <span className="text-[14px] font-semibold text-text-primary leading-tight truncate">
                          {d.company}
                        </span>
                      ) : (
                        <Link
                          href={`/deals/${d.sessionId}`}
                          className="text-[14px] font-semibold text-text-primary hover:text-blue-primary leading-tight truncate"
                        >
                          {d.company}
                        </Link>
                      )}
                    </div>
                    {!selectMode && (
                      <GripVertical
                        size={16}
                        strokeWidth={1.5}
                        className="text-text-tertiary opacity-0 group-hover:opacity-100 shrink-0"
                      />
                    )}
                  </div>
                  <p className="text-[12px] text-text-secondary mt-0.5 truncate">
                    {d.contactName} · {d.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <p className="text-[12px] text-text-tertiary truncate flex-1">
                      {d.service}
                    </p>
                    {d.staleDays > ROTTING_DAYS && d.stage !== "Closed Lost" && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-error shrink-0"
                        title={`No activity in ${d.staleDays} days`}
                      >
                        <Flame size={11} strokeWidth={2} />
                        {d.staleDays}d
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="flex items-center gap-1.5">
                      <SizeBadge tier={d.sizeTier} />
                      <Avatar
                        name={d.owner}
                        className="w-5 h-5 text-[9px]"
                        tooltip={`Owner: ${d.owner} — the rep responsible for this deal`}
                      />
                    </span>
                    {editingId === d.sessionId ? (
                      <span className="flex items-center gap-1">
                        <input
                          aria-label="Deal value"
                          autoFocus
                          value={editVal}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setEditVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitValue(d.sessionId);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onBlur={() => commitValue(d.sessionId)}
                          className="w-[88px] bg-surface border border-blue-primary rounded px-1.5 py-0.5 text-[13px] text-right outline-none tnum"
                        />
                        <button
                          aria-label="Save value"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            commitValue(d.sessionId);
                          }}
                          className="text-blue-primary"
                        >
                          <Check size={15} strokeWidth={2} />
                        </button>
                      </span>
                    ) : (
                      <button
                        aria-label="Edit deal value"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectMode) return;
                          setEditingId(d.sessionId);
                          setEditVal(String(d.value));
                        }}
                        className="text-[13px] font-semibold text-text-primary tnum hover:text-blue-primary"
                      >
                        {formatMoney(d.value)}
                      </button>
                    )}
                  </div>

                  {!selectMode &&
                    d.staleDays > ROTTING_DAYS &&
                    d.stage !== "Closed Lost" &&
                    !d.sessionId.startsWith("manual-") && (
                      <div className="mt-2.5 pt-2.5 border-t border-border-light">
                        {reengaged.has(d.sessionId) ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-success">
                            <Check size={13} strokeWidth={2.2} />
                            Agent drafted re-engagement
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              reengage(d);
                            }}
                            disabled={reengaging === d.sessionId}
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-primary hover:text-blue-hover disabled:opacity-50"
                          >
                            <Sparkles size={13} strokeWidth={1.9} />
                            {reengaging === d.sessionId
                              ? "Drafting…"
                              : "Agent: re-engage this deal"}
                          </button>
                        )}
                      </div>
                    )}
                </div>
                );
              })}
              {items.length === 0 && (
                <div className="text-[12px] text-text-tertiary text-center py-6">
                  Drop deals here
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>

      {/* Add deal modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add a deal">
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">
              Company
            </label>
            <input
              autoFocus
              value={addForm.company}
              onChange={(e) => setAddForm({ ...addForm, company: e.target.value })}
              placeholder="e.g. Northwind Bio"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">
              Primary contact
            </label>
            <input
              value={addForm.contactName}
              onChange={(e) => setAddForm({ ...addForm, contactName: e.target.value })}
              placeholder="e.g. Dr. Lena Park"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1">
                Annual value ($)
              </label>
              <input
                inputMode="numeric"
                value={addForm.value}
                onChange={(e) => setAddForm({ ...addForm, value: e.target.value })}
                placeholder="350000"
                className={cn(inputCls, "tnum")}
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1">
                Size
              </label>
              <select
                value={addForm.sizeTier}
                onChange={(e) => setAddForm({ ...addForm, sizeTier: e.target.value })}
                className={inputCls}
              >
                <option value="large">Large</option>
                <option value="mid">Mid</option>
                <option value="small">Small</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">
              Stage
            </label>
            <select
              value={addForm.stage}
              onChange={(e) => setAddForm({ ...addForm, stage: e.target.value as Stage })}
              className={inputCls}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setShowAdd(false)}>
            Cancel
          </Button>
          <Button onClick={submitAdd} disabled={!addForm.company.trim()}>
            Add to board
          </Button>
        </div>
      </Modal>

      {/* Save view modal (#4) */}
      <Modal open={showSaveView} onClose={() => setShowSaveView(false)} title="Save view">
        <p className="text-[13px] text-text-secondary mb-3">
          Saves the current search, size filter, and Team / My-deals toggle as a
          reusable view.
        </p>
        <input
          autoFocus
          value={viewName}
          onChange={(e) => setViewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveView();
          }}
          placeholder="e.g. My large biotech deals"
          className={inputCls}
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setShowSaveView(false)}>
            Cancel
          </Button>
          <Button onClick={saveView} disabled={!viewName.trim()}>
            Save view
          </Button>
        </div>
      </Modal>
    </div>
  );
}
