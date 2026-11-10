import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Check, Info, X } from "lucide-react";
import { cn } from "../utils/cn";

export interface ToastInput {
  title: string;
  detail?: string;
  tone?: "neutral" | "success";
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface Toast extends ToastInput {
  id: number;
}

interface Ctx {
  toast: (t: ToastInput) => void;
}

const ToastContext = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((p) => p.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setItems((p) => [...p.slice(-2), { ...t, id }]);
      const ms = t.durationMs ?? (t.action ? 6000 : 3200);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Dark product-chrome toasts: the one place dark surface appears at small scale on cream. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-5">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="animate-slide-up pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-code-line bg-code-bg px-3.5 py-2.5 text-code shadow-float"
          >
            <span
              className={cn(
                "mt-[3px] flex size-4 flex-none items-center justify-center rounded-full",
                t.tone === "success" ? "bg-accent-2/20 text-accent-2" : "bg-white/10 text-code-muted"
              )}
            >
              {t.tone === "success" ? <Check className="size-2.5" strokeWidth={3} /> : <Info className="size-2.5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium leading-5">{t.title}</span>
              {t.detail && (
                <span className="block text-[12px] leading-[18px] text-code-muted">{t.detail}</span>
              )}
            </span>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className="ring-focus -my-0.5 flex-none rounded-md border border-code-line px-2 py-1 text-[12px] font-medium text-code transition-colors hover:bg-white/10"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-mr-1 -mt-0.5 flex size-6 flex-none items-center justify-center rounded-md text-code-muted transition-colors hover:text-code"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
