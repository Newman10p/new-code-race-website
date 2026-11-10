import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useJourney } from "../context/JourneyContext";
import type { Page } from "../lib/nav";
import { cn } from "../utils/cn";

export interface TourStep {
  id: string;
  target: string; // value of data-tour attribute
  title: string;
  body: string;
  page?: Page;
  placement?: "bottom" | "top" | "right" | "left";
}

export const TOUR_STEPS: TourStep[] = [
  { id: "modes", target: "tools", page: "home", title: "Five ways to learn", body: "Ask, Learn, Code, Visualise and Build are modes of one tutor — they share your context and history. Pick one before you type.", placement: "bottom" },
  { id: "composer", target: "composer", page: "home", title: "Start with a question", body: "Attach code or files, use your voice, and press Enter to send. Shift+Enter adds a new line.", placement: "bottom" },
  { id: "nav", target: "nav", page: "home", title: "Your studio", body: "Learn for guided lessons and practice, Create for projects, the code editor and diagrams, Library for what you save.", placement: "right" },
  { id: "search", target: "search", page: "home", title: "⌘K finds anything", body: "Search conversations — including what was said in them — projects and pages.", placement: "bottom" },
  { id: "profile", target: "profile", page: "home", title: "You control your context", body: "See exactly what Lumen knows about you, correct it, remove it, or start a conversation without it.", placement: "bottom" },
];

interface Ctx {
  active: boolean;
  index: number;
  start: () => void;
  stop: (completed?: boolean) => void;
  next: () => void;
  back: () => void;
}

const TourContext = createContext<Ctx | null>(null);

export function TourProvider({
  children,
  onNavigate,
}: {
  children: React.ReactNode;
  onNavigate: (p: Page) => void;
}) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const { mark } = useJourney();

  const start = useCallback(() => {
    setIndex(0);
    setActive(true);
    onNavigate(TOUR_STEPS[0].page ?? "home");
  }, [onNavigate]);

  const stop = useCallback(
    (completed = false) => {
      setActive(false);
      mark(completed ? "tour_done" : "tour_skipped");
    },
    [mark]
  );

  const go = useCallback(
    (i: number) => {
      if (i < 0) return;
      if (i >= TOUR_STEPS.length) {
        stop(true);
        return;
      }
      const step = TOUR_STEPS[i];
      if (step.page) onNavigate(step.page);
      setIndex(i);
    },
    [onNavigate, stop]
  );

  const next = useCallback(() => go(index + 1), [go, index]);
  const back = useCallback(() => go(index - 1), [go, index]);

  const value = useMemo(() => ({ active, index, start, stop, next, back }), [active, index, start, stop, next, back]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {active && <TourOverlay />}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}

/* ---------------- overlay ---------------- */

function TourOverlay() {
  const { index, next, back, stop } = useTour();
  const step = TOUR_STEPS[index];
  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    setRect(el.getBoundingClientRect());
  }, [step.target]);

  useLayoutEffect(() => {
    // give page transitions a frame to mount the target
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t1 = setTimeout(measure, 60);
    const t2 = setTimeout(measure, 380);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [measure, step.target]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop(false);
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [next, back, stop]);

  const pad = 6;
  const spot = rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null;

  // tooltip placement with viewport clamping
  const W = 320;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let placement = step.placement ?? "bottom";
  let top = 0;
  let left = 0;
  if (spot) {
    if (placement === "right" && spot.left + spot.width + W + 24 > vw) placement = "bottom";
    if (placement === "bottom" && spot.top + spot.height + 180 > vh) placement = "top";
    if (placement === "bottom") {
      top = spot.top + spot.height + 14;
      left = Math.min(Math.max(16, spot.left), vw - W - 16);
    } else if (placement === "top") {
      top = Math.max(16, spot.top - 14 - 170);
      left = Math.min(Math.max(16, spot.left), vw - W - 16);
    } else if (placement === "right") {
      top = Math.min(Math.max(16, spot.top), vh - 190);
      left = spot.left + spot.width + 14;
    } else {
      top = Math.min(Math.max(16, spot.top), vh - 190);
      left = Math.max(16, spot.left - 14 - W);
    }
  } else {
    top = vh / 2 - 90;
    left = vw / 2 - W / 2;
  }

  return (
    <>
      {/* click shield */}
      <div className="fixed inset-0 z-[69]" onClick={() => stop(false)} />
      {spot ? (
        <div className="tour-spot" style={spot} />
      ) : (
        <div className="fixed inset-0 z-[70] bg-primary/50" />
      )}

      <div
        className="animate-scale-in fixed z-[71] w-[320px] overflow-hidden rounded-lg border border-code-line bg-code-bg text-code shadow-float"
        style={{ top, left }}
        role="dialog"
        aria-label={step.title}
      >
        <div className="flex items-center gap-2 border-b border-code-line px-3.5 py-2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-code-muted">
            Walkthrough
          </span>
          <span className="font-mono text-[10.5px] tabular-nums text-code-muted">
            {index + 1} / {TOUR_STEPS.length}
          </span>
          <button
            onClick={() => stop(false)}
            aria-label="Skip walkthrough"
            className="ml-auto flex size-6 items-center justify-center rounded-md text-code-muted transition-colors hover:bg-white/10 hover:text-code"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="px-3.5 pb-3 pt-3">
          <h3 className="font-display text-[19px] leading-[1.2] text-code">{step.title}</h3>
          <p className="mt-1.5 text-[12.5px] leading-[20px] text-code-muted">{step.body}</p>
        </div>
        <div className="flex items-center gap-1 border-t border-code-line px-2.5 py-2">
          <div className="flex items-center gap-1 pl-1">
            {TOUR_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "h-1 rounded-full transition-all duration-300",
                  i === index ? "w-4 bg-accent" : i < index ? "w-1.5 bg-code-muted" : "w-1.5 bg-code-line"
                )}
              />
            ))}
          </div>
          <div className="flex-1" />
          <button
            onClick={back}
            disabled={index === 0}
            className="ring-focus inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-code-muted transition-colors hover:bg-white/10 hover:text-code disabled:opacity-30"
          >
            <ArrowLeft className="size-3" />
            Back
          </button>
          <button
            onClick={next}
            className="ring-focus inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
          >
            {index === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
            <ArrowRight className="size-3" />
          </button>
        </div>
      </div>
    </>
  );
}
