import { useEffect, useState } from "react";
import { BookOpen, Keyboard, LifeBuoy, Map as MapIcon, RotateCcw, Unlock, X } from "lucide-react";
import { useJourney } from "../context/JourneyContext";
import { useTour } from "./Tour";
import { useToast } from "../context/ToastContext";
import { Kbd } from "./ui";
import { cn } from "../utils/cn";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Command palette" },
  { keys: ["⌘", "N"], label: "New conversation" },
  { keys: ["⌘", "\\"], label: "Collapse sidebar" },
  { keys: ["?"], label: "Help & shortcuts" },
  { keys: ["↵"], label: "Send message" },
  { keys: ["Shift", "↵"], label: "New line in composer" },
  { keys: ["Esc"], label: "Close panel / deselect" },
  { keys: ["+", "−"], label: "Zoom canvas" },
  { keys: ["0"], label: "Fit canvas to screen" },
  { keys: ["→", "←"], label: "Step through walkthrough" },
];

export function HelpMenu() {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const { level, unlockedAll, unlockAll, reset } = useJourney();
  const { start } = useTour();
  const { toast } = useToast();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "?" ) {
        e.preventDefault();
        setSheet((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setSheet(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const levelLabel = ["Getting started", "Warming up", "Exploring", "Established"][level];

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          title="Help"
          aria-label="Help"
          data-tour="help"
          className={cn(
            "ring-focus flex size-7 items-center justify-center rounded-md transition-colors",
            open ? "bg-surface-2 text-primary" : "text-muted hover:bg-surface-2 hover:text-primary"
          )}
        >
          <LifeBuoy className="size-4" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="animate-scale-in absolute right-0 top-9 z-40 w-64 origin-top-right overflow-hidden rounded-lg border border-strong bg-surface shadow-float">
              <div className="border-b border-border px-3 py-2">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted">
                  Workspace stage
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex flex-1 gap-0.5">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-1 flex-1 rounded-full",
                          i <= level ? "bg-accent" : "bg-surface-3"
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-[11.5px] text-secondary">{levelLabel}</span>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-[17px] text-muted">
                  {unlockedAll
                    ? "All features are visible."
                    : "More of the workspace appears as you use it."}
                </p>
              </div>

              <div className="p-1">
                <MenuItem
                  icon={MapIcon}
                  label="Start walkthrough"
                  hint="5 steps"
                  onClick={() => {
                    setOpen(false);
                    start();
                  }}
                />
                <MenuItem
                  icon={Keyboard}
                  label="Keyboard shortcuts"
                  hint="?"
                  onClick={() => {
                    setOpen(false);
                    setSheet(true);
                  }}
                />
                <MenuItem
                  icon={BookOpen}
                  label="What's new"
                  hint="v0.4"
                  onClick={() => {
                    setOpen(false);
                    toast({
                      title: "Lumen 0.4",
                      detail: "Guided walkthrough, progressive workspace, editable code tutor.",
                    });
                  }}
                />
              </div>

              <div className="border-t border-border p-1">
                {!unlockedAll && (
                  <MenuItem
                    icon={Unlock}
                    label="Show everything now"
                    onClick={() => {
                      unlockAll();
                      setOpen(false);
                      toast({ title: "All features revealed", tone: "success" });
                    }}
                  />
                )}
                <MenuItem
                  icon={RotateCcw}
                  label="Reset journey"
                  onClick={() => {
                    reset();
                    setOpen(false);
                    toast({
                      title: "Journey reset",
                      detail: "Hints and progressive sections will reappear.",
                    });
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {sheet && (
        <div
          className="animate-fade-in fixed inset-0 z-[60] flex items-center justify-center bg-primary/40 px-4"
          onClick={() => setSheet(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-scale-in w-full max-w-md overflow-hidden rounded-lg border border-code-line bg-code-bg text-code shadow-float"
          >
            <div className="flex items-center gap-2 border-b border-code-line px-4 py-3">
              <Keyboard className="size-4 text-code-muted" />
              <h2 className="font-display text-[21px]">Keyboard shortcuts</h2>
              <button
                onClick={() => setSheet(false)}
                aria-label="Close"
                className="ml-auto flex size-7 items-center justify-center rounded-md text-code-muted transition-colors hover:bg-white/10 hover:text-code"
              >
                <X className="size-4" />
              </button>
            </div>
            <ul className="divide-y divide-code-line">
              {SHORTCUTS.map((s) => (
                <li key={s.label} className="flex items-center gap-3 px-4 py-2">
                  <span className="flex-1 text-[13px] text-code">{s.label}</span>
                  <span className="flex items-center gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="rounded-[4px] border border-code-line bg-white/5 px-1.5 py-0.5 font-sans text-[10.5px] text-code-muted"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-code-line px-4 py-2 text-[11.5px] text-code-muted">
              Press <Kbd>?</Kbd> anywhere to toggle this sheet.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MenuItem({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
    >
      <Icon className="size-3.5 flex-none text-muted" />
      <span className="flex-1">{label}</span>
      {hint && <span className="font-mono text-[10.5px] text-muted">{hint}</span>}
    </button>
  );
}
