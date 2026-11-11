import { useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  GraduationCap,
  LayoutGrid,
  LifeBuoy,
  Pencil,
  Plus,
  Search,
  Settings2,
  Shapes,
  SlidersHorizontal,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { initials } from "../../lib/profile";
import { useProfile } from "../../context/ProfileContext";
import type { Conversation } from "../../lib/store";
import { WORKSPACE_NAV, toolMeta } from "../../lib/aiTools";
import type { ToolId } from "../../lib/aiTools";
import type { Page } from "../../lib/nav";
import { RaceMark } from "./primitives";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupOf(ts: number): string {
  const today = startOfToday();
  if (ts >= today) return "Today";
  if (ts >= today - 86400000) return "Yesterday";
  if (ts >= today - 7 * 86400000) return "Previous 7 days";
  return "Earlier";
}

function stamp(ts: number) {
  const today = startOfToday();
  if (ts >= today) return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (ts >= today - 7 * 86400000) return new Date(ts).toLocaleDateString([], { weekday: "short" });
  return new Date(ts).toLocaleDateString([], { day: "numeric", month: "short" });
}

export function AiSidebar({
  conversations,
  activeId,
  activeTool,
  busy,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  onSelect,
  onNewChat,
  onTool,
  onRename,
  onDeleteRequest,
  onNavigate,
  onHelp,
  onPreferences,
}: {
  conversations: Conversation[];
  activeId?: string;
  activeTool: ToolId;
  busy: string[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onTool: (tool: ToolId) => void;
  onRename: (id: string, title: string) => void;
  onDeleteRequest: (conv: Conversation) => void;
  onNavigate: (page: Page) => void;
  onHelp: () => void;
  onPreferences: () => void;
}) {
  const { profile } = useProfile();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const wide = !collapsed || mobileOpen;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const live = conversations
      .filter((c) => !c.archived && c.messages.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return live;
    return live.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, query]);

  const groups = useMemo(() => {
    const order = ["Today", "Yesterday", "Previous 7 days", "Earlier"];
    const map = new Map<string, Conversation[]>();
    filtered.forEach((c) => {
      const g = groupOf(c.updatedAt);
      map.set(g, [...(map.get(g) ?? []), c]);
    });
    return order.filter((g) => map.has(g)).map((g) => ({ label: g, items: map.get(g)! }));
  }, [filtered]);

  const commitRename = () => {
    if (!editing) return;
    const title = draft.trim();
    if (title) onRename(editing, title);
    setEditing(null);
  };

  const expandAndSearch = () => {
    if (collapsed) onToggleCollapse();
    setTimeout(() => searchRef.current?.focus(), 90);
  };

  const go = (page: Page) => {
    onCloseMobile();
    onNavigate(page);
  };

  return (
    <>
      <div
        onClick={onCloseMobile}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-40 bg-black/60 transition-opacity xl:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        aria-label="CODE RACE AI navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[286px] flex-col border-r border-border bg-sidebar transition-[width,transform] duration-300 xl:static xl:z-auto xl:translate-x-0",
          collapsed ? "xl:w-[68px]" : "xl:w-[286px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* brand */}
        <div className={cn("flex h-14 flex-none items-center gap-2.5", collapsed ? "xl:justify-center xl:px-0" : "px-3.5")}>
          <div className="cr-gradient-brand flex size-8 flex-none items-center justify-center rounded-[9px] text-white shadow-[0_4px_18px_-4px_rgba(124,92,246,0.8)]">
            <RaceMark className="size-[18px]" />
          </div>
          {wide && (
            <div className="min-w-0 flex-1 leading-none">
              <div className="flex items-center gap-1.5">
                <span className="text-[13.5px] font-semibold tracking-[0.14em] text-primary">CODE RACE</span>
                <span className="rounded-[3px] border border-accent-line bg-accent-soft px-1 py-px text-[8.5px] font-semibold tracking-[0.1em] text-[#c4b5fd]">
                  AI
                </span>
              </div>
              <span className="mt-1 block text-[9.5px] font-medium uppercase tracking-[0.18em] text-muted">
                Coding intelligence
              </span>
            </div>
          )}
          <button
            onClick={onCloseMobile}
            className="ring-focus flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary xl:hidden"
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
          {wide && (
            <button
              onClick={onToggleCollapse}
              className="ring-focus hidden size-7 flex-none items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary xl:flex"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={onToggleCollapse}
            className="ring-focus mx-auto mb-1 hidden size-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary xl:flex"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <ChevronRight className="size-4" />
          </button>
        )}

        {/* primary actions */}
        <div className={cn("flex-none space-y-1.5 pb-3", collapsed ? "xl:px-2" : "px-3")}>
          <button
            onClick={() => {
              onNewChat();
              onCloseMobile();
            }}
            title={collapsed ? "New chat (⌘N)" : undefined}
            className={cn(
              "ring-focus group flex h-9 w-full items-center gap-2 rounded-lg border border-accent-line/70 bg-accent-soft px-2.5 text-[12.5px] font-medium text-[#ddd6fe] transition-colors hover:bg-[#8b5cf6]/20",
              collapsed && "xl:justify-center xl:px-0"
            )}
          >
            <Plus className="size-4 flex-none" />
            {wide && (
              <>
                <span>New chat</span>
                <span className="ml-auto font-mono text-[10px] text-[#a78bfa]/70">⌘N</span>
              </>
            )}
          </button>

          {wide ? (
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                id="cr-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations"
                aria-label="Search conversations"
                className="h-8 w-full rounded-lg border border-border bg-surface/60 pl-8 pr-12 text-[12px] text-primary outline-none transition-colors placeholder:text-muted hover:border-strong focus:border-accent/60"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="ring-focus absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 border-0 bg-transparent p-0 text-[9.5px] text-muted/70">
                  ⌘K
                </kbd>
              )}
            </label>
          ) : (
            <button
              onClick={expandAndSearch}
              title="Search conversations"
              aria-label="Search conversations"
              className="ring-focus mx-auto hidden size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-primary xl:flex"
            >
              <Search className="size-4" />
            </button>
          )}
        </div>

        {/* workspace destinations */}
        <nav aria-label="AI destinations" className={cn("flex-none space-y-0.5 px-2.5 pb-2")}>
          {wide && (
            <p className="mb-1.5 px-2 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted/80">
              Workspace
            </p>
          )}
          {WORKSPACE_NAV.map((item) => {
            const active = activeTool === item.tool;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onTool(item.tool);
                  onCloseMobile();
                }}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "ring-focus relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors",
                  collapsed && "xl:justify-center xl:px-0",
                  active ? "bg-surface-2 text-primary" : "text-secondary hover:bg-white/[0.035] hover:text-primary"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[#a78bfa] to-[#22d3ee]" />
                )}
                <item.icon className={cn("size-4 flex-none", active ? "text-[#a78bfa]" : "text-muted")} />
                {wide && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="mx-3 flex-none border-t border-border" />

        {/* history */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
          {wide ? (
            <>
              {query && groups.length > 0 && (
                <p className="mb-2 truncate px-2 text-[10px] text-muted">
                  {filtered.length} {filtered.length === 1 ? "result" : "results"} for “{query}”
                </p>
              )}
              {groups.length === 0 && (
                <div className="mx-0.5 rounded-lg border border-dashed border-border px-3 py-4 text-center">
                  <p className="text-[11.5px] text-muted">
                    {query ? "No conversations match your search." : "No conversations yet."}
                  </p>
                  {!query && (
                    <p className="mt-1 text-[11px] leading-4 text-muted/70">Start a chat and it will appear here, grouped by day.</p>
                  )}
                </div>
              )}
              {groups.map((group) => (
                <section key={group.label} className="mb-3 last:mb-0">
                  <p className="mb-1 px-2 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted/80">
                    {group.label}
                  </p>
                  {group.items.map((c) => {
                    const active = c.id === activeId;
                    const meta = toolMeta(c.aiTool);
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          "group relative flex items-center rounded-md transition-colors",
                          active ? "bg-surface-2" : "hover:bg-white/[0.035]"
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[#a78bfa] to-[#4f8cff]" />
                        )}
                        {editing === c.id ? (
                          <div className="flex w-full items-center gap-1 px-1.5 py-1">
                            <input
                              ref={inputRef}
                              autoFocus
                              value={draft}
                              onFocus={(e) => e.currentTarget.select()}
                              onBlur={commitRename}
                              onChange={(e) => setDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitRename();
                                if (e.key === "Escape") setEditing(null);
                              }}
                              aria-label="Conversation title"
                              className="h-6 min-w-0 flex-1 rounded border border-accent/60 bg-surface px-1.5 text-[12px] text-primary outline-none"
                            />
                            <button
                              onClick={commitRename}
                              aria-label="Save title"
                              className="flex size-6 items-center justify-center rounded text-accent hover:bg-surface-2"
                            >
                              <Check className="size-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                onSelect(c.id);
                                onCloseMobile();
                              }}
                              title={c.title}
                              className="flex min-w-0 flex-1 items-center gap-2 py-[7px] pl-2.5 pr-1 text-left"
                            >
                              <meta.icon className={cn("size-3.5 flex-none", active ? "text-[#a78bfa]" : "text-muted/70")} />
                              <span className={cn("min-w-0 flex-1 truncate text-[12px]", active ? "text-primary" : "text-secondary")}>
                                {c.title}
                              </span>
                              {busy.includes(c.id) ? (
                                <span className="size-1.5 flex-none animate-pulse rounded-full bg-[#22d3ee]" aria-label="Generating" />
                              ) : (
                                <span className="hidden flex-none font-mono text-[9.5px] text-muted/60 group-hover:hidden sm:block">
                                  {stamp(c.updatedAt)}
                                </span>
                              )}
                            </button>
                            <div className="mr-1 flex flex-none items-center gap-0.5 opacity-60 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                              <button
                                onClick={() => {
                                  setEditing(c.id);
                                  setDraft(c.title);
                                }}
                                aria-label={`Rename ${c.title}`}
                                title="Rename"
                                className="flex size-6 items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-primary"
                              >
                                <Pencil className="size-3" />
                              </button>
                              <button
                                onClick={() => onDeleteRequest(c)}
                                aria-label={`Delete ${c.title}`}
                                title="Delete"
                                className="flex size-6 items-center justify-center rounded text-muted hover:bg-danger/10 hover:text-danger"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </section>
              ))}
            </>
          ) : (
            <div className="hidden xl:flex xl:flex-col xl:items-center xl:gap-1.5">
              {filtered.slice(0, 6).map((c) => {
                const meta = toolMeta(c.aiTool);
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    title={c.title}
                    aria-label={c.title}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md",
                      c.id === activeId ? "bg-surface-2 text-[#a78bfa]" : "text-muted hover:bg-surface-2 hover:text-primary"
                    )}
                  >
                    <meta.icon className="size-4" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* platform links */}
        <div className="flex-none border-t border-border px-2.5 py-2">
          {wide && (
            <p className="mb-1.5 px-2 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted/80">Platform</p>
          )}
          <div className={cn("flex items-center gap-0.5", !wide && "flex-col")}>
            {[
              { id: "home" as Page, label: "Home", icon: Compass },
              { id: "learn" as Page, label: "Learn", icon: GraduationCap },
              { id: "create" as Page, label: "Create", icon: Shapes },
              { id: "library" as Page, label: "Library", icon: LayoutGrid },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => go(p.id)}
                title={collapsed ? p.label : undefined}
                aria-label={`Open ${p.label}`}
                className={cn(
                  "ring-focus flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-primary",
                  collapsed && "xl:size-8 xl:flex-none"
                )}
              >
                <p.icon className="size-3.5" />
                {wide && <span>{p.label}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* account + resources */}
        <div className={cn("flex-none border-t border-border p-2.5", collapsed && "xl:px-2")}>
          <button
            onClick={() => go("profile")}
            title={collapsed ? "Account settings" : undefined}
            className={cn(
              "ring-focus mb-1.5 flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-surface-2",
              collapsed && "xl:justify-center xl:px-0"
            )}
          >
            <span className="relative flex size-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#8b5cf6]/35 to-[#22d3ee]/20 text-[11px] font-semibold text-[#e8e3ff] ring-1 ring-white/10">
              {initials(profile) || <UserRound className="size-3.5" />}
              <span className="absolute -bottom-px -right-px size-2 rounded-full border-2 border-sidebar bg-accent-2" />
            </span>
            {wide && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-primary">{profile.name || "Your account"}</span>
                <span className="block truncate text-[10.5px] text-muted">Local workspace</span>
              </span>
            )}
            {wide && <ChevronRight className="size-4 flex-none text-muted" />}
          </button>

          {wide ? (
            <div className="space-y-px">
              {[
                { label: "Account settings", icon: Settings2, action: () => { go("settings"); onCloseMobile(); } },
                { label: "AI preferences", icon: SlidersHorizontal, action: () => { onPreferences(); onCloseMobile(); } },
                { label: "Help & documentation", icon: LifeBuoy, action: () => { onHelp(); onCloseMobile(); } },
              ].map((row) => (
                <button
                  key={row.label}
                  onClick={row.action}
                  className="ring-focus flex h-7 w-full items-center gap-2 rounded-md px-2 text-[11.5px] text-muted transition-colors hover:bg-surface-2 hover:text-primary"
                >
                  <row.icon className="size-3.5 flex-none" />
                  <span className="flex-1 text-left">{row.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="hidden flex-col items-center gap-1 xl:flex">
              <button onClick={onPreferences} aria-label="AI preferences" title="AI preferences" className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary">
                <SlidersHorizontal className="size-4" />
              </button>
              <button onClick={onHelp} aria-label="Help & documentation" title="Help & documentation" className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary">
                <LifeBuoy className="size-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
