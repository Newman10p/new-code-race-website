import { cn } from "../utils/cn";

/**
 * The Lumen mark: an aperture of light — four angled blades opening around a
 * bright core. Geometric, single stroke weight, no generic "sun" or "sparkle".
 */
export function LumenMark({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-full", className)} aria-hidden>
      <path
        d="M12 2.5 15.2 8.8 21.5 12 15.2 15.2 12 21.5 8.8 15.2 2.5 12 8.8 8.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
        opacity={filled ? 0.16 : 1}
      />
      <path
        d="M12 7.6 13.6 10.4 16.4 12 13.6 13.6 12 16.4 10.4 13.6 7.6 12 10.4 10.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function LumenWordmark({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 overflow-hidden">
      <div className="flex size-6 flex-none items-center justify-center rounded-md text-primary">
        <LumenMark className="size-[17px]" />
      </div>
      {!collapsed && (
        <span className="whitespace-nowrap font-display text-[19px] text-primary">
          Lumen
        </span>
      )}
    </div>
  );
}
