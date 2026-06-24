"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

type Variant = "success" | "error";
interface ToastItem {
  id: string;
  message: string;
  variant: Variant;
}

const ToastCtx = createContext<{
  toast: (message: string, variant?: Variant) => void;
}>({ toast: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, variant: Variant = "success") => {
    const id = `t${counter++}`;
    setToasts((t) => [...t, { id, message, variant }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 2600);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast-in pointer-events-auto flex items-center gap-2.5 bg-white border border-border-light rounded-lg shadow-card px-4 py-3 text-[13px] text-text-primary min-w-[240px]"
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
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
