"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Highlighter,
  Indent,
  Italic,
  List,
  ListOrdered,
  Outdent,
  Palette,
  RemoveFormatting,
  Type,
  Underline,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A FORMAT BAR FOR THE MESSAGE (Saras, Aug 25, on the email composer: "This is
 * fine, a format bar for the message to be added though — Bold, Italics,
 * Underline, Font, Font Size, Font Colour, Highlights, bullets, indentation
 * etc.").
 *
 * The same contenteditable + execCommand approach the offering brief editor
 * has used since Aug 8, for the same reason: it needs no dependency, it works
 * in every browser the workspace runs, and what comes out is ordinary HTML
 * that any mail client renders. execCommand is formally deprecated and still
 * the only thing every engine implements — the alternative is a large editor
 * library for a box people write six lines in.
 *
 * The value is HTML. The route sends it as the mail's HTML part and strips a
 * plain-text alternative from it, so a client that refuses HTML still shows
 * the words.
 */

const FONTS = [
  { label: "Default", value: "" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
];

/** execCommand's fontSize takes 1-7, not pixels — the sizes it maps to. */
const SIZES = [
  { label: "Small", value: "2" },
  { label: "Normal", value: "3" },
  { label: "Large", value: "5" },
  { label: "Huge", value: "6" },
];

const INK = [
  "#1D1D1F",
  "#0071E3",
  "#16a34a",
  "#dc2626",
  "#B45309",
  "#7C3AED",
  "#6E6E73",
];

const HIGHLIGHT = ["#FEF08A", "#BFDBFE", "#BBF7D0", "#FBCFE8", "#E9D5FF"];

export function RichTextBox({
  value,
  onChange,
  ariaLabel,
  placeholder,
  minHeight = 240,
}: {
  value: string;
  onChange: (html: string) => void;
  ariaLabel: string;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** What WE last emitted, so a parent echo does not reset the caret. */
  const mine = useRef<string>("");
  const [openMenu, setOpenMenu] = useState<null | "ink" | "mark">(null);
  /**
   * WHAT WAS SELECTED WHEN THE MENU OPENED.
   *
   * Colour and highlight take TWO clicks — open the palette, then pick — and
   * between them React re-renders the toolbar. preventDefault on mousedown
   * keeps focus, but the range does not reliably survive that round trip, and
   * a colour command with no range formats nothing. The offering brief editor
   * learned this on Aug 8 for the same reason (its link dialog).
   */
  const saved = useRef<Range | null>(null);
  const remember = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) {
      saved.current = sel.getRangeAt(0).cloneRange();
    }
  };
  const restore = () => {
    const range = saved.current;
    if (!range) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  useEffect(() => {
    if (!ref.current || value === mine.current) return;
    mine.current = value;
    ref.current.innerHTML = value;
  }, [value]);

  const emit = () => {
    const html = ref.current?.innerHTML ?? "";
    mine.current = html;
    onChange(html);
  };

  /**
   * The toolbar buttons must not steal the selection — mousedown default is
   * what blurs the box, and a command with no selection formats nothing.
   */
  const run = (command: string, arg?: string) => {
    ref.current?.focus();
    /* ONLY restore when the live selection has actually left the editor. A
       blanket restore replaces a good current selection with a stale saved
       one, which is how bold and italic stopped working the moment the
       two-click colour menu was made to survive. */
    const live = window.getSelection();
    const inside =
      live && live.rangeCount && ref.current?.contains(live.anchorNode);
    if (!inside) restore();
    /* COLOUR AND HIGHLIGHT NEED CSS MODE. Left in its default "produce a
       <font> tag" mode, Chromium silently does nothing for foreColor and
       hiliteColor when the range is already inside other formatting — which is
       every real message, since people bold a line and then colour it. In CSS
       mode it writes an inline style and always applies. */
    const wantsCss = command === "foreColor" || command === "hiliteColor";
    if (wantsCss) document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, arg);
    if (wantsCss) document.execCommand("styleWithCSS", false, "false");
    setOpenMenu(null);
    emit();
  };

  const Btn = ({
    onPress,
    title,
    children,
    active = false,
  }: {
    onPress: () => void;
    title: string;
    children: React.ReactNode;
    active?: boolean;
  }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={cn(
        "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors",
        active
          ? "bg-blue-light text-blue-primary"
          : "text-text-secondary hover:bg-surface hover:text-text-primary"
      )}
    >
      {children}
    </button>
  );

  const select = (
    label: string,
    options: { label: string; value: string }[],
    command: string
  ) => (
    <select
      aria-label={label}
      title={label}
      defaultValue=""
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = e.target.value;
        e.target.value = "";
        if (v) run(command, v);
      }}
      className="h-7 cursor-pointer rounded-md border border-border-light bg-white px-1.5 text-[11.5px] text-text-secondary outline-none hover:border-blue-subtle"
    >
      <option value="" disabled>
        {label}
      </option>
      {options.map((o) => (
        <option key={o.label} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  const swatches = (colors: string[], command: string) => (
    <div className="absolute left-0 top-full z-30 mt-1 flex gap-1 rounded-lg border border-border-light bg-white p-1.5 shadow-card">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          aria-label={`Use ${c}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(command, c)}
          className="h-5 w-5 cursor-pointer rounded-full border border-border-light transition-transform hover:scale-110"
          style={{ background: c }}
        />
      ))}
    </div>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border-light bg-white focus-within:border-blue-primary">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border-light bg-surface/60 px-1.5 py-1.5">
        <Btn onPress={() => run("bold")} title="Bold">
          <Bold size={14} strokeWidth={2.4} />
        </Btn>
        <Btn onPress={() => run("italic")} title="Italic">
          <Italic size={14} strokeWidth={2.4} />
        </Btn>
        <Btn onPress={() => run("underline")} title="Underline">
          <Underline size={14} strokeWidth={2.4} />
        </Btn>
        <span className="mx-1 h-5 w-px bg-border-light" />
        {select("Font", FONTS, "fontName")}
        {select("Size", SIZES, "fontSize")}
        <span className="mx-1 h-5 w-px bg-border-light" />
        <span className="relative">
          <Btn
            onPress={() => {
              remember();
              setOpenMenu(openMenu === "ink" ? null : "ink");
            }}
            title="Font colour"
            active={openMenu === "ink"}
          >
            <Palette size={14} strokeWidth={2.2} />
          </Btn>
          {openMenu === "ink" && swatches(INK, "foreColor")}
        </span>
        <span className="relative">
          <Btn
            onPress={() => {
              remember();
              setOpenMenu(openMenu === "mark" ? null : "mark");
            }}
            title="Highlight"
            active={openMenu === "mark"}
          >
            <Highlighter size={14} strokeWidth={2.2} />
          </Btn>
          {openMenu === "mark" && swatches(HIGHLIGHT, "hiliteColor")}
        </span>
        <span className="mx-1 h-5 w-px bg-border-light" />
        <Btn onPress={() => run("insertUnorderedList")} title="Bullets">
          <List size={14} strokeWidth={2.2} />
        </Btn>
        <Btn onPress={() => run("insertOrderedList")} title="Numbered list">
          <ListOrdered size={14} strokeWidth={2.2} />
        </Btn>
        <Btn onPress={() => run("indent")} title="Indent">
          <Indent size={14} strokeWidth={2.2} />
        </Btn>
        <Btn onPress={() => run("outdent")} title="Outdent">
          <Outdent size={14} strokeWidth={2.2} />
        </Btn>
        <span className="mx-1 h-5 w-px bg-border-light" />
        <Btn
          onPress={() => {
            run("removeFormat");
            run("formatBlock", "p");
          }}
          title="Clear formatting"
        >
          <RemoveFormatting size={14} strokeWidth={2.2} />
        </Btn>
        <span className="ml-auto flex items-center gap-1 pr-1 text-[10.5px] text-text-tertiary">
          <Type size={11} strokeWidth={2.2} aria-hidden="true" />
          Formatting carries into the email
        </span>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onKeyUp={remember}
        onMouseUp={remember}
        style={{ minHeight }}
        className={cn(
          "freyr-richtext w-full overflow-y-auto px-3 py-2.5 text-[13px] leading-relaxed text-text-primary outline-none",
          "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3",
          "[&:empty]:before:text-text-tertiary [&:empty]:before:content-[attr(data-placeholder)]"
        )}
      />
    </div>
  );
}
