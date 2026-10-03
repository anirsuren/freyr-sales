"use client";
import { useEffect, useMemo, useRef, useState, useId, type RefObject, type CSSProperties } from "react";
import { Check, Search, X, Plus, Library, Package, FileText, Users, UserRound, Building2, Newspaper, Briefcase, Layers, Presentation, UserPlus, FileSignature, Target, BarChart3, ChevronDown } from "lucide-react";
import { pickerPreviewFacts } from "@/lib/agentPickerPresentation";
import { createPortal } from "react-dom";
import { EntityMark, entityDestination, type Entity } from "./EntityPills";
import { EntityFactView } from "./EntityFacts";
import { OpenInNewTab } from "@/components/ui/ColorSelect";

// The converse endpoint accepts at most 12 exact records per message.
const MAX_CONTEXT_RECORDS = 12;
const labels: Record<string, string> = {
  offering: "Offerings",
  material: "Sales materials",
  contact: "Contacts",
  person: "Team",
  company: "Customers",
  marketCompany: "Market Intel companies",
  marketItem: "Market Intel articles",
  trackedPerson: "Tracked people",
  deal: "Opportunities",
  component: "FDL components",
  solution: "Solutioning",
  lead: "Leads",
  contract: "Contracts",
  goal: "Goals",
  report: "Reports",
};
const categories = [
  { heading: "Knowledge", items: ["material", "offering", "component"] },
  { heading: "Relationships", items: ["company", "contact", "person", "lead"] },
  { heading: "Sales", items: ["deal", "solution", "contract", "goal", "report"] },
  { heading: "Market Intel", items: ["marketCompany", "marketItem", "trackedPerson"] },
];
const categoryIcons = { material: FileText, offering: Package, component: Layers, company: Building2, contact: UserRound, person: Users, lead: UserPlus, deal: Briefcase, solution: Presentation, contract: FileSignature, goal: Target, report: BarChart3, marketCompany: Building2, marketItem: Newspaper, trackedPerson: UserRound };
const shortLabels: Record<string, string> = { marketCompany: "Companies", marketItem: "Articles", trackedPerson: "Tracked people" };
// Avatar initials are decoration, not part of the message or model prompt.
function composerText(root: HTMLElement): string {
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (!(node instanceof HTMLElement)) return "";
    if (node.dataset.entity) return node.dataset.entityName || "";
    if (node.tagName === "BR") return "\n";
    const text = Array.from(node.childNodes, read).join("");
    return ["DIV", "P"].includes(node.tagName) && node !== root ? `${text}\n` : text;
  };
  return read(root).replace(/\u00a0/g, " ").replace(/\n$/, "");
}
/** Atomic inline mentions; only IDs leave the browser as selected context. */
export function EntityComposer({
  value,
  onChange,
  entities,
  selected,
  onSelected,
  onSend,
  onFiles,
  placeholder,
  editorRef,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  entities: Entity[];
  selected: Entity[];
  onSelected: (value: Entity[]) => void;
  onSend: () => void;
  onFiles: (files: FileList) => void;
  placeholder: string;
  editorRef?: RefObject<HTMLDivElement | null>;
  autoFocus?: boolean;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => { if (ready && autoFocus) editor.current?.focus({ preventScroll: true }); }, [ready, autoFocus]);
  const container = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [browseCategories, setBrowseCategories] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<CSSProperties | null>(null);
  const mentionRange = useRef<Range | null>(null);
  const slashTrigger = useRef<Range | null>(null);
  const [marks, setMarks] = useState<{ entity: Entity; host: HTMLSpanElement }[]>([]);
  const pickerId = useId();
  const [query, setQuery] = useState<string | null>(null),
    [category, setCategory] = useState<string | null>(null),
    [active, setActive] = useState(0);
  const [multiSelect, setMultiSelect] = useState(false);
  const [pending, setPending] = useState<Entity[]>([]);
  const pendingKeys = useMemo(() => new Set(pending.map((entity) => `${entity.kind}:${entity.id}`)), [pending]);
  useEffect(() => {
    if (query === null) { setPending([]); setMultiSelect(false); }
  }, [query]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node) && !picker.current?.contains(event.target as Node)) setQuery(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  useEffect(() => {
    picker.current
      ?.querySelector("[data-active=true]")
      ?.scrollIntoView({ block: "nearest" });
  }, [active, pickerPosition]);
  const pickerOpen = query !== null;
  useEffect(() => {
    if (!pickerOpen) { setPickerPosition(null); return; }
    const position = () => {
      if (!container.current) return;
      const rect = container.current.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 640), 960, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
      const above = rect.top - 24, below = window.innerHeight - rect.bottom - 24;
      const next: CSSProperties = { left, width, height: Math.min(560, Math.max(160, Math.max(above, below))), maxHeight: window.innerHeight - 24 };
      if (above >= below) next.bottom = window.innerHeight - rect.top + 12;
      else next.top = rect.bottom + 12;
      setPickerPosition((previous) => previous && Object.keys(next).every((key) => previous[key as keyof CSSProperties] === next[key as keyof CSSProperties]) ? previous : next);
    };
    position();
    // Portal escapes the dock's clipping/animation; keep it attached as the
    // editor grows, the page scrolls or the viewport changes.
    const observer = new ResizeObserver(position);
    if (container.current) observer.observe(container.current);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [pickerOpen]);
  const positioned = pickerPosition !== null;
  useEffect(() => {
    if (pickerOpen && positioned) searchInput.current?.focus();
  }, [pickerOpen, positioned]);
  useEffect(() => {
    if (!value && editor.current) {
      editor.current.replaceChildren();
      setMarks([]);
      mentionRange.current = null;
      slashTrigger.current = null;
      onSelected([]);
      setQuery(null);
    }
  }, [value, onSelected]); // Clearing after send or switching chats.
  const read = () => {
    const root = editor.current;
    if (!root) return;
    onChange(composerText(root));
    if (selected.length) {
      const remaining = new Set(Array.from(root.querySelectorAll("[data-entity]"),
        (node) => node.getAttribute("data-entity")));
      const next = selected.filter((e) => remaining.has(`${e.kind}:${e.id}`));
      if (next.length !== selected.length) onSelected(next);
      setMarks((current) => {
        const attached = current.filter(({ host }) => root.contains(host));
        return attached.length === current.length ? current : attached;
      });
    }
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const before = node?.nodeType === Node.TEXT_NODE
      ? node.textContent?.slice(0, selection!.anchorOffset) || ""
      : "";
    // A slash after whitespace opens context; URL/path slashes stay literal.
    const match = before.match(/(?:^|\s)\/([^/\n]*)$/);
    if (match && node && selection?.rangeCount && root.contains(node)) {
      const range = selection.getRangeAt(0).cloneRange();
      range.setStart(node, selection.anchorOffset - match[1].length - 1);
      mentionRange.current = range;
      const trigger = range.cloneRange();
      trigger.setEnd(node, range.startOffset + 1);
      slashTrigger.current = trigger;
      setCategory(null);
      setActive(0);
      setBrowseCategories(false);
      setQuery(match[1]);
    } else {
      slashTrigger.current = null;
      setQuery(null);
    }
  };
  const openPicker = () => {
    const root = editor.current;
    if (!root) return;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : document.createRange();
    if (!root.contains(range.commonAncestorContainer)) {
      range.selectNodeContents(root);
      range.collapse(false);
    }
    mentionRange.current = range;
    slashTrigger.current = null;
    setCategory(null);
    setActive(0);
    setBrowseCategories(false);
    setQuery("");
  };
  const selectCategory = (kind: string | null) => {
    setCategory(kind);
    setActive(0);
    setBrowseCategories(false);
    searchInput.current?.focus({ preventScroll: true });
  };
  const sortedEntities = useMemo(() => [...entities].sort((a, b) => a.name.localeCompare(b.name)), [entities]);
  const options = useMemo(() => query === null ? [] : sortedEntities
    .filter(
      (e) =>
        (!category || e.kind === category) &&
        `${e.name} ${e.subtitle || ""} ${(e.details || []).join(" ")} ${e.description || ""} ${[...(e.subtitleFacts || []), ...(e.facts || [])].map((fact) => fact.text).join(" ")} ${labels[e.kind]}`
          .toLowerCase()
          .includes((query || "").toLowerCase()),
    )
    .slice(0, 40), [sortedEntities, query, category]);
  const insert = (items: Entity[]) => {
    const selection = window.getSelection();
    const range = mentionRange.current?.cloneRange();
    if (!items.length || !selection || !range || !editor.current?.contains(range.commonAncestorContainer)) return;
    const unique = [...new Map(items.map((entity) => [`${entity.kind}:${entity.id}`, entity])).values()];
    const fragment = document.createDocumentFragment();
    const addedMarks: { entity: Entity; host: HTMLSpanElement }[] = [];
    let lastSpace: Text | null = null;
    for (const entity of unique) {
      const pill = document.createElement("span");
      pill.contentEditable = "false";
      pill.dataset.entity = `${entity.kind}:${entity.id}`;
      pill.dataset.entityName = entity.name;
      pill.className =
        "inline-flex max-w-full whitespace-normal break-words items-center gap-1 align-middle rounded-full bg-blue-light text-blue-primary border border-blue-primary/20 px-2 py-0.5 mx-0.5 text-[13px] font-medium";
      const mark = document.createElement("span");
      mark.className = "inline-flex items-center shrink-0";
      mark.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = entity.name;
      pill.append(mark, label);
      pill.title = [entity.name, labels[entity.kind], entity.subtitle, ...(entity.details || []), entity.description].filter(Boolean).join(" · ");
      lastSpace = document.createTextNode("\u00a0");
      fragment.append(pill, lastSpace);
      addedMarks.push({ entity, host: mark });
    }
    range.deleteContents();
    range.insertNode(fragment);
    range.setStartAfter(lastSpace!);
    range.collapse(true);
    editor.current.focus();
    selection.removeAllRanges();
    selection.addRange(range);
    mentionRange.current = null;
    slashTrigger.current = null;
    setMarks((current) => [...current, ...addedMarks]);
    onSelected([...new Map([...selected, ...unique].map((entity) => [`${entity.kind}:${entity.id}`, entity])).values()]);
    onChange(composerText(editor.current));
    setQuery(null);
    setCategory(null);
  };
  const contextKeys = new Set([...selected, ...pending].map((entity) => `${entity.kind}:${entity.id}`));
  const selectionFull = contextKeys.size >= MAX_CONTEXT_RECORDS;
  const choose = (entity: Entity) => {
    if (selectionFull && !contextKeys.has(`${entity.kind}:${entity.id}`)) return;
    if (!multiSelect) { insert([entity]); return; }
    setPending((current) => current.some((item) => item.kind === entity.kind && item.id === entity.id)
      ? current.filter((item) => !(item.kind === entity.kind && item.id === entity.id))
      : [...current, entity]);
  };
  const closePicker = () => {
    setQuery(null);
    editor.current?.focus();
    const range = mentionRange.current?.cloneRange();
    if (range && editor.current?.contains(range.commonAncestorContainer)) {
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };
  const pickerKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || query === null) return false;
    if (e.key === "Backspace" && query === "" && e.currentTarget === searchInput.current) {
      const root = editor.current;
      const trigger = slashTrigger.current?.cloneRange();
      if (root && trigger && root.contains(trigger.commonAncestorContainer) && trigger.toString() === "/") {
        e.preventDefault();
        e.stopPropagation();
        trigger.deleteContents();
        trigger.collapse(true);
        mentionRange.current = null;
        slashTrigger.current = null;
        setQuery(null);
        onChange(composerText(root));
        root.focus();
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(trigger);
        return true;
      }
    }
    if (!["Escape", "ArrowDown", "ArrowUp", "Enter"].includes(e.key) || (e.key === "Enter" && e.shiftKey)) return false;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      closePicker();
    } else if (e.key === "Enter") {
      if (options[active]) choose(options[active]);
    } else setActive((i) => Math.max(0, Math.min(options.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
    return true;
  };
  return (
    <div ref={container} className="relative flex flex-1 min-w-0 items-center gap-2">
      {marks.map(({ entity, host }, i) => createPortal(<EntityMark entity={entity} />, host, `${entity.kind}:${entity.id}:${i}`))}
      <div
        ref={(node) => {
          editor.current = node;
          if (editorRef) editorRef.current = node;
        }}
        role="combobox"
        aria-label="Message the agent"
        aria-autocomplete="list"
        aria-expanded={query !== null}
        aria-activedescendant={
          query !== null && options[active]
            ? `${pickerId}-${active}`
            : undefined
        }
        aria-controls={query !== null ? pickerId : undefined}
        contentEditable={ready}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className="min-w-0 flex-1 min-h-9 max-h-40 overflow-y-auto outline-none text-[14px] py-1.5 whitespace-pre-wrap empty:before:content-[attr(data-placeholder)] empty:before:text-text-tertiary"
        onInput={read}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (pickerKeyDown(e)) return;
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSend();
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          if (e.clipboardData.files.length) {
            onFiles(e.clipboardData.files);
            return;
          }
          const selection = window.getSelection();
          if (selection?.rangeCount) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            const node = document.createTextNode(
              e.clipboardData.getData("text/plain"),
            );
            range.insertNode(node);
            range.setStartAfter(node);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            read();
          }
        }}
      />
      <button type="button" aria-label="Add context" title="Add context (/)" aria-haspopup="dialog" aria-expanded={pickerOpen} onMouseDown={(event) => event.preventDefault()} onClick={openPicker} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary hover:text-blue-primary hover:bg-blue-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary">
        <Plus size={18} />
      </button>
      {pickerOpen && pickerPosition && createPortal(
        <div ref={picker} role="dialog" aria-label="Add context" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closePicker(); } }} style={pickerPosition} className="agent-context-picker font-preset-scope fixed flex flex-col min-w-0 z-[47] rounded-2xl border border-border bg-white shadow-xl overflow-hidden">
          <div className="flex shrink-0 items-center gap-3 px-4 py-4 border-b border-border text-sm">
            <Search size={15} />
            <input
              ref={searchInput}
              type="search"
              aria-label="Search records and sales assets"
              placeholder="Search records and sales assets…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={pickerKeyDown}
              aria-controls={pickerId}
              className="min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-tertiary"
            />
            <button
              type="button"
              aria-pressed={multiSelect}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setMultiSelect((current) => !current); setPending([]); }}
              className={`shrink-0 flex items-center gap-1 rounded-full px-2 py-1 text-xs ${multiSelect ? "bg-blue-light text-blue-primary" : "text-text-secondary hover:bg-blue-light/50"}`}
            >
              {multiSelect && <Check size={12} />} Multi-select
            </button>
            <button
              aria-label="Close record picker"
              className="ml-auto"
              onMouseDown={(e) => e.preventDefault()}
              onClick={closePicker}
            >
              <X size={15} />
            </button>
          </div>
          <div className="agent-context-body flex min-h-0 flex-1">
            <nav aria-label="Context categories" className={`agent-context-nav shrink-0 overflow-y-auto border-r border-border p-2 ${browseCategories ? "is-browsing" : ""}`}>
              <button type="button" aria-pressed={!category} onMouseDown={(event) => event.preventDefault()} onClick={() => selectCategory(null)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium ${!category ? "bg-blue-light text-blue-primary" : "text-text-secondary hover:bg-blue-light/50"}`}><Library size={15} className="text-blue-primary" /> All records</button>
              {categories.map((group) => <div key={group.heading} className="mt-3">
                <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{group.heading}</div>
                {group.items.map((kind) => {
                  const Icon = categoryIcons[kind as keyof typeof categoryIcons];
                  return <button type="button" key={kind} aria-label={labels[kind]} aria-pressed={category === kind} onMouseDown={(event) => event.preventDefault()} onClick={() => selectCategory(kind)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs ${category === kind ? "bg-blue-light text-blue-primary font-semibold" : "text-text-secondary hover:bg-blue-light/50"}`}><Icon size={15} className="shrink-0 text-blue-primary" />{shortLabels[kind] || labels[kind]}</button>;
                })}
              </div>)}
            </nav>
            <div className="flex min-w-0 min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center justify-between px-4 py-2.5 border-b border-border/50">
                <span className="text-xs font-semibold text-text-primary">{category ? labels[category] : "All records"}</span>
                <button type="button" aria-expanded={browseCategories} onClick={() => setBrowseCategories((open) => !open)} className="agent-context-browse items-center gap-1 text-xs text-blue-primary">Browse <ChevronDown size={13} /></button>
                <span className="text-[11px] text-text-tertiary">{options.length === 40 ? "First 40 results" : `${options.length} ${options.length === 1 ? "result" : "results"}`}</span>
              </div>
          {!multiSelect && selectionFull && <p role="status" className="shrink-0 px-3 py-2 text-xs text-text-secondary">Up to {MAX_CONTEXT_RECORDS} records per message. Remove a tag to add another.</p>}
          <div
            id={pickerId}
            role="listbox"
            aria-label="Records and sales assets"
            aria-multiselectable={multiSelect}
            className="min-h-0 flex-1 overflow-y-auto p-2"
          >
            {options.map((entity, i) => {
              const destination = entityDestination(entity);
              const unavailable = selectionFull && !contextKeys.has(`${entity.kind}:${entity.id}`);
              return (
                <div
                  role="option"
                  id={`${pickerId}-${i}`}
                  aria-selected={multiSelect ? pendingKeys.has(`${entity.kind}:${entity.id}`) : active === i}
                  data-active={active === i}
                  key={`${entity.kind}:${entity.id}`}
                  className={`goal-linked-row group/opt flex w-full items-center rounded-xl mb-1 pr-2 transition-colors duration-150 motion-reduce:transition-none ${active === i ? "bg-blue-light" : "hover:bg-blue-light/50"}`}
                >
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(entity)}
                    disabled={unavailable}
                    className="flex flex-1 min-w-0 items-center gap-3 text-left px-3 py-3 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                  {multiSelect && <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${pendingKeys.has(`${entity.kind}:${entity.id}`) ? "bg-blue-primary border-blue-primary text-white" : "border-border bg-white"}`}>{pendingKeys.has(`${entity.kind}:${entity.id}`) && <Check size={12} />}</span>}
                  <EntityMark entity={entity} large />
                  <span className="min-w-0 flex-1" title={[entity.subtitle, ...(entity.details || []), entity.description].filter(Boolean).join(" · ")}>
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-[14px] font-medium leading-snug text-text-primary line-clamp-2">{entity.name}</span>
                      {!category && <span className="shrink-0 text-[10px] text-text-tertiary">{labels[entity.kind]}</span>}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
                      {entity.subtitleFacts?.length ? entity.subtitleFacts.slice(0, 2).map((fact, index) => <EntityFactView key={`${index}:${fact.text}`} fact={fact} />) : entity.subtitle ? <span>{entity.subtitle}</span> : null}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-tertiary">
                      {pickerPreviewFacts(entity.kind, entity.facts || entity.details?.map((text) => ({ kind: "text" as const, text }))).map((fact, index) => <EntityFactView key={`${index}:${fact.text}`} fact={fact} />)}
                    </span>
                  </span>
                  </button>
                  {destination && <OpenInNewTab href={destination} label={entity.name} />}
                </div>
              );
            })}
            {!options.length && (
              <p className="p-4 text-sm text-text-secondary">
                No accessible records match this search.
              </p>
            )}
          </div>
            </div>
          </div>
          {multiSelect && pending.length > 0 && (
            <div className="shrink-0 border-b border-border px-3 py-2" role="region" aria-label="Selected records">
              <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
                <span>{pending.length} selected · up to {MAX_CONTEXT_RECORDS} per message</span>
                {!!pending.length && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setPending([])} className="text-blue-primary hover:underline">Clear selected</button>}
              </div>
              {!!pending.length && <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                {pending.map((entity) => (
                  <span key={`${entity.kind}:${entity.id}`} title={[labels[entity.kind], entity.subtitle].filter(Boolean).join(" · ")} className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-blue-light text-blue-primary border border-blue-primary/20 pl-2 pr-1 py-0.5 text-xs">
                    <EntityMark entity={entity} />
                    <span className="truncate">{entity.name}</span>
                    <button type="button" aria-label={`Remove ${entity.name} from selection`} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(entity)} className="shrink-0 rounded-full p-1 hover:bg-blue-primary/10"><X size={12} /></button>
                  </span>
                ))}
              </div>}
            </div>
          )}
          {multiSelect && <div className="shrink-0 flex items-center justify-end gap-2 border-t border-border p-2">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={closePicker} className="rounded-lg px-3 py-1.5 text-xs text-text-secondary hover:bg-blue-light/50">Cancel</button>
            <button type="button" disabled={!pending.length} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(pending)} className="rounded-lg bg-blue-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed">Add selected ({pending.length})</button>
          </div>}
        </div>, document.body
      )}
    </div>
  );
}
