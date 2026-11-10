import { useState } from "react";
import JSZip from "jszip";
import { Archive, ArchiveRestore, ArrowRight, Code2, Copy, Download, Hammer, Pencil, Plus, Trash2, Workflow } from "lucide-react";
import { Badge, Button } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { diagrams, newProject, patchProject, projects, relTime, uid } from "../lib/store";
import type { Project } from "../lib/store";
import type { Page } from "../lib/nav";
import { cn } from "../utils/cn";

const TYPES: { id: Project["type"]; label: string; desc: string }[] = [
  { id: "web", label: "Website", desc: "HTML, CSS & JS with live preview" },
  { id: "python", label: "Python", desc: "Scripts, data, automation" },
  { id: "javascript", label: "JavaScript", desc: "Logic with a built-in test runner" },
  { id: "other", label: "Other", desc: "Notes, plans, anything else" },
];

export async function exportProject(p: Project) {
  const zip = new JSZip();
  p.files.forEach((f) => zip.file(f.path, f.content));
  if (p.requirements) zip.file("REQUIREMENTS.md", p.requirements);
  if (p.notes) zip.file("NOTES.md", p.notes);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
  a.download = `${p.name.replace(/\W+/g, "-").toLowerCase() || "project"}.zip`;
  a.click();
}

export function Create({ onNavigate }: { onNavigate: (p: Page, arg?: string) => void }) {
  const all = projects.use();
  const diags = diagrams.use();
  const { toast } = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState<Project["type"]>("web");

  const list = all.filter((p) => (showArchived ? p.status === "archived" : p.status !== "archived")).sort((a, b) => b.updatedAt - a.updatedAt);

  const create = () => {
    if (!name.trim()) return;
    const p = newProject({ name: name.trim(), type, description: desc.trim() });
    setCreating(false);
    setName("");
    setDesc("");
    onNavigate("project", p.id);
  };

  const remove = (p: Project) => {
    projects.set((prev) => prev.filter((x) => x.id !== p.id));
    toast({ title: `Deleted ${p.name}`, action: { label: "Undo", onClick: () => projects.set((prev) => [p, ...prev]) } });
  };

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 pb-20 pt-9 md:px-8">
      <header className="animate-fade-up mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[38px] leading-[1.08] text-primary">Create</h1>
          <p className="mt-2 text-[14.5px] text-secondary">Your projects and visual work, saved on this device.</p>
        </div>
        <Button variant="primary" size="lg" onClick={() => setCreating(true)}><Plus className="size-4" />New project</Button>
      </header>

      <div className="mb-8 grid gap-2 sm:grid-cols-3">
        {[
          { icon: Hammer, title: "Build with Lumen", desc: "Idea → plan → working project", run: () => setCreating(true) },
          { icon: Code2, title: "Code with Lumen", desc: "Open the editor and runner", run: () => onNavigate("code") },
          { icon: Workflow, title: "Visualise with Lumen", desc: `${diags.length} saved diagram${diags.length === 1 ? "" : "s"}`, run: () => onNavigate("visualise") },
        ].map((t) => (
          <button key={t.title} onClick={t.run} className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3 text-left transition-all hover:-translate-y-px hover:border-strong">
            <t.icon className="size-4 flex-none text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-primary">{t.title}</span>
              <span className="block truncate text-[12px] text-muted">{t.desc}</span>
            </span>
            <ArrowRight className="size-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>

      {creating && (
        <div className="animate-scale-in mb-8 rounded-xl border border-accent-line bg-surface p-5">
          <h2 className="font-display text-[22px] text-primary">New project</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Project name" aria-label="Project name" className="h-10 rounded-md border border-strong bg-surface px-3 text-[14px] text-primary outline-none focus:border-accent" />
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What will it do? (optional)" aria-label="Description" className="h-10 rounded-md border border-strong bg-surface px-3 text-[14px] text-primary outline-none focus:border-accent" />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {TYPES.map((t) => (
              <button key={t.id} onClick={() => setType(t.id)} className={cn("rounded-lg border px-3 py-2.5 text-left transition-colors", type === t.id ? "border-accent bg-accent-soft" : "border-border hover:border-strong")}>
                <span className="block text-[13px] font-medium text-primary">{t.label}</span>
                <span className="block text-[11.5px] text-muted">{t.desc}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" disabled={!name.trim()} onClick={create}>Create project</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="mb-2 flex items-center gap-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{showArchived ? "Archived" : "Projects"}</p>
        <span className="font-mono text-[10.5px] text-muted">{list.length}</span>
        <span className="h-px flex-1 bg-border" />
        <button onClick={() => setShowArchived((v) => !v)} className="text-[12px] text-muted hover:text-primary">{showArchived ? "Show active" : "Show archived"}</button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center">
          <p className="font-display text-[22px] text-primary">{showArchived ? "No archived projects" : "No projects yet"}</p>
          {!showArchived && <p className="mt-1 text-[13px] text-secondary">Start one from an idea — Lumen will help you plan and build it.</p>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {list.map((p, i) => {
            const done = p.tasks.filter((t) => t.done).length;
            return (
              <div key={p.id} className={cn("group flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2/60", i && "border-t border-border")}>
                <button onClick={() => onNavigate("project", p.id)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-primary">{p.name}</span>
                    <Badge>{TYPES.find((t) => t.id === p.type)?.label}</Badge>
                    {p.status === "complete" && <Badge tone="mint">Complete</Badge>}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted">
                    {p.description || "No description"} · {p.files.length} files{p.tasks.length ? ` · ${done}/${p.tasks.length} tasks` : ""} · edited {relTime(p.updatedAt)} · created {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                </button>
                <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                  <Ic label="Open in editor" onClick={() => onNavigate("code", p.id)}><Code2 className="size-3.5" /></Ic>
                  <Ic label="Rename" onClick={() => { const n = window.prompt("Rename project", p.name)?.trim(); if (n) patchProject(p.id, { name: n }); }}><Pencil className="size-3.5" /></Ic>
                  <Ic label="Duplicate" onClick={() => { projects.set((prev) => [{ ...p, id: uid(), name: `${p.name} (copy)`, versions: [], createdAt: Date.now(), updatedAt: Date.now(), conversationIds: [] }, ...prev]); toast({ title: "Duplicated", tone: "success" }); }}><Copy className="size-3.5" /></Ic>
                  <Ic label="Export ZIP" onClick={() => exportProject(p)}><Download className="size-3.5" /></Ic>
                  <Ic label={p.status === "archived" ? "Unarchive" : "Archive"} onClick={() => patchProject(p.id, { status: p.status === "archived" ? "active" : "archived" })}>{p.status === "archived" ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}</Ic>
                  <Ic label="Delete" onClick={() => remove(p)}><Trash2 className="size-3.5" /></Ic>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Ic({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return <button title={label} aria-label={label} onClick={onClick} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-primary">{children}</button>;
}
