"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Flame,
  Plus,
  CheckSquare,
  Square,
  X,
  ChevronDown,
  SlidersHorizontal,
  Sparkles,
  Layers,
  UserRound,
  Bookmark,
  type LucideIcon,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { SizeBadge, SIZE_TIER_META } from "@/components/ui/Badge";
import { ColorSelect, type ColorOption , MultiColorSelect } from "@/components/ui/ColorSelect";
import {
  SearchPriority,
  PrioritySearchInput,
  PriorityLabel,
  PriorityTooltip,
} from "@/components/ui/SearchPriority";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { ServiceTag } from "@/components/ui/OfferingIcon";
import { Modal } from "@/components/ui/Modal";
import { Term } from "@/components/ui/Tooltip";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { stageKey } from "@/lib/glossary";
import { userScopedStorageKey } from "@/lib/userIdentity";
import { cn } from "@/lib/utils";
import {
  STAGES,
  STAGE_COLOR,
  STAGE_ICON,
  STAGE_TO_OUTCOME,
  ROTTING_DAYS,
  formatMoney,
  type Deal,
  type Stage,
} from "@/lib/pipeline";
import { tint } from "@/lib/tint";

const WIP_KEY = "freyr.pipeline.wip.v1";
const VIEWS_KEY = "freyr.pipeline.views.v1";

// Filtering must never move the page under the reader. Narrowing to "Large
// deals" empties most columns, the document gets shorter, and the browser yanks
// the viewport upward (Suren: "it shoots my screen up very badly… It's okay if
// the pipeline looks empty. You can't shift my screen like that").
//
// Primary fix: the board keeps a floor height, so it can't collapse no matter
// how few deals survive the filter. Columns stretch to fill it, so the floor
// costs nothing in dead space when the board is full.
const BOARD_MIN_H = 460;
const COLUMN_BODY_MIN_H = 320;

type SavedView = { name: string; q: string; size: string[]; mine: boolean };
const BUILTIN_VIEWS: SavedView[] = [
  { name: "All deals", q: "", size: [], mine: false },
  { name: "My deals", q: "", size: [], mine: true },
  { name: "Large deals", q: "", size: ["large"], mine: false },
  { name: "Mid-market", q: "", size: ["mid"], mine: false },
  // Small was simply missing — you could jump to large and mid deals but never
  // small ones (Anir, Jul 26: "I can't even sort by the small deals… I think
  // you just forgot about it").
  { name: "Small deals", q: "", size: ["small"], mine: false },
];

// Colour + icon per view, same standard as every ColorSelect menu — the
// plain-text list read as unfinished next to the rest of the app (Anir:
// "make this dropdown a little good, please, like the rest").
//
// The three size views pull straight from SIZE_TIER_META so a "Large deals"
// view always wears the same colour and glyph as the LARGE badge on the cards
// it filters to — they had drifted apart (Anir: "the icons and the colors don't
// even match with what you have currently").
const VIEW_META: Record<string, { color: string; icon: LucideIcon }> = {
  "All deals": { color: "var(--ink-bright-blue)", icon: Layers },
  "My deals": { color: "var(--ink-violet-soft)", icon: UserRound },
  "Large deals": SIZE_TIER_META.large,
  "Mid-market": SIZE_TIER_META.mid,
  "Small deals": SIZE_TIER_META.small,
};

// Stage pickers get the same colour + glyph as the board headers. A native
// <option> can carry neither, which is why these use ColorSelect.
const STAGE_OPTIONS: ColorOption[] = STAGES.map((s) => ({
  value: s,
  label: s,
  color: STAGE_COLOR[s],
  icon: STAGE_ICON[s],
}));

const SIZE_OPTIONS: ColorOption[] = (["large", "mid", "small"] as const).map((k) => ({
  value: k,
  label: k === "mid" ? "Mid" : k === "large" ? "Large" : "Small",
  color: SIZE_TIER_META[k].color,
  icon: SIZE_TIER_META[k].icon,
}));

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

function ownedByCurrentUser(
  deal: Deal,
  memberId: string | null | undefined
): boolean {
  return !!deal.ownerUserId && !!memberId && deal.ownerUserId === memberId;
}

