import { useMemo, useState } from "react";
import { ArrowRight, Code2, FileText, ListChecks, Pin, Plus, Search, StickyNote, Tag, Trash2, Workflow, X } from "lucide-react";
import { Badge, Button } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { useToast } from "../context/ToastContext";
import { addLibraryItem, conversations, diagrams, library, relTime } from "../lib/store";
import type { LibraryItem } from "../lib/store";
import type { Page } from "../lib/nav";
import { cn } from "../utils/cn";

type Filter = "all" | "pinned" | "note" | "response" | "snippet" | "exercise" | "diagram";
const FILTERS: { id: Filter; label: string; icon: typeof Pin }[] = [
  { id: "all", label: "All", icon: FileText },
  { id: "pinned", label: "Pinned", icon: Pin },
  { id: "note", label: "Notes", icon: StickyNote },
  { id: "snippet", label: "Snippets", icon: Code2 },
  { id: "exercise", label: "Exercises", icon: ListChecks },
  { id: "diagram", label: "Diagrams", icon: Workflow },
];

type Row = { id: string; kind: Filter; title: string; content: string; tags: string[]; collection?: string; pinned: boolean; updatedAt: number; item?: LibraryItem; diagramId?: string };

export function Library({ onNavigate }: { onNavigate: (p: Page, arg?: string) => void }) {
  const items = library.use();
  const diags = diagrams.use();
  const convs = conversations.use();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "old" | "title">("new");
  const [collection, setCollection] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows: Row[] = useMemo(
    () => [
      ...items.map((i) => ({ id: i.id, kind: i.kind as Filter, title: i.title, content: i.content, tags: i.tags, collection: i.collection, pinned: i.pinned, updatedAt: i.updatedAt, item: i })),
      ...diags.map((d) => ({ id: d.id, kind: "diagram" as Filter, title: d.title, content: `${d.nodes.length} nodes · ${d.edges.length} connections · v${d.version}\n\n${d.nodes.map((n) => `- **${n.label}** — ${n.detail}`).join("\n")}`, tags: [d.type], pinned: false, updatedAt: d.updatedAt, diagramId: d.id })),
    ],
    [items, diags]
  );
  const collections = Array.from(new Set(items.map((i) => i.collection).filter(Boolean))) as string[];

  const visible = rows
    .filter((r) => (filter === "all" ? true : filter === "pinned" ? r.pinned : r.kind === filter))
    .filter((r) => !collection || r.collection === collection)
    .filter((r) => {
      const s = q.toLowerCase();
      return !s || r.title.toLowerCase().includes(s) || r.content.toLowerCase().includes(s) || r.tags.some((t) => t.toLowerCase().includes(s));
    })
    .sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title) : sort === "old" ? a.updatedAt - b.updatedAt : b.updatedAt - a.updatedAt));

  const open = rows.find((r) => r.id === openId);
  const patch = (id: string, p: Partial<LibraryItem>) => library.set((prev) => prev.map((i) => (i.id === id ? { ...i, ...p, updatedAt: Date.now() } : i)));

  const remove = (r: Row) => {
    if (r.item) {
      const snap = r.item;
      library.set((p) => p.filter((i) => i.id !== r.id));
      toast({ title: "Deleted", action: { label: "Undo", onClick: () => library.set((p) => [snap, ...p]) } });
    } else if (r.diagramId) {
      const snap = diags.find((d) => d.id === r.diagramId)!;
      diagrams.set((p) => p.filter((d) => d.id !== r.diagramId));
      toast({ title: "Diagram deleted", action: { label: "Undo", onClick: () => diagrams.set((p) => [snap, ...p]) } });
    }
    setOpenId(null);
  };

  const continueFrom = (r: Row) => {
    if (r.diagramId) return onNavigate("visualise", `open:${r.diagramId}`);
    const cid = r.item?.source?.conversationId;
    if (cid && convs.some((c) => c.id === cid)) return onNavigate("chat", cid);
    if (r.item?.source?.projectId) return onNavigate("code", r.item.source.projectId);
    toast({ title: "Original source no longer exists", detail: "The item itself is still saved here." });
  };

  const newNote = () => {
    const it = addLibraryItem({ kind: "note", title: "Untitled note", content: "" });
    if (it) setOpenId(it.id);
  };

  return (
    <div className="mx-auto w-full max-w-[1080px] px-5 pb-20 pt-9 md:px-8">
      <header className="animate-fade-up mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[38px] leading-[1.08] text-primary">Library</h1>
          <p className="mt-2 text-[14.5px] text-secondary">Learning material worth keeping — not another chat history.</p>
        </div>
        <Button variant="primary" onClick={newNote}><Plus className="size-3.5" />New note</Button>
      </header>

      <div className="animate-fade-up mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, content and tags" aria-label="Search library" className="h-9 w-full rounded-md border border-strong bg-surface pl-8 pr-3 text-[13px] text-primary outline-none focus:border-accent" />
        </div>
        {collections.length > 0 && (
          <select value={collection} onChange={(e) => setCollection(e.target.value)} aria-label="Collection" className="h-9 rounded-md border border-strong bg-surface px-2 text-[12.5px] text-secondary">
            <option value="">All collections</option>
            {collections.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort" className="h-9 rounded-md border border-strong bg-surface px-2 text-[12.5px] text-secondary">
          <option value="new">Newest</option>
          <option value="old">Oldest</option>
          <option value="title">Title</option>
        </select>
      </div>

      <div className="animate-fade-up mb-5 flex gap-1 overflow-x-auto border-b border-border no-scrollbar">
        {FILTERS.map((f) => {
          const n = f.id === "all" ? rows.length : f.id === "pinned" ? rows.filter((r) => r.pinned).length : rows.filter((r) => r.kind === f.id).length;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} className={cn("relative flex flex-none items-center gap-1.5 px-3 pb-2.5 pt-1 text-[13px] font-medium", filter === f.id ? "text-primary" : "text-muted hover:text-secondary")}>
              <f.icon className="size-3.5" />{f.label}<span className="font-mono text-[11px] text-muted">{n}</span>
              {filter === f.id && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center">
              <p className="font-display text-[22px] text-primary">{rows.length ? "Nothing matches" : "Your library is empty"}</p>
              <p className="mt-1 text-[13px] text-secondary">{rows.length ? "Try another filter or search." : "Save or pin responses in a conversation, save diagrams, or write a note."}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              {visible.map((r, i) => {
                const F = FILTERS.find((f) => f.id === r.kind) ?? FILTERS[0];
                return (
                  <button key={r.id} onClick={() => setOpenId(r.id)} className={cn("group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors", i && "border-t border-border", openId === r.id ? "bg-surface-2" : "hover:bg-surface-2/60")}>
                    <F.icon className="mt-0.5 size-3.5 flex-none text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-medium text-primary">{r.title}</span>
                        {r.pinned && <Pin className="size-3 flex-none text-accent" />}
                      </span>
                      <span className="mt-0.5 line-clamp-1 text-[12px] text-muted">{r.content.replace(/[#*`>]/g, "").slice(0, 160) || "Empty"}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="text-[11px] text-muted">{relTime(r.updatedAt)}</span>
                        {r.collection && <Badge tone="accent">{r.collection}</Badge>}
                        {r.tags.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {open && (
          <aside className="animate-slide-in-right h-fit overflow-hidden rounded-xl border border-border bg-surface lg:sticky lg:top-4">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              {open.item ? (
                <input value={open.title} onChange={(e) => patch(open.id, { title: e.target.value })} aria-label="Title" className="min-w-0 flex-1 bg-transparent font-display text-[18px] text-primary outline-none" />
              ) : (
                <span className="min-w-0 flex-1 truncate font-display text-[18px] text-primary">{open.title}</span>
              )}
              <button aria-label="Close" onClick={() => setOpenId(null)} className="text-muted hover:text-primary"><X className="size-4" /></button>
            </div>
            <div className="max-h-[420px] overflow-y-auto px-4 py-3 text-[13px]">
              {open.item?.kind === "note" ? (
                <textarea value={open.content} onChange={(e) => patch(open.id, { content: e.target.value })} rows={12} placeholder="Write in Markdown…" aria-label="Note content" className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 font-mono text-[12.5px] leading-[20px] text-primary outline-none focus:border-accent" />
              ) : (
                <Markdown content={open.content} />
              )}
            </div>
            {open.item && (
              <div className="space-y-2 border-t border-border px-4 py-3">
                <div className="flex flex-wrap items-center gap-1">
                  <Tag className="size-3 text-muted" />
                  {open.tags.map((t) => (
                    <button key={t} onClick={() => patch(open.id, { tags: open.tags.filter((x) => x !== t) })} className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface-2 px-1.5 py-px text-[11px] text-secondary hover:border-danger/50">
                      {t}<X className="size-2.5" />
                    </button>
                  ))}
                  <input
                    placeholder="add tag"
                    aria-label="Add tag"
                    onKeyDown={(e) => { const v = e.currentTarget.value.trim(); if (e.key === "Enter" && v && !open.tags.includes(v)) { patch(open.id, { tags: [...open.tags, v] }); e.currentTarget.value = ""; } }}
                    className="h-6 w-20 bg-transparent text-[11.5px] text-primary outline-none placeholder:text-muted"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] text-muted">Collection</span>
                  <input defaultValue={open.collection ?? ""} onBlur={(e) => patch(open.id, { collection: e.target.value.trim() || undefined })} placeholder="e.g. Recursion" aria-label="Collection" className="h-7 flex-1 rounded-md border border-border bg-surface px-2 text-[12px] text-primary outline-none focus:border-accent" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] text-muted">Type</span>
                  <select value={open.item.kind} onChange={(e) => patch(open.id, { kind: e.target.value as LibraryItem["kind"] })} className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12px] text-secondary">
                    <option value="note">Note</option><option value="response">Response</option><option value="snippet">Snippet</option><option value="exercise">Exercise</option>
                  </select>
                  <label className="ml-auto flex items-center gap-1.5 text-[12px] text-secondary">
                    <input type="checkbox" checked={open.pinned} onChange={(e) => patch(open.id, { pinned: e.target.checked })} /> Pinned
                  </label>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
              {(open.diagramId || open.item?.source) && <Button size="sm" variant="primary" onClick={() => continueFrom(open)}>Continue learning <ArrowRight className="size-3" /></Button>}
              <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(open.content).then(() => toast({ title: "Copied" }), () => toast({ title: "Clipboard unavailable" }))}>Copy</Button>
              <Button size="sm" variant="danger" className="ml-auto" onClick={() => remove(open)}><Trash2 className="size-3" />Delete</Button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
