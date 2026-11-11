import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { cn } from "../../utils/cn";

/* =========================================================================
 * CODE RACE AI — small, reusable primitives.
 * ========================================================================= */

/** The product mark: a code bracket pair with a speed slash. */
export function RaceMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M8.6 7.2 4.2 12l4.4 4.8"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.4 7.2 19.8 12l-4.4 4.8"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.8 5.9 10.2 18.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

/** Abstract AI core used on the welcome screen. */
export function AiOrb({ size = 116, className }: { size?: number; className?: string }) {
  return (
    <div className={cn("relative flex-none", className)} style={{ width: size, height: size }} aria-hidden="true">
      <div className="cr-orb-glow cr-breathe absolute inset-0 rounded-full opacity-70" />
      <div className="absolute inset-[3px] rounded-full border border-white/[0.07]" />
      <div className="cr-orbit absolute inset-[10px] rounded-full border border-dashed border-[#8b5cf6]/25">
        <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#a78bfa] shadow-[0_0_10px_2px_rgba(167,139,250,0.6)]" />
        <span className="absolute bottom-[12%] right-[8%] size-1 rounded-full bg-[#22d3ee] shadow-[0_0_8px_1px_rgba(34,211,238,0.55)]" />
      </div>
      <div className="cr-orbit-reverse absolute inset-[24px] rounded-full border border-[#4f8cff]/20" />
      <div className="cr-gradient-brand absolute inset-[34%] rounded-full shadow-[0_0_28px_rgba(124,92,246,0.52)]">
        <div className="absolute inset-[1.5px] flex items-center justify-center rounded-full bg-[#0a0e1d]/35">
          <RaceMark className="size-[44%] text-white/90" />
        </div>
        <span className="absolute left-[22%] top-[16%] size-[18%] rounded-full bg-white/40 blur-[3px]" />
      </div>
      <span className="absolute inset-x-[30%] bottom-[6%] h-px bg-gradient-to-r from-transparent via-[#22d3ee]/50 to-transparent" />
    </div>
  );
}

/* ---------------- popover ---------------- */

export function Popover({
  open,
  onClose,
  children,
  align = "right",
  side = "bottom",
  className,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: "left" | "right";
  side?: "bottom" | "top";
  className?: string;
  labelledBy?: string;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        role="menu"
        aria-labelledby={labelledBy}
        className={cn(
          "animate-scale-in absolute z-50 min-w-[228px] overflow-hidden rounded-xl border border-strong bg-surface p-1 shadow-float",
          side === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
          align === "right" ? "right-0" : "left-0",
          className
        )}
      >
        {children}
      </div>
    </>
  );
}

export function MenuItem({
  icon,
  label,
  description,
  active,
  disabled,
  badge,
  onSelect,
}: {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  active?: boolean;
  disabled?: boolean;
  badge?: React.ReactNode;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={!!active}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "ring-focus flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-45" : "hover:bg-surface-2",
        active && "bg-accent-soft"
      )}
    >
      {icon && <span className="mt-px flex size-5 flex-none items-center justify-center text-muted">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn("truncate text-[12.5px] font-medium", active ? "text-primary" : "text-secondary")}>{label}</span>
          {badge}
        </span>
        {description && <span className="mt-0.5 block text-[11px] leading-[15px] text-muted">{description}</span>}
      </span>
      {active && <Check className="mt-1 size-3.5 flex-none text-accent" />}
    </button>
  );
}

/* ---------------- modal ---------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
  icon?: React.ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && panelRef.current) {
        const nodes = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panelRef.current;
      target?.focus();
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
      previous?.focus?.();
    };
    // Focus is managed once per open/close, not on every parent render —
    // otherwise typing in a dialog input can lose focus mid-keystroke.
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="cr-ai-portal fixed inset-0 z-[90] flex items-end justify-center p-0 text-primary sm:items-center sm:p-5">
      <div className="animate-fade-in absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "animate-slide-up relative w-full rounded-t-2xl border border-strong bg-surface p-5 shadow-float outline-none sm:rounded-xl",
          width
        )}
      >
        <div className="flex items-start gap-3">
          {icon && (
            <span className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-lg border border-accent-line bg-accent-soft text-accent">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] font-semibold text-primary">{title}</h2>
            {description && <p className="mt-1 text-[12.5px] leading-5 text-secondary">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="ring-focus -mr-1 -mt-1 flex size-7 flex-none items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary"
          >
            <X className="size-4" />
          </button>
        </div>
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-5 flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** Switch used in the context panel. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "ring-focus relative h-[18px] w-[32px] flex-none rounded-full border transition-colors duration-150 disabled:opacity-40",
        checked ? "border-accent bg-accent" : "border-strong bg-surface-3"
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] size-[12px] rounded-full bg-white transition-transform duration-150",
          checked ? "translate-x-[16px]" : "translate-x-[2px]"
        )}
      />
    </button>
  );
}
