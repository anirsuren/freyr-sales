"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

type Variant = "success" | "error";
/** An optional "…and here's where it went" link, for toasts that report work
 *  the user can now go look at (a created session, a saved draft). */
export type ToastAction = { label: string; href: string };
interface ToastItem {
  id: string;
  message: string;
  variant: Variant;
  action?: ToastAction;
}

const ToastCtx = createContext<{
  toast: (message: string, variant?: Variant, action?: ToastAction) => void;
}>({ toast: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: Variant = "success", action?: ToastAction) => {
      const id = `t${counter++}`;
      setToasts((t) => [...t, { id, message, variant, action }]);
      // Errors stay until the user dismisses them. Auto-hiding a validation
      // explanation before someone can finish reading it makes recovery
      // impossible; success notices may remain brief.
      if (variant !== "error")
        setTimeout(() => dismiss(id), action ? 8000 : 2600);
    },
    [dismiss]
  );

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast-in pointer-events-auto flex min-w-[240px] max-w-[min(520px,calc(100vw-3rem))] items-start gap-2.5 rounded-xl border border-border-light bg-white px-4 py-3 text-[13px] leading-relaxed text-text-primary shadow-[0_8px_28px_-6px_rgba(0,0,0,0.18)]"
          >
            {t.variant === "error" ? (
              <AlertCircle size={18} strokeWidth={1.5} className="text-error" />
            ) : (
              <CheckCircle2
                size={18}
                strokeWidth={1.5}
                className="text-success"
              />
            )}
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <Link
                href={t.action.href}
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-[13px] font-semibold text-blue-primary hover:underline"
              >
                {t.action.label}
              </Link>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
