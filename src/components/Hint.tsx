import { X } from "lucide-react";
import { useJourney } from "../context/JourneyContext";
import { cn } from "../utils/cn";

/**
 * A one-time, in-place nudge. Appears only where and when it's relevant,
 * dismisses permanently, and never stacks. Not a tooltip, not a modal.
 */
export function Hint({
  id,
  children,
  action,
  className,
  tone = "neutral",
  when = true,
}: {
  id: string;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
  tone?: "neutral" | "accent";
  when?: boolean;
}) {
  const { hintDismissed, dismissHint } = useJourney();
  if (!when || hintDismissed(id)) return null;

  return (
    <div
      role="note"
      className={cn(
        "hint-in flex items-start gap-2.5 rounded-md border px-3 py-2 text-[12.5px] leading-[19px]",
        tone === "accent"
          ? "border-accent-line bg-accent-soft text-primary"
          : "border-border bg-surface-2 text-secondary",
        className
      )}
    >
      <span
        className={cn(
          "mt-[7px] size-1.5 flex-none rounded-full",
          tone === "accent" ? "bg-accent" : "bg-strong"
        )}
      />
      <span className="min-w-0 flex-1">{children}</span>
      {action && (
        <button
          onClick={() => {
            action.onClick();
            dismissHint(id);
          }}
          className="ring-focus -my-0.5 flex-none rounded-md border border-border bg-surface px-2 py-1 text-[11.5px] font-medium text-primary transition-colors hover:bg-surface-2"
        >
          {action.label}
        </button>
      )}
      <button
        onClick={() => dismissHint(id)}
        aria-label="Dismiss hint"
        className="-mr-1 -mt-0.5 flex size-6 flex-none items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-3 hover:text-primary"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
