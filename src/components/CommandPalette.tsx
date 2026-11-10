import { useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  CornerDownLeft,
  GraduationCap,
  LayoutGrid,
  MessageSquare,
  Map as MapIcon,
  Search,
  Settings,
  SunMoon,
  Shapes,
  SquareCode,
  GitFork,
} from "lucide-react";
import { conversations, projects } from "../lib/store";
import type { Page } from "../lib/nav";
import { cn } from "../utils/cn";

interface Item {
  id: string;
  label: string;
  group: string;
  icon: React.ElementType;
  page?: Page;
  arg?: string;
  run?: () => void;
  haystack?: string;
}

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onStartTour,
  onToggleTheme,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (p: Page, arg?: string) => void;
  onStartTour?: () => void;
  onToggleTheme?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const projs = projects.use();
  const convs = conversations.use();
  const items: Item[] = useMemo(
    () => [
      { id: "n1", label: "Home", group: "Navigate", icon: Compass, page: "home" },
      { id: "n2", label: "Learn", group: "Navigate", icon: GraduationCap, page: "learn" },
      { id: "n3", label: "Create", group: "Navigate", icon: Shapes, page: "create" },
      { id: "n4", label: "Library", group: "Navigate", icon: LayoutGrid, page: "library" },
      { id: "n5", label: "Preferences", group: "Navigate", icon: Settings, page: "settings" },
      { id: "a1", label: "New conversation", group: "Actions", icon: MessageSquare, page: "chat" },
      { id: "a2", label: "Code with Lumen", group: "Actions", icon: SquareCode, page: "code" },
      { id: "a3", label: "Visualise with Lumen", group: "Actions", icon: Shapes, page: "visualise" },
      { id: "a4", label: "Learning profile", group: "Actions", icon: GitFork, page: "profile" },
      { id: "a5", label: "Start walkthrough", group: "Actions", icon: MapIcon, run: onStartTour },
      { id: "a6", label: "Toggle light / dark", group: "Actions", icon: SunMoon, run: onToggleTheme },
      ...projs.filter((p) => p.status !== "archived").map((p) => ({
        id: p.id,
        label: p.name,
        group: "Projects",
        icon: LayoutGrid,
        page: "project" as Page,
        arg: p.id,
      })),
      ...convs.map((c) => ({
        id: c.id,
        label: c.archived ? `${c.title} (archived)` : c.title,
        group: "Conversations",
        icon: MessageSquare,
        page: "chat" as Page,
        arg: c.id,
        haystack: c.messages.map((m) => m.content).join(" ").toLowerCase(),
      })),
    ],
    [onStartTour, onToggleTheme, projs, convs]
  );

  const ql = query.toLowerCase();
  const filtered = items.filter((i) => i.label.toLowerCase().includes(ql) || (ql.length > 2 && i.haystack?.includes(ql))).slice(0, 60);

  const select = (it: Item) => {
    if (it.run) it.run();
    else if (it.page) onNavigate(it.page, it.arg);
    onClose();
  };

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(filtered.length - 1, i + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
      if (e.key === "Enter") {
        const it = filtered[index];
        if (it) {
          select(it);
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filtered, index, onClose, onNavigate]);

  if (!open) return null;

  let lastGroup = "";

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[12vh]" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-scale-in w-full max-w-lg overflow-hidden rounded-lg border border-strong bg-surface shadow-float"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="size-4 flex-none text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            placeholder="Search conversations, projects and pages…"
            className="h-12 w-full bg-transparent text-[14px] text-primary outline-none placeholder:text-muted"
          />
          <kbd className="flex-none">ESC</kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-muted">No results for "{query}"</p>
          )}
          {filtered.map((it, i) => {
            const showGroup = it.group !== lastGroup;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {showGroup && (
                  <p className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                    {it.group}
                  </p>
                )}
                <button
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => select(it)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                    i === index ? "bg-surface-2 text-primary" : "text-secondary"
                  )}
                >
                  <it.icon className={cn("size-3.5 flex-none", i === index ? "text-accent" : "text-muted")} />
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {i === index && <CornerDownLeft className="size-3.5 flex-none text-muted" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
