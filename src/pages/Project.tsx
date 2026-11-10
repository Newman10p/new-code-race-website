import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Code2, Download, FileText, Loader2, MessageSquare, Plus, Trash2, Wand2 } from "lucide-react";
import { Badge, Button, Progress } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { useToast } from "../context/ToastContext";
import { useJourney } from "../context/JourneyContext";
import { useTutor } from "../hooks/useTutor";
import { conversations, newConversation, patchProject, projects, relTime, uid } from "../lib/store";
import type { Project as P } from "../lib/store";
import { exportProject } from "./Create";
import type { Page } from "../lib/nav";
import { cn } from "../utils/cn";

const STAGES = ["Describe", "Clarify", "Plan", "Approve", "Build", "Test", "Save"];

export function Project({ id, onNavigate }: { id?: string; onNavigate: (p: Page, arg?: string) => void }) {
  const all = projects.use();
  const convs = conversations.use();
  const p = all.find((x) => x.id === id);
  const { send, isBusy } = useTutor();
  const { toast } = useToast();
  const { mark } = useJourney();
  const [newTask, setNewTask] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "failed">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draft, setDraft] = useState({ requirements: p?.requirements ?? "", notes: p?.notes ?? "" });

  useEffect(() => setDraft({ requirements: p?.requirements ?? "", notes: p?.notes ?? "" }), [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return <div className="p-10 text-center text-[13px] text-muted">Project not found. <button className="text-accent" onClick={() => onNavigate("create")}>Back to Create</button></div>;

  const conv = convs.find((c) => c.projectId === p.id && c.mode === "build");
  const lastA = conv ? [...conv.messages].reverse().find((m) => m.role === "assistant" && m.status === "done") : undefined;
  const busy = conv ? isBusy(conv.id) : false;
  const planTasks = lastA ? [...lastA.content.matchAll(/^\s*[-*]\s*\[\s?\]\s+(.+)$/gm)].map((m) => m[1].trim()) : [];
  const done = p.tasks.filter((t) => t.done).length;

  const stage = p.status === "complete" ? 6 : p.tasks.length ? (done === p.tasks.length ? 5 : 4) : planTasks.length ? 3 : conv?.messages.length ? 1 : p.requirements ? 1 : 0;

  const saveField = (k: "requirements" | "notes", v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaveState(patchProject(p.id, { [k]: v } as Partial<P>) ? "saved" : "failed"), 500);
  };

  const ensureConv = () => {
    if (conv) return conv;
    const c = newConversation("build", { title: `${p.name} · build`, projectId: p.id });
    patchProject(p.id, (x) => ({ conversationIds: [...x.conversationIds, c.id] }));
    return c;
  };

  const ctx = () =>
    `PROJECT: ${p.name} (${p.type})\nDescription: ${p.description || "—"}\nRequirements:\n${draft.requirements || "(none yet)"}\nFiles: ${p.files.map((f) => f.path).join(", ")}\nTasks: ${p.tasks.map((t) => `[${t.done ? "x" : " "}] ${t.text}`).join("; ") || "(no plan yet)"}`;

  const ask = (text: string) => {
    const c = ensureConv();
    send(c.id, text, undefined, ctx());
  };

  const approve = () => {
    const ok = patchProject(p.id, { tasks: planTasks.map((t) => ({ id: uid(), text: t, done: false })) });
    toast(ok ? { title: `Plan approved · ${planTasks.length} tasks`, tone: "success" } : { title: "Couldn't save the plan" });
  };

  const toggleTask = (tid: string) => {
    patchProject(p.id, (x) => ({ tasks: x.tasks.map((t) => (t.id === tid ? { ...t, done: !t.done } : t)) }));
    mark("completed_step");
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pb-20 pt-8 md:px-8">
      <header className="animate-fade-up mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="accent">Build with Lumen</Badge>
            <Badge>{p.type}</Badge>
            <span className="text-[11.5px] text-muted">Edited {relTime(p.updatedAt)}</span>
            <span className={cn("text-[11.5px]", saveState === "failed" ? "text-danger" : "text-muted")}>· {saveState === "saved" ? "Saved on this device" : "Save failed"}</span>
          </div>
          <input
            value={p.name}
            onChange={(e) => patchProject(p.id, { name: e.target.value })}
            aria-label="Project name"
            className="w-full bg-transparent font-display text-[36px] leading-[1.1] text-primary outline-none"
          />
          <input value={p.description} onChange={(e) => patchProject(p.id, { description: e.target.value })} placeholder="Describe the idea in a sentence" aria-label="Description" className="mt-1 w-full bg-transparent text-[14.5px] text-secondary outline-none placeholder:text-muted" />
        </div>
        <div className="flex flex-none gap-2">
          <Button onClick={() => exportProject(p)}><Download className="size-3.5" />Export</Button>
          <Button variant="primary" onClick={() => onNavigate("code", p.id)}><Code2 className="size-3.5" />Open editor</Button>
        </div>
      </header>

      {/* workflow rail */}
      <ol className="animate-fade-up mb-7 flex gap-1 overflow-x-auto no-scrollbar" aria-label="Build workflow">
        {STAGES.map((s, i) => (
          <li key={s} className={cn("flex flex-1 flex-none items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] sm:flex-none", i < stage ? "border-border text-secondary" : i === stage ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-muted")}>
            {i < stage ? <Check className="size-3 text-accent-2" /> : <span className="font-mono text-[10.5px]">{i + 1}</span>}
            {s}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Section title="Requirements" hint="What must it do? Who is it for?">
            <textarea value={draft.requirements} onChange={(e) => saveField("requirements", e.target.value)} rows={5} placeholder={"- Users can…\n- It should…"} aria-label="Requirements" className="w-full resize-y rounded-md border border-strong bg-surface px-3 py-2.5 font-mono text-[12.5px] leading-[20px] text-primary outline-none focus:border-accent" />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => ask("Ask me the clarifying questions you need before planning this project. Keep it to the 3–5 that matter most.")}>Clarify requirements</Button>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => ask("Propose an implementation plan as a Markdown checklist (\"- [ ] task\"), 5–10 tasks, ordered. Briefly justify key decisions.")}><Wand2 className="size-3" />Propose plan</Button>
            </div>
          </Section>

          <Section title="Tasks" hint={p.tasks.length ? `${done}/${p.tasks.length} complete` : "Approve a plan or add tasks yourself"}>
            {p.tasks.length > 0 && <Progress value={(done / p.tasks.length) * 100} className="mb-3" tone={done === p.tasks.length ? "mint" : "accent"} />}
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {p.tasks.map((t, i) => (
                <div key={t.id} className={cn("group flex items-center gap-2.5 px-3 py-2", i && "border-t border-border")}>
                  <button onClick={() => toggleTask(t.id)} aria-label={t.done ? "Mark incomplete" : "Mark complete"} className={cn("flex size-4 flex-none items-center justify-center rounded border", t.done ? "border-accent-2 bg-accent-2 text-app" : "border-strong")}>
                    {t.done && <Check className="size-3" strokeWidth={3} />}
                  </button>
                  <span className={cn("min-w-0 flex-1 text-[13px]", t.done ? "text-muted line-through" : "text-primary")}>{t.text}</span>
                  {!t.done && <button onClick={() => ask(`Help me with this task: "${t.text}". Explain the approach first, then guide me.`)} className="text-[11.5px] text-accent opacity-0 group-hover:opacity-100">Work on it</button>}
                  <button aria-label="Delete task" onClick={() => patchProject(p.id, (x) => ({ tasks: x.tasks.filter((y) => y.id !== t.id) }))} className="text-muted opacity-0 hover:text-danger group-hover:opacity-100"><Trash2 className="size-3" /></button>
                </div>
              ))}
              <form onSubmit={(e) => { e.preventDefault(); if (!newTask.trim()) return; patchProject(p.id, (x) => ({ tasks: [...x.tasks, { id: uid(), text: newTask.trim(), done: false }] })); setNewTask(""); }} className={cn("flex items-center gap-2 px-3 py-1.5", p.tasks.length && "border-t border-border")}>
                <Plus className="size-3.5 text-muted" />
                <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task" aria-label="New task" className="h-7 flex-1 bg-transparent text-[13px] text-primary outline-none placeholder:text-muted" />
              </form>
            </div>
            {p.tasks.length > 0 && done === p.tasks.length && p.status !== "complete" && (
              <Button size="sm" variant="primary" className="mt-3" onClick={() => { patchProject(p.id, { status: "complete" }); toast({ title: "Project marked complete", tone: "success" }); }}><CheckCircle2 className="size-3.5" />Mark project complete</Button>
            )}
          </Section>

          <Section title="Files" hint={`${p.files.length} files`}>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {p.files.map((f, i) => (
                <button key={f.path} onClick={() => onNavigate("code", p.id)} className={cn("flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2", i && "border-t border-border")}>
                  <FileText className="size-3.5 text-muted" />
                  <span className="flex-1 truncate font-mono text-[12.5px] text-primary">{f.path}</span>
                  <span className="font-mono text-[11px] text-muted">{f.content.split("\n").length} lines</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-muted">{p.versions.length} saved version{p.versions.length === 1 ? "" : "s"} · manage history in the editor.</p>
          </Section>

          <Section title="Notes">
            <textarea value={draft.notes} onChange={(e) => saveField("notes", e.target.value)} rows={4} placeholder="Decisions, links, things to remember" aria-label="Project notes" className="w-full resize-y rounded-md border border-strong bg-surface px-3 py-2.5 text-[13px] leading-[20px] text-primary outline-none focus:border-accent" />
          </Section>
        </div>

        {/* Lumen build panel */}
        <aside className="h-fit rounded-xl border border-border bg-surface lg:sticky lg:top-4">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <MessageSquare className="size-3.5 text-accent" />
            <span className="text-[13px] font-medium text-primary">Lumen</span>
            {conv && <button onClick={() => onNavigate("chat", conv.id)} className="ml-auto text-[12px] text-accent">Full conversation →</button>}
          </div>
          <div className="max-h-[520px] overflow-y-auto p-4 text-[13px]">
            {!conv?.messages.length && <p className="text-[12.5px] leading-5 text-muted">Start with <strong className="font-medium text-secondary">Clarify requirements</strong> or <strong className="font-medium text-secondary">Propose plan</strong>. Lumen sees your requirements, files and tasks.</p>}
            {conv && (() => {
              const m = conv.messages[conv.messages.length - 1];
              if (!m || m.role !== "assistant") return busy ? <p className="flex items-center gap-2 text-[12px] text-secondary"><Loader2 className="size-3 spin" />Waiting for Lumen…</p> : null;
              return (
                <>
                  {m.status === "pending" && <p className="flex items-center gap-2 text-[12px] text-secondary"><Loader2 className="size-3 spin" />Waiting for Lumen…</p>}
                  {m.content && <Markdown content={m.content} streaming={m.status === "streaming"} />}
                  {m.status === "failed" && <p className="rounded-md border border-danger/35 bg-danger/[0.07] px-2.5 py-2 text-[12px] text-secondary">{m.error}</p>}
                </>
              );
            })()}
          </div>
          {planTasks.length > 0 && !busy && (
            <div className="border-t border-border p-3">
              <p className="mb-2 text-[12px] text-secondary">Lumen proposed {planTasks.length} tasks.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={approve}>{p.tasks.length ? "Replace tasks with this plan" : "Approve plan"}</Button>
                <Button size="sm" onClick={() => ask("Revise the plan: make it simpler and explain why each task matters.")}>Revise</Button>
              </div>
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget.elements.namedItem("q") as HTMLInputElement; if (f.value.trim()) { ask(f.value.trim()); f.value = ""; } }} className="border-t border-border p-2">
            <input name="q" disabled={busy} placeholder="Ask about this project…" aria-label="Ask Lumen about this project" className="h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px] text-primary outline-none focus:border-accent disabled:opacity-50" />
          </form>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="animate-fade-up">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{title}</h2>
        {hint && <span className="text-[11.5px] text-muted">· {hint}</span>}
      </div>
      {children}
    </section>
  );
}
