"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, Search } from "lucide-react";
import { floatingMenuStyle, menuMotionVars } from "@/components/ui/ColorSelect";
import { cn } from "@/lib/utils";

/**
 * A BOX THAT LOOKS THINGS UP AS YOU TYPE (Anir, Sep 10: "when i search it up
 * it looks it up (like u know how those work?)").
 *
 * Typing still just types: the value is whatever is in the box, and the list
 * under it only offers. Arrow keys move through the offers, Enter takes the
 * highlighted one, Escape closes the list without closing the dialog behind
 * it, and a click anywhere else closes it too. The list floats over the page
 * like the app's other dropdowns, so opening it never moves the form.
 */
export type LookupOption = {
  key: string;
  main: string;
  detail?: string;
  icon?: ReactNode;
  tag?: string;
};
export type LookupGroup = { title?: string; options: LookupOption[] };
export type LookupAnswer = { groups: LookupGroup[]; footer?: ReactNode };

type MenuStyle = ReturnType<typeof floatingMenuStyle>;

/* Long enough that a word being typed is one lookup, short enough to feel live. */
const WAIT_MS = 250;

export function LookupField({
  value,
  onChange,
  load,
  onPick,
  ariaLabel,
  inputClassName,
  className,
  placeholder,
  minChars = 2,
  disabled = false,
  invalid = false,
  autoFocus = false,
  onEnter,
  menuWidth = 440,
  emptyText = "Nothing found. Type it in yourself.",
}: {
  value: string;
  onChange: (value: string) => void;
  load: (query: string, signal: AbortSignal) => Promise<LookupAnswer>;
  onPick: (option: LookupOption) => void;
  ariaLabel: string;
  inputClassName: string;
  className?: string;
  placeholder?: string;
  minChars?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  /** Enter while the list is closed, so a form can still save on Enter. */
  onEnter?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  menuWidth?: number;
  emptyText?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asking = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<LookupAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<MenuStyle | null>(null);

  const options = answer ? answer.groups.flatMap((group) => group.options) : [];

  const anchor = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(Math.max(rect.width, menuWidth), window.innerWidth - 24);
    setMenuStyle(floatingMenuStyle(rect, width, 240));
  };

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    asking.current?.abort();
    asking.current = null;
  };

  const close = () => {
    stop();
    setOpen(false);
    setActive(-1);
    setLoading(false);
  };

  const lookUp = (typed: string) => {
    stop();
    const query = typed.replace(/\s+/g, " ").trim();
    if (query.length < minChars) {
      setOpen(false);
      setAnswer(null);
      setFailed(false);
      setLoading(false);
      setActive(-1);
      return;
    }
    timer.current = setTimeout(() => {
      const controller = new AbortController();
      asking.current = controller;
      anchor();
      setOpen(true);
      setLoading(true);
      setFailed(false);
      load(query, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          setAnswer(next);
          setActive(-1);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setAnswer(null);
          setFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, WAIT_MS);
  };

  const pick = (option: LookupOption) => {
    close();
    setAnswer(null);
    onPick(option);
  };

  useEffect(() => {
    const pending = timer;
    const request = asking;
    return () => {
      if (pending.current) clearTimeout(pending.current);
      request.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const shut = () => {
      if (timer.current) clearTimeout(timer.current);
      asking.current?.abort();
      setOpen(false);
      setActive(-1);
      setLoading(false);
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (inputRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      shut();
    };
    /* Escape closes THIS list and stops there, the same as ColorSelect: it
       must not reach the Modal and throw away a half-filled form. */
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      event.preventDefault();
      shut();
    };
    const onScroll = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuStyle((previous) =>
        floatingMenuStyle(
          rect,
          typeof previous?.width === "number" ? previous.width : Math.max(rect.width, menuWidth),
          240
        )
      );
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", shut);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", shut);
    };
  }, [open, menuWidth]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const key = event.key;
    if (key === "ArrowDown" || key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      if (!open) {
        anchor();
        setOpen(true);
      }
      setActive((current) =>
        key === "ArrowDown"
          ? (current + 1) % options.length
          : current <= 0
            ? options.length - 1
            : current - 1
      );
      return;
    }
    if (key === "Enter") {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        const option = active >= 0 ? options[active] : undefined;
        if (option) pick(option);
        else close();
        return;
      }
      onEnter?.(event);
    }
  };

  let position = -1;
  const menu =
    open && menuStyle && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={`${ariaLabel} suggestions`}
            onMouseDown={(event) => event.preventDefault()}
            className="menu-in z-[110] flex flex-col overflow-hidden rounded-lg border border-border-light bg-white shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)]"
            style={{ ...menuStyle, ...menuMotionVars(menuStyle) }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {options.length === 0 ? (
                <div className="flex items-center gap-2 px-2.5 py-2.5 text-[12.5px] text-text-tertiary">
                  {loading ? (
                    <>
                      <Loader2 size={14} strokeWidth={2.2} className="animate-spin" aria-hidden="true" />
                      Looking it up…
                    </>
                  ) : failed ? (
                    "The lookup is not answering right now. Type it in yourself."
                  ) : (
                    emptyText
                  )}
                </div>
              ) : (
                answer?.groups.map((group, groupIndex) =>
                  group.options.length === 0 ? null : (
                    <div key={group.title ?? `group-${groupIndex}`} role="group" aria-label={group.title}>
                      {group.title && (
                        <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                          {group.title}
                        </div>
                      )}
                      {group.options.map((option) => {
                        position += 1;
                        const index = position;
                        const on = index === active;
                        return (
                          <div
                            key={option.key}
                            id={`${listId}-${index}`}
                            role="option"
                            aria-selected={on}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => pick(option)}
                            className={cn(
                              "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors",
                              on && "bg-surface"
                            )}
                          >
                            {option.icon && (
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center">{option.icon}</span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold text-text-primary">
                                {option.main}
                              </span>
                              {option.detail && (
                                <span className="block truncate text-[11.5px] text-text-tertiary">{option.detail}</span>
                              )}
                            </span>
                            {option.tag && (
                              <span className="shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-[10.5px] font-semibold text-text-secondary">
                                {option.tag}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                )
              )}
            </div>
            {answer?.footer && options.length > 0 && (
              <div className="flex shrink-0 items-center justify-end border-t border-border-light px-2.5 py-1.5 text-[11px] text-text-tertiary">
                {answer.footer}
              </div>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div className={cn("relative", className)}>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          lookUp(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          window.setTimeout(() => {
            if (document.activeElement !== inputRef.current) close();
          }, 150);
        }}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid ? true : undefined}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        disabled={disabled}
        className={cn(inputClassName, "pr-9")}
      />
      <span
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary"
        aria-hidden="true"
      >
        {loading ? (
          <Loader2 size={14} strokeWidth={2.2} className="animate-spin" />
        ) : (
          <Search size={14} strokeWidth={2.2} />
        )}
      </span>
      {menu}
    </div>
  );
}