export function PipelineBoard({ deals: initial }: { deals: Deal[] }) {
  const { toast } = useToast();
  const currentUser = useCurrentUser();
  const currentRepName = currentUser.name;
  const wipStorageKey = userScopedStorageKey(WIP_KEY, currentUser.id);
  const viewsStorageKey = userScopedStorageKey(VIEWS_KEY, currentUser.id);
  const [deals, setDeals] = useState<Deal[]>(initial);
  const [q, setQ] = useState("");
  const [size, setSize] = useState<string[]>([]);
  const [mine, setMine] = useState(false); // team vs my-deals (#27)

  // saved views (V2 #4)
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [showSaveView, setShowSaveView] = useState(false);
  const [viewName, setViewName] = useState("");

  // Click-away for the Views menu, done the way ColorSelect does it: a document
  // listener on a ref, not a `fixed inset-0` scrim. The scrim had to go — the
  // toolbar now carries an entrance animation, and `.rise-in`'s residual
  // transform would make the toolbar the containing block for any fixed child,
  // shrinking that full-viewport scrim down to the toolbar's own box. Same
  // behaviour (click outside closes), minus a full-screen invisible overlay
  // that blocked the rest of the page while the menu was open.
  const viewsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!viewsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (viewsRef.current && !viewsRef.current.contains(e.target as Node))
        setViewsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setViewsOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [viewsOpen]);

  // Persist deal limits while keeping the sales stages in their canonical order.
  const [wip, setWip] = useState<Record<string, number>>({});
  useEffect(() => {
    setWip({});
    setSavedViews([]);
    try {
      // Remove the retired custom-column preference so an accidentally moved
      // layout cannot return after a reload or an older tab refreshes.
      localStorage.removeItem("freyr.pipeline.order.v1");
      const w = localStorage.getItem(wipStorageKey);
      if (w) setWip(JSON.parse(w));
      const v = localStorage.getItem(viewsStorageKey);
      if (v) {
        // Views saved before the size filter went multiselect carry a string —
        // fold "all" to the empty pick and any single tier into a one-item list.
        const parsed = (JSON.parse(v) as (Omit<SavedView, "size"> & { size: string | string[] })[]).map(
          (view) => ({
            ...view,
            size: Array.isArray(view.size)
              ? view.size
              : view.size === "all"
                ? []
                : [view.size],
          })
        );
        setSavedViews(parsed);
      }
    } catch {}
  }, [viewsStorageKey, wipStorageKey]);

  // Belt-and-braces on top of BOARD_MIN_H: every control that changes what the
  // board shows records the scroll offset first, and the layout effect below
  // puts it back before the browser paints the new board. Between the two, no
  // filter change can move the page — even a huge height delta.
  // IMPORTANT: the app does NOT scroll the window — AppShell puts the page
  // inside `<main class="flex-1 min-w-0 overflow-y-auto">`, so window.scrollY is
  // permanently 0 and window.scrollTo is a no-op. The offset has to be taken
  // from (and restored to) the nearest scrollable ancestor, or this guard
  // silently does nothing.
  const boardRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<Element | null>(null);
  const keepScrollRef = useRef<number | null>(null);

  const findScroller = useCallback((): Element | null => {
    if (scrollerRef.current?.isConnected) return scrollerRef.current;
    let node: Element | null = boardRef.current;
    while (node) {
      const overflowY = getComputedStyle(node).overflowY;
      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        node.scrollHeight > node.clientHeight
      ) {
        scrollerRef.current = node;
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }, []);

  const keepScroll = useCallback(() => {
    const scroller = findScroller();
    keepScrollRef.current = scroller ? scroller.scrollTop : null;
  }, [findScroller]);

  useLayoutEffect(() => {
    const top = keepScrollRef.current;
    keepScrollRef.current = null;
    // Only ever runs right after a filter change we captured — normal scrolling
    // is untouched.
    if (top == null) return;
    const scroller = findScroller();
    if (!scroller) return;
    // Clamp: a shorter board can't scroll as far, and forcing a bigger offset
    // would itself be a jump.
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const next = Math.min(top, max);
    if (Math.abs(scroller.scrollTop - next) > 1) scroller.scrollTop = next;
  }, [q, size, mine, findScroller]);

  function applyView(v: SavedView) {
    keepScroll();
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
      localStorage.setItem(viewsStorageKey, JSON.stringify(next));
    } catch {}
    setViewName("");
    setShowSaveView(false);
    toast(`Saved view “${name}”`);
  }

  function setWipLimit(stage: Stage, value: string) {
    const n = Math.max(0, Math.round(Number(value.replace(/[^0-9]/g, ""))));
    const next = { ...wip };
    if (!value || !n) delete next[stage];
    else next[stage] = n;
    setWip(next);
    try {
      localStorage.setItem(wipStorageKey, JSON.stringify(next));
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


  useEffect(() => {
    setDeals(initial);
    setQ("");
    setSize([]);
    setMine(false);
    setViewsOpen(false);
    setShowSaveView(false);
    setViewName("");
    setEditingId(null);
    setEditVal("");
    setSelectMode(false);
    setSelected(new Set());
    setBulkStage("Qualified");
    setShowAdd(false);
    setAddForm(EMPTY_ADD);
    setManualSeq(0);
  }, [currentUser.id, initial]);


  const visible = useMemo(
    () =>
      deals.filter(
        (d) =>
          (size.length === 0 || (d.sizeTier != null && size.includes(d.sizeTier))) &&
          (!mine ||
            ownedByCurrentUser(d, currentUser.memberId)) &&
          (!q ||
            d.company.toLowerCase().includes(q.toLowerCase()) ||
            d.contactName.toLowerCase().includes(q.toLowerCase()))
      ),
    [currentUser.memberId, deals, q, size, mine]
  );

  const sizeCounts = useMemo(() => {
    const matching = deals.filter(
      (deal) =>
        (!mine ||
          ownedByCurrentUser(deal, currentUser.memberId)) &&
        (!q ||
          deal.company.toLowerCase().includes(q.toLowerCase()) ||
          deal.contactName.toLowerCase().includes(q.toLowerCase()))
    );
    return matching.reduce<Record<string, number>>(
      (counts, deal) => {
        counts.all += 1;
        if (deal.sizeTier) counts[deal.sizeTier] = (counts[deal.sizeTier] || 0) + 1;
        return counts;
      },
      { all: 0, large: 0, mid: 0, small: 0 }
    );
  }, [currentUser.memberId, deals, mine, q]);

  const byStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const st of STAGES) map[st] = [];
    for (const d of visible) (map[d.stage] || (map[d.stage] = [])).push(d);
    return map;
  }, [visible]);

  /* The board's running total was a weighted figure until Anir, Sep 2: "they
     dont use weighted". It is the plain open value of whatever the filters are
     showing now, on the same not-Closed-Lost basis the page header uses. */
  const openValue = visible.reduce(
    (s, d) => (d.stage === "Closed Lost" ? s : s + d.value),
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
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
      contactName: addForm.contactName.trim() || "-",
      title: "Manually added",
      service: "Untriaged opportunity",
      value,
      stage: addForm.stage,
      lastActivity: new Date().toISOString(),
      staleDays: 0,
      owner: currentRepName,
      ownerUserId: currentUser.memberId || null,
      createdAt: new Date().toISOString(),
    };
    setDeals((ds) => [deal, ...ds]);
    toast(`Added ${deal.company} to ${deal.stage}`);
    setAddForm(EMPTY_ADD);
    setShowAdd(false);
  }

  const inputCls =
    "w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary";

  // One shape for every toolbar control: same height, same radius, same border
  // and hover. The strip used to mix py-2 / py-1.5 / h-10 pills across five
  // different radii, which read as a pile of mismatched widgets instead of a
  // toolbar. Matches the offerings filter bar and the ColorSelect trigger.
  const controlCls =
    "h-10 inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 text-[13px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-text-primary focus-visible:outline-none focus-visible:border-blue-primary";

  return (
    <div data-tour="pipeline-board">
      {/* Controls — one bar, one control shape. Filters group on the left,
          the read-out and actions dock right, and "Add deal" is the only
          filled button on the row.
          `relative z-20`: the entrance animation makes this a stacking context,
          so without an explicit z-index the Views menu and the size dropdown
          would paint BEHIND the (positioned) deal cards further down the DOM,
          the same trap called out on /voice. */}
      {/* Search priority (Suren, Jul 27): pressing the search widens it and
          compresses the controls to its right down to colour + glyph. */}
      <SearchPriority
        query={q}
        className="rise-in relative z-20 rounded-xl border border-border-light bg-surface/50 p-2.5 mb-4 flex flex-wrap items-center gap-2.5"
        style={{ animationDelay: "180ms" }}
      >
        {/* Saved views (#4) */}
        <div ref={viewsRef} className="relative shrink-0">
          <button
            onClick={() => setViewsOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={viewsOpen}
            className={cn(controlCls, viewsOpen && "border-blue-primary text-text-primary")}
          >
            <SlidersHorizontal size={15} strokeWidth={1.8} className="text-blue-primary" />
            Views
            <ChevronDown
              size={14}
              strokeWidth={2}
              className={cn(
                "text-text-tertiary transition-transform duration-150",
                viewsOpen && "rotate-180"
              )}
            />
          </button>
          {viewsOpen && (
              <div
                role="menu"
                aria-label="Saved views"
                className="menu-in absolute left-0 mt-1.5 w-[220px] bg-white border border-border-light rounded-lg shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)] z-50 p-1.5 hovercard-in"
              >
                <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  Built-in
                </p>
                {BUILTIN_VIEWS.map((v) => {
                  const meta = VIEW_META[v.name] ?? { color: "var(--ink-bright-blue)", icon: Layers };
                  const ViewIcon = meta.icon;
                  return (
                    <button
                      key={v.name}
                      role="menuitem"
                      onClick={() => applyView(v)}
                      className="w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg text-[13px] font-medium text-text-primary hover:bg-surface transition-colors"
                    >
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                        style={{ color: meta.color, background: tint(meta.color, 8) }}
                      >
                        <ViewIcon size={13} strokeWidth={2} />
                      </span>
                      {v.name}
                    </button>
                  );
                })}
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
                        className="w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg text-[13px] font-medium text-text-primary hover:bg-surface transition-colors"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
                          <Bookmark size={13} strokeWidth={2} />
                        </span>
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
          )}
        </div>
        <PrioritySearchInput
          grow
          // The cap itself lifts while the search has priority — that is the
          // room the compressed controls just handed back.
          growMaxWidth={260}
          growExpandedMaxWidth={460}
          value={q}
          onChange={(next) => {
            keepScroll();
            setQ(next);
          }}
          placeholder="Search deals…"
          ariaLabel="Search deals"
          iconSize={16}
          className="flex-1 min-w-[180px]"
          iconClassName="left-3"
          // `shadow-input-focus` is only a CSS variable, not a generated
          // utility — the focus ring it promises never rendered. `shadow-focus`
          // is the real token in tailwind.config.
          inputClassName="h-10 w-full rounded-lg border border-border-light bg-white pl-9 pr-3 text-[13px] text-text-primary outline-none transition-[border-color,box-shadow] hover:border-blue-subtle focus:border-blue-primary focus:shadow-focus"
        />
        {/* Company size is one dropdown, not four chips. Four always-on buttons
            ate most of the toolbar, squeezed the search box and pushed the
            Team/My-deals control into wrapping onto two lines (Anir, Jul 26:
            "choosing by company size should be in a dropdown, just like for
            views, because it's just taking up a lot of space"). Each option
            keeps its size colour + glyph and its live count. */}
        <MultiColorSelect
          values={size}
          ariaLabel="Filter deals by company size"
          minWidth={168}
          allLabel="All sizes"
          allIcon={Layers}
          onChange={(next) => {
            keepScroll();
            setSize(next);
          }}
          options={SIZE_FILTERS.filter((f) => f.key !== "all").map<ColorOption>(
            (f) => {
              const meta = SIZE_TIER_META[f.key];
              return {
                value: f.key,
                label: `${f.label} deals`,
                color: meta.color,
                icon: meta.icon,
                badge: String(sizeCounts[f.key] || 0),
                badgeColor: meta.color,
              };
            }
          )}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          {/* The board's running total, built as a control-height read-out so it
              sits on the same baseline as everything else instead of floating
              as loose body text. */}
          <span className="hidden h-10 items-center gap-2 rounded-lg border border-border-light bg-white px-3 lg:inline-flex">
            <Term
              k="open_pipeline"
              side="bottom"
              underline={false}
              className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary"
            >
              Open
            </Term>
            <span className="text-[13px] font-bold text-text-primary tnum">
              {formatMoney(openValue)}
            </span>
          </span>
          <div
            role="group"
            aria-label="Deal ownership"
            className="h-10 inline-flex items-center gap-1 rounded-lg border border-border-light bg-white p-1"
          >
            {[
              { k: false, l: "Team" },
              { k: true, l: "My deals" },
            ].map((o) => (
              <button
                key={o.l}
                onClick={() => {
                  keepScroll();
                  setMine(o.k);
                }}
                aria-pressed={mine === o.k}
                className={cn(
                  "h-8 px-3 rounded-md text-[12.5px] font-semibold transition-colors",
                  mine === o.k
                    ? "bg-blue-light text-blue-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface"
                )}
              >
                {o.l}
              </button>
            ))}
          </div>
          <PriorityTooltip label={selectMode ? "Done selecting" : "Select deals"}>
            <button
              onClick={() => {
                setSelectMode((m) => !m);
                setSelected(new Set());
              }}
              aria-label={selectMode ? "Done" : "Select"}
              className={cn(
                // The row gap becomes a collapsing margin on the label, so the
                // glyph centres when the words go. (`cn` only joins — leaving
                // `gap-1.5` in place would keep winning over a `gap-0`.)
                controlCls.replace("gap-1.5", "gap-0"),
                selectMode && "border-blue-primary bg-blue-light text-blue-primary hover:text-blue-primary"
              )}
            >
              <CheckSquare
                size={15}
                strokeWidth={1.8}
                className={selectMode ? undefined : "text-text-tertiary"}
              />
              <PriorityLabel gap="ml-1.5">{selectMode ? "Done" : "Select"}</PriorityLabel>
            </button>
          </PriorityTooltip>
          {/* The one filled control on the row — everything else is bordered,
              so the primary action is unmistakable. */}
          <button
            onClick={() => setShowAdd(true)}
            className="h-10 inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-3.5 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(0,113,227,0.20)] transition-all hover:bg-blue-hover hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)] active:scale-[0.98]"
          >
            <Plus size={15} strokeWidth={2.2} />
            Add deal
          </button>
        </div>
      </SearchPriority>

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 px-3 py-2.5 rounded-xl border border-blue-subtle bg-blue-light/60">
          <span className="text-[13px] font-semibold text-blue-primary tnum">
            {selected.size} deal{selected.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[12px] font-medium text-text-secondary">Move to</span>
            {/* Stages are colour + glyph here too — a plain <option> list can
                carry neither, so it uses the same dropdown as the size filter. */}
            <ColorSelect
              value={bulkStage}
              ariaLabel="Bulk move stage"
              minWidth={172}
              onChange={(v) => setBulkStage(v as Stage)}
              options={STAGE_OPTIONS}
            />
            <Button onClick={applyBulkMove} className="h-10 rounded-lg px-4 text-[13px]">
              Move
            </Button>
            <button
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-white hover:text-text-primary"
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      )}

      <div
        ref={boardRef}
        className="flex gap-4 overflow-x-auto pb-4 stagger"
        style={{ minHeight: BOARD_MIN_H }}
      >
      {STAGES.map((stage, ci) => {
        const items = byStage[stage] || [];
        const total = items.reduce((sum, d) => sum + d.value, 0);
        const limit = wip[stage];
        const overLimit = limit != null && items.length > limit;
        // A stage is never plain type: its canonical colour + glyph, the same
        // pair the forecast donuts and the deal timeline use.
        const stageColor = STAGE_COLOR[stage];
        const StageIcon = STAGE_ICON[stage];
        return (
          <div
            key={stage}
            // The container's `stagger` supplies the rise-in; this delay just
            // shifts the cascade to land after the toolbar, so the page reads
            // as one top-to-bottom assemble instead of two things racing. The
            // reduced-motion guard kills the animation outright, which makes
            // the delay moot — no extra guard needed here.
            style={{ animationDelay: `${220 + ci * 45}ms` }}
            className={cn(
              "w-[280px] shrink-0 flex flex-col rounded-xl border transition-colors",
              overLimit
                ? "border-error bg-error/5"
                : "border-border-light bg-surface"
            )}
          >
            {/* Colour rail across the top so columns are tellable apart at a
                glance, without touching the deal cards. */}
            <span
              aria-hidden
              className="block h-1 shrink-0 rounded-t-[11px]"
              style={{ background: stageColor }}
            />
            {/* One header block, not two stacked bands. Identity row on top
                (icon + stage + count · money), the deal limit tucked under it
                as a quiet aside. Fixed structure + nowrap names means every
                column's money lands on exactly the same line. */}
            <div className="px-3 pt-2.5 pb-2 border-b border-border-light">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0" style={{ color: stageColor }}>
                  <span
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md"
                    style={{ background: tint(stageColor, 8) }}
                  >
                    <StageIcon size={13} strokeWidth={2.2} />
                  </span>
                  <Term
                    k={stageKey(stage)}
                    side="bottom"
                    align="left"
                    underline={false}
                    className="text-[13px] font-semibold whitespace-nowrap"
                  >
                    {stage}
                  </Term>
                  <span
                    className={cn(
                      "text-[11px] font-semibold rounded-full px-1.5 py-0.5 tnum border shrink-0",
                      overLimit && "bg-error text-white border-error"
                    )}
                    // The count belongs to the stage, so it wears the stage
                    // colour too — a gray pill beside a coloured name was exactly
                    // the "no gray" complaint. Over-limit keeps its red alarm.
                    style={
                      overLimit
                        ? undefined
                        : {
                            color: stageColor,
                            background: tint(stageColor, 8),
                            borderColor: tint(stageColor, 18),
                          }
                    }
                    title={limit != null ? `${items.length} of a ${limit}-deal limit` : undefined}
                  >
                    {items.length}
                    {limit != null ? `/${limit}` : ""}
                  </span>
                </div>
                {/* The column total, and nothing under it: a second line read
                    "$X wtd" until Anir, Sep 2: "they dont use weighted". */}
                <span className="shrink-0 text-right leading-tight">
                  <span className="block text-[12.5px] font-semibold text-text-primary tnum">
                    {formatMoney(total)}
                  </span>
                </span>
              </div>
              {/* Was a full bordered band shouting "DEAL LIMIT ∞" — a developer's
                  setting given more weight than the deals. Now it's a small
                  tertiary aside with a ghost field that only grows a border once
                  a limit is actually set, and only turns loud when it's blown. */}
              <div className="mt-1.5 flex items-center gap-1.5">
                <Term
                  k="wip_limit"
                  side="bottom"
                  align="left"
                  underline={false}
                  className="text-[10px] text-text-tertiary"
                >
                  Deal limit
                </Term>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label={`Deal limit for ${stage}`}
                  value={limit ?? ""}
                  onChange={(e) => setWipLimit(stage, e.target.value)}
                  placeholder="Any"
                  className={cn(
                    "w-11 rounded border px-1 py-0.5 text-[10px] text-center tnum outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary focus:bg-white",
                    limit == null
                      ? "border-transparent bg-transparent text-text-tertiary hover:border-border-light hover:bg-white"
                      : overLimit
                        ? "border-error bg-white font-semibold text-error"
                        : "border-border-light bg-white font-semibold text-text-primary"
                  )}
                />
                {overLimit && (
                  <span className="ml-auto rounded-full bg-error/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-error">
                    Over limit
                  </span>
                )}
              </div>
            </div>
            {/* flex-1 + a body floor: a column that filters down to nothing
                still holds its shape, so the board keeps its height and the
                page never jumps. The empty note sits at the TOP of the column,
                level with the first card in the columns beside it, not centred
                in the column's full height, which floated it halfway down a
                tall board and read as a stray label (Anir, Jul 28: "why is it
                saying this at the bottom? It should say this at the top"). */}
            <div
              className={cn(
                "flex-1 p-2.5",
                items.length === 0 ? "flex items-start justify-center" : "space-y-2.5"
              )}
              style={{ minHeight: COLUMN_BODY_MIN_H }}
            >
              {items.map((d) => {
                const isManual = d.sessionId.startsWith("manual-");
                const isSel = selected.has(d.sessionId);
                // A card opens its deal. Manual board-local cards have no
                // session behind them, and in select mode a click picks the
                // card instead — both skip the overlay link.
                const opensDeal = !isManual && !selectMode;
                const openLabel = `Open the ${d.service} deal. ${d.company}`;
                return (
                <div
                  key={d.sessionId}
                  className={cn(
                    // Stronger shadow + crisper border so each white card clearly
                    // lifts off the column and stacked cards are easy to tell apart
                    // (Suren). Hover lifts it further.
                    "group relative bg-white border rounded-lg p-3 transition-all shadow-[0_1px_2px_rgba(16,24,40,0.05),0_4px_10px_rgba(16,24,40,0.07)] hover:shadow-[0_10px_24px_rgba(16,24,40,0.13)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[0_2px_6px_rgba(16,24,40,0.10)]",
                    (selectMode || opensDeal) && "cursor-pointer",
                    isSel
                      ? "border-blue-primary ring-1 ring-blue-primary"
                      : "border-border hover:border-blue-subtle"
                  )}
                  onClick={() => selectMode && toggleSelect(d.sessionId)}
                >
                  {/* Three targets, exactly as Anir specified: the company
                      name opens the ACCOUNT, the contact name opens the
                      CONTACT, and anywhere else on the card opens the DEAL
                      ("if my cursor's just on the card, I should just be able
                      to go to that pipeline thing"). The two names sit at
                      z-10 above this stretched link, a real nested <a> is
                      invalid HTML, which is why the overlay exists. */}
                  {opensDeal && (
                    <Link
                      href={`/deals/${d.sessionId}`}
                      aria-label={openLabel}
                      title={openLabel}
                      className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary focus-visible:ring-offset-1"
                    />
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {selectMode && (
                        <button
                          aria-label="Select deal"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(d.sessionId);
                          }}
                          className="relative z-10 shrink-0 text-blue-primary"
                        >
                          {isSel ? (
                            <CheckSquare size={16} strokeWidth={1.8} />
                          ) : (
                            <Square size={16} strokeWidth={1.8} className="text-text-tertiary" />
                          )}
                        </button>
                      )}
                      <CompanyLogo
                        name={d.company}
                        className="w-7 h-7 text-[10px] shrink-0"
                      />
                      {/* Names wrap rather than truncate — "Cortexa Biophar…"
                          tells a rep nothing, and a board of ellipses is the
                          fastest way to look unfinished. */}
                      {isManual ? (
                        <span className="text-[13.5px] font-semibold text-text-primary leading-snug">
                          {d.company}
                        </span>
                      ) : (
                        <Link
                          href={`/customers/${d.customerId}`}
                          aria-label={`Open ${d.company}`}
                          title={`Open ${d.company}`}
                          className="relative z-10 text-[13.5px] font-semibold text-text-primary hover:text-blue-primary hover:underline leading-snug"
                        >
                          {d.company}
                        </Link>
                      )}
                    </div>
                    {/* The "this opens" cue: slides in on hover, the same arrow
                        idiom the customer cards use. */}
                    {/* No card-wide arrow: it advertised a whole-card click
                        that no longer exists. The name underlines on hover,
                        that IS the affordance. */}
                  </div>
                  {/* One rhythm down the card: 10px between every block, so the
                      company → person → offering → numbers stack reads as four
                      even beats instead of drifting 8/10/12px gaps. */}
                  {d.contactName && d.contactName !== "-" ? (
                    isManual ? (
                      <div className="flex items-center gap-2 mt-2.5 min-w-0">
                        <Avatar name={d.contactName} className="w-7 h-7 text-[10px] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-text-primary leading-snug">
                            {d.contactName}
                          </p>
                          {d.title && (
                            <p className="text-[11px] text-text-secondary leading-snug mt-0.5">
                              {d.title}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      // Only the NAME'S OWN CHARACTERS open the contact. This
                      // row used to BE the link — a flex block stretched to the
                      // full card width and wrapping the job title too — so a
                      // cursor sitting 50px to the right of "Megan Ruiz", or
                      // anywhere on "Compliance Manager", was still inside the
                      // contact link (Anir, Jul 27: "my cursor is at least 50
                      // pixels away on the right… it's still thinking I'm
                      // trying to click on Megan, and I can't click the actual
                      // pipeline thing"). The link is now `w-fit` around the
                      // text alone; every other pixel of the card belongs to
                      // the stretched deal link underneath.
                      <div className="flex items-center gap-2 mt-2.5 min-w-0">
                        <Avatar name={d.contactName} className="w-7 h-7 text-[10px] shrink-0" />
                        <div className="min-w-0">
                          <Link
                            href={`/contacts/${d.contactId}`}
                            aria-label={`Open ${d.contactName}`}
                            title={`Open ${d.contactName}`}
                            className="relative z-10 block w-fit max-w-full text-[12px] font-semibold text-text-primary hover:text-blue-primary hover:underline leading-snug"
                          >
                            {d.contactName}
                          </Link>
                          {d.title && (
                            <p className="text-[11px] text-text-secondary leading-snug mt-0.5">
                              {d.title}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  ) : (
                    d.title && (
                      <p className="text-[12px] text-text-secondary mt-2.5 leading-snug">
                        {d.title}
                      </p>
                    )
                  )}
                  {/* The offering wears its own colour + icon here, the same mark
                      it carries on /forecast and everywhere else, it was flat
                      tertiary gray on a gray column, the definition of a category
                      shown as plain text. Idle days sit beside it as a caution
                      chip (#C2410C), not raw alarm red. */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    {/* One line, always. The longest real offering names
                        ("Labeling and Artwork Management", "Clinical Trial
                        Regulatory Support") wrapped to two lines inside a
                        column and made every card a different height (Anir:
                        "you could size it down by a couple pixels… so it's on
                        one line"). Every card takes the same step down, so the
                        chips stay a matched set. */}
                    <ServiceTag
                      name={d.service}
                      className="max-w-full whitespace-nowrap !text-[11px] !py-0.5 !pl-1 !pr-2"
                    />
                    {d.staleDays > ROTTING_DAYS && d.stage !== "Closed Lost" && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-bold text-warning tnum"
                        title={`No activity in ${d.staleDays} days`}
                      >
                        <Flame size={11} strokeWidth={2} />
                        {d.staleDays}d idle
                      </span>
                    )}
                  </div>
                  {/* Size chip and money share one baseline — they were centred
                      against each other, so the money floated a hair high. */}
                  <div className="flex items-baseline justify-between gap-2 mt-2.5">
                    <SizeBadge tier={d.sizeTier} />
                    {editingId === d.sessionId ? (
                      <span className="relative z-10 flex items-center gap-1">
                        <input
                          aria-label="Deal value"
                          placeholder="0"
                          autoFocus
                          value={editVal}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setEditVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitValue(d.sessionId);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onBlur={() => commitValue(d.sessionId)}
                          className="w-[88px] bg-white border border-blue-primary rounded-md px-2 py-0.5 text-[13px] font-semibold text-right outline-none tnum shadow-focus"
                        />
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
                        className="relative z-10 text-[14px] font-bold text-text-primary tnum hover:text-blue-primary"
                      >
                        {formatMoney(d.value)}
                      </button>
                    )}
                  </div>

                  {/* No per-card agent footer any more. The "Agent: re-engage
                      this deal" row is gone at Anir's instruction (Jul 27:
                      "no one's gonna click these buttons… it's so obscure.
                      We're not there yet"), the idle chip above still tells
                      the truth about staleness; the agent lives on its own
                      page and in the dock only. */}
                </div>
                );
              })}
              {/* An empty column is a fact, not a fault — the stage's own mark,
                  a calm line and room to breathe, instead of one small gray
                  sentence stranded in a blank box. */}
              {items.length === 0 && (
                <div className="flex flex-col items-center gap-2 px-4 pb-8 pt-4 text-center">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full"
                    style={{ background: tint(stageColor, 8), color: stageColor }}
                  >
                    <StageIcon size={16} strokeWidth={1.9} />
                  </span>
                  <p className="text-[11.5px] font-semibold text-text-secondary">
                    No deals in this stage
                  </p>
                  <p className="text-[10.5px] text-text-tertiary leading-snug">
                    Add a deal, or move one here from another stage.
                  </p>
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
              {/* Matches the Stage picker below it and the size filter in the
                  toolbar, same colour + glyph as the badge it sets. */}
              <ColorSelect
                value={addForm.sizeTier}
                ariaLabel="Size"
                minWidth={0}
                onChange={(v) => setAddForm({ ...addForm, sizeTier: v })}
                options={SIZE_OPTIONS}
              />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">
              Stage
            </label>
            <ColorSelect
              value={addForm.stage}
              ariaLabel="Stage"
              onChange={(v) => setAddForm({ ...addForm, stage: v as Stage })}
              options={STAGE_OPTIONS}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
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
          <Button onClick={saveView} disabled={!viewName.trim()}>
            Save view
          </Button>
        </div>
      </Modal>
    </div>
  );
}
