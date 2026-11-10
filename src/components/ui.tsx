import { cn } from "../utils/cn";

/*
 * Radius hierarchy (enforced, not advisory):
 *   controls  → rounded-md   (6px)   buttons, inputs, chips, tabs
 *   containers→ rounded-lg   (8px)   cards, panels, drawers
 *   tags      → rounded-sm   (4px)   badges, status pills
 *   code/data → flush         (0px)  editors, tables, raw output
 */

/* ---------------- Button ---------------- */
type Variant = "primary" | "secondary" | "ghost" | "subtle" | "danger";
type Size = "xs" | "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover active:translate-y-px disabled:hover:bg-accent",
  secondary:
    "border border-strong bg-surface text-primary hover:bg-surface-2 active:translate-y-px",
  ghost: "text-secondary hover:bg-surface-2 hover:text-primary active:translate-y-px",
  subtle: "bg-surface-2 text-primary hover:bg-surface-3 active:translate-y-px",
  danger: "border border-strong text-danger hover:border-danger/50 hover:bg-danger/10",
};

const SIZES: Record<Size, string> = {
  xs: "h-6 gap-1 px-1.5 text-[11.5px]",
  sm: "h-7 gap-1.5 px-2 text-[12px]",
  md: "h-8 gap-1.5 px-2.5 text-[12.5px]",
  lg: "h-9 gap-2 px-3.5 text-[13px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "ring-focus inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors duration-100 disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  className,
  label,
  active,
  size = "md",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <button
      title={label}
      aria-label={label}
      className={cn(
        "ring-focus inline-flex flex-none items-center justify-center rounded-md transition-colors duration-100 active:translate-y-px",
        size === "sm" ? "size-6" : "size-7",
        active
          ? "bg-surface-3 text-accent"
          : "text-muted hover:bg-surface-2 hover:text-primary",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ---------------- Surfaces ---------------- */
export function Card({
  className,
  interactive,
  flush,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean; flush?: boolean }) {
  return (
    <div
      className={cn(
        "border border-border bg-surface",
        flush ? "" : "rounded-lg",
        interactive &&
          "cursor-pointer transition-colors duration-100 hover:border-strong hover:bg-surface-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Flat, divider-separated list — the workbench default over card grids. */
export function Rows({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rows border border-border bg-surface rounded-lg", className)} {...props}>
      {children}
    </div>
  );
}

export function Row({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-2/60",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* ---------------- Badge ---------------- */
export function Badge({
  tone = "plain",
  className,
  children,
}: {
  tone?: "plain" | "accent" | "mint" | "warn" | "danger";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    plain: "border-border bg-surface-2 text-secondary",
    accent: "border-accent-line bg-accent-soft text-accent",
    mint: "border-accent-2/30 bg-accent-2-soft text-accent-2",
    warn: "border-warn/30 bg-warn/10 text-warn",
    danger: "border-danger/30 bg-danger/10 text-danger",
  };
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1 rounded-sm border px-1.5 py-px text-[10.5px] font-medium leading-[16px]",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** 11px uppercase section label — the primary hierarchy device in dense views. */
export function MetaLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted",
        className
      )}
    >
      {children}
    </p>
  );
}

/** State indicator. Accent is reserved for live/active states only. */
export function StatusDot({
  state = "idle",
  className,
}: {
  state?: "idle" | "active" | "done" | "error";
  className?: string;
}) {
  const map = {
    idle: "bg-strong",
    active: "bg-accent animate-pulse",
    done: "bg-accent-2",
    error: "bg-danger",
  };
  return <span className={cn("size-1.5 flex-none rounded-full", map[state], className)} />;
}

/* ---------------- Segmented control ---------------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: { value: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-px rounded-md border border-border bg-surface-2 p-px",
        className
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "ring-focus inline-flex items-center gap-1.5 rounded-[4px] font-medium transition-colors duration-100",
            size === "sm" ? "h-[22px] px-1.5 text-[11.5px]" : "h-[26px] px-2 text-[12px]",
            value === o.value
              ? "bg-surface text-primary"
              : "text-muted hover:text-secondary"
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Toggle ---------------- */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "ring-focus relative h-[20px] w-[34px] flex-none rounded-full border transition-colors duration-150",
        checked ? "border-accent bg-accent" : "border-strong bg-surface-3"
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] size-[14px] rounded-full bg-white transition-transform duration-150",
          checked ? "translate-x-[16px]" : "translate-x-[2px]"
        )}
      />
    </button>
  );
}

/* ---------------- Slider ---------------- */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  labels,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  labels?: string[];
}) {
  return (
    <div className="w-full">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
      />
      {labels && (
        <div className="mt-1.5 flex justify-between">
          {labels.map((l, i) => (
            <span
              key={l}
              className={cn(
                "text-[11px]",
                Math.round(((value - min) / (max - min)) * (labels.length - 1)) === i
                  ? "font-semibold text-primary"
                  : "text-muted"
              )}
            >
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Progress ---------------- */
export function Progress({
  value,
  tone = "accent",
  className,
}: {
  value: number;
  tone?: "accent" | "mint" | "warn";
  className?: string;
}) {
  const tones = { accent: "bg-accent", mint: "bg-accent-2", warn: "bg-warn" };
  return (
    <div className={cn("h-[3px] w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div
        className={cn("bar-fill h-full rounded-full", tones[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* ---------------- Section header ---------------- */
export function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number | string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <MetaLabel>{title}</MetaLabel>
      {count !== undefined && (
        <span className="font-mono text-[10.5px] tabular-nums text-muted">{count}</span>
      )}
      <span className="mx-1 h-px flex-1 bg-border" />
      {action}
    </div>
  );
}

/* ---------------- Select ---------------- */
export function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "ring-focus h-7 cursor-pointer rounded-md border border-strong bg-surface px-2 text-[12.5px] text-primary outline-none transition-colors hover:bg-surface-2",
        className
      )}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/* ---------------- Keyboard hint ---------------- */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[3px] border border-border-strong bg-surface-2 px-1 py-px font-sans text-[10px] font-medium leading-[14px] text-muted">
      {children}
    </kbd>
  );
}

/* ---------------- Toolbar ---------------- */
/** Flush, bordered control strip for workbench surfaces. */
export function Toolbar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-none items-center gap-1 border-b border-border bg-surface px-2 py-1.5",
        className
      )}
    >
      {children}
    </div>
  );
}
