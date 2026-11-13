import { useState } from "react";
import {
  Archive, ChevronsLeft, ChevronsRight, Compass, FolderKanban, GraduationCap, LayoutGrid, LifeBuoy,
  MoreHorizontal, PenLine, Pencil, Pin, PinOff, Search, Settings2, Shapes, Sparkles, Trash2, UserRound, X,
} from "lucide-react";
import { cn } from "../utils/cn";
import { LumenMark } from "./LumenMark";
import { useProfile } from "../context/ProfileContext";
import { useToast } from "../context/ToastContext";
import { conversations, patchConversation, projects } from "../lib/store";
import type { Conversation } from "../lib/store";
import { modeMeta } from "../lib/modes";
import { initials } from "../lib/profile";
import type { Page } from "../lib/nav";

const MAIN = [
  { id: "ai" as Page, label: "CodeQuest AI", icon: Sparkles },
  { id: "home" as Page, label: "Home", icon: Compass },
  { id: "learn" as Page, label: "Learn", icon: GraduationCap },
  { id: "create" as Page, label: "Create", icon: Shapes },
  { id: "library" as Page, label: "Library", icon: LayoutGrid },
];

export function Sidebar({
  page, arg, onNavigate, collapsed, onToggleCollapse, mobileOpen, onCloseMobile, onSearch, onNewChat, onHelp,
}: {
  page: Page;
  arg?: string;
  onNavigate: (p: Page, arg?: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSearch: () => void;
  onNewChat: () => void;
  onHelp: () => void;
}) {
  const { profile } = useProfile();
  const convs = conversations.use();
  const projs = projects.use();
  const { toast } = useToast();
  const [menu, setMenu] = useState<string | null>(null);
  const go = (p: Page, a?: string) => { onNavigate(p, a); onCloseMobile(); };

  const live = convs.filter((c) => !c.archived && c.messages.length > 0).sort((a, b) => b.updatedAt - a.updatedAt);
  const pinned = live.filter((c) => c.pinned);
  const recent = live.filter((c) => !c.pinned).slice(0, 12);
  const current = projs.filter((p) => p.status === "active").sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const wide = !collapsed;

  const remove = (c: Conversation) => {
    conversations.set((p) => p.filter((x) => x.id !== c.id));
    toast({ title: "Conversation deleted", action: { label: "Undo", onClick: () => conversations.set((p) => [c, ...p]) } });
    if (page === "chat" && arg === c.id) go("home");
  };

  const ConvRow = ({ c }: { c: Conversation }) => {
    const M = modeMeta(c.mode);
    const active = page === "chat" && arg === c.id;
    return (
      <div className={cn("group relative flex h-8 items-center rounded-md text-[12.5px]", active ? "bg-surface-2 text-primary" : "text-secondary hover:bg-surface-2/60 hover:text-primary")}>
        <button onClick={() => go("chat", c.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 text-left" title={c.title}>
          <M.icon className="size-3.5 flex-none text-muted" />
          <span className="truncate">{c.title}</span>
        </button>
        <button aria-label="Conversation actions" onClick={() => setMenu(menu === c.id ? null : c.id)} className="mr-1 flex size-6 flex-none items-center justify-center rounded text-muted opacity-0 hover:text-primary group-hover:opacity-100 focus:opacity-100">
          <MoreHorizontal className="size-3.5" />
        </button>
        {menu === c.id && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div className="animate-scale-in absolute right-0 top-8 z-50 w-40 rounded-lg border border-strong bg-surface p-1 shadow-float">
              {[
                { l: "Rename", i: Pencil, f: () => { const t = window.prompt("Rename conversation", c.title)?.trim(); if (t) patchConversation(c.id, { title: t }); } },
                { l: c.pinned ? "Unpin" : "Pin", i: c.pinned ? PinOff : Pin, f: () => patchConversation(c.id, { pinned: !c.pinned }) },
                { l: "Archive", i: Archive, f: () => { patchConversation(c.id, { archived: true }); toast({ title: "Archived", action: { label: "Undo", onClick: () => patchConversation(c.id, { archived: false }) } }); } },
                { l: "Delete", i: Trash2, f: () => remove(c), danger: true },
              ].map((x) => (
                <button key={x.l} onClick={() => { x.f(); setMenu(null); }} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-surface-2", x.danger ? "text-danger" : "text-secondary hover:text-primary")}>
                  <x.i className="size-3.5" />{x.l}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <div onClick={onCloseMobile} className={cn("fixed inset-0 z-30 bg-black/55 transition-opacity md:hidden", mobileOpen ? "opacity-100" : "pointer-events-none opacity-0")} />
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-sidebar transition-[width,transform] duration-300 md:static md:translate-x-0",
        collapsed ? "w-[256px] md:w-[60px]" : "w-[256px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* brand */}
        <div className="flex h-14 flex-none items-center gap-2.5 px-3.5">
          <button onClick={() => go("home")} className="ring-focus flex min-w-0 items-center gap-2.5 rounded-md">
            <span className="flex size-7 flex-none items-center justify-center rounded-md bg-accent-soft text-accent ring-1 ring-accent-line"><LumenMark className="size-4" /></span>
            {(wide || mobileOpen) && (
              <span className="min-w-0 text-left leading-none">
                <span className="block font-display text-[19px] text-primary">Lumen</span>
                <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted">by CodeQuest</span>
              </span>
            )}
          </button>
          <span className="flex-1" />
          <button onClick={onCloseMobile} className="rounded-md p-1.5 text-muted hover:bg-surface-2 md:hidden" aria-label="Close navigation"><X className="size-4" /></button>
          {wide && <button onClick={onToggleCollapse} className="hidden rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-primary md:block" aria-label="Collapse sidebar" title="Collapse (⌘\\)"><ChevronsLeft className="size-4" /></button>}
        </div>
        {collapsed && <button onClick={onToggleCollapse} className="mx-auto mb-1 hidden rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-primary md:block" aria-label="Expand sidebar"><ChevronsRight className="size-4" /></button>}

        <div className="flex-none space-y-1 px-2.5 pb-2">
          <SideBtn icon={PenLine} label="New conversation" kbd="⌘N" collapsed={collapsed} onClick={() => { onNewChat(); onCloseMobile(); }} primary />
          <SideBtn icon={Search} label="Search" kbd="⌘K" collapsed={collapsed} onClick={onSearch} />
        </div>

        <nav data-tour="nav" className="flex-none space-y-0.5 px-2.5 pb-2" aria-label="Primary">
          {MAIN.map((m) => {
            const active = page === m.id || (m.id === "create" && ["code", "visualise", "project"].includes(page));
            return (
              <button key={m.id} onClick={() => go(m.id)} title={collapsed ? m.label : undefined} aria-current={active ? "page" : undefined}
                className={cn("ring-focus relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors", collapsed && "md:justify-center md:px-0", active ? "bg-surface-2 text-primary" : "text-secondary hover:bg-surface-2/60 hover:text-primary")}>
                {active && <span className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-accent" />}
                <m.icon className={cn("size-4 flex-none", active && "text-accent")} />
                {(wide || mobileOpen) && m.label}
              </button>
            );
          })}
        </nav>

        <div className="mx-3.5 flex-none border-t border-border" />

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
          {(wide || mobileOpen) ? (
            <>
              {current && (
                <>
                  <Label>Current project</Label>
                  <button onClick={() => go("project", current.id)} className={cn("mb-3 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px]", page === "project" && arg === current.id ? "bg-surface-2 text-primary" : "text-secondary hover:bg-surface-2/60 hover:text-primary")}>
                    <FolderKanban className="size-3.5 flex-none text-accent" /><span className="truncate">{current.name}</span>
                  </button>
                </>
              )}
              {pinned.length > 0 && (<><Label>Pinned</Label><div className="mb-3">{pinned.map((c) => <ConvRow key={c.id} c={c} />)}</div></>)}
              <Label>Recent</Label>
              {recent.length === 0 ? (
                <p className="mx-1 rounded-md border border-dashed border-border px-2.5 py-2.5 text-[11.5px] leading-[17px] text-muted">Conversations you start will appear here.</p>
              ) : recent.map((c) => <ConvRow key={c.id} c={c} />)}
            </>
          ) : null}
        </div>

        <div className="flex-none space-y-0.5 border-t border-border p-2.5">
          <button onClick={() => go("profile")} title="Learning profile" className={cn("ring-focus flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-surface-2", collapsed && "md:justify-center md:px-0", page === "profile" && "bg-surface-2")}>
            <span className="flex size-7 flex-none items-center justify-center rounded-full border border-border bg-surface-2 text-[11px] font-semibold text-secondary">{initials(profile)}</span>
            {(wide || mobileOpen) && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-primary">{profile.name || "Learning profile"}</span>
                <span className="flex items-center gap-1 text-[11px] text-muted"><UserRound className="size-3" />Learning profile</span>
              </span>
            )}
          </button>
          <SideBtn icon={Settings2} label="Preferences" collapsed={collapsed} onClick={() => go("settings")} active={page === "settings"} />
          <SideBtn icon={LifeBuoy} label="Help & support" collapsed={collapsed} onClick={onHelp} />
        </div>
      </aside>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="px-2 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{children}</p>;
}

function SideBtn({ icon: Icon, label, kbd, collapsed, onClick, primary, active }: { icon: typeof Pin; label: string; kbd?: string; collapsed: boolean; onClick: () => void; primary?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} title={collapsed ? label : undefined}
      className={cn("ring-focus flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[12.5px] transition-colors", collapsed && "md:justify-center md:px-0",
        primary ? "border border-strong bg-surface font-medium text-primary hover:bg-surface-2" : active ? "bg-surface-2 text-primary" : "text-secondary hover:bg-surface-2 hover:text-primary")}>
      <Icon className={cn("size-4 flex-none", primary && "text-accent")} />
      <span className={cn("flex-1 text-left", collapsed && "md:hidden")}>{label}</span>
      {kbd && <kbd className={cn(collapsed && "md:hidden")}>{kbd}</kbd>}
    </button>
  );
}
