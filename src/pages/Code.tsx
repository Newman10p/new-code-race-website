import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html as htmlLang } from "@codemirror/lang-html";
import { css as cssLang } from "@codemirror/lang-css";
import { EditorView } from "@codemirror/view";
import { indentRange } from "@codemirror/language";
import { Group, Panel, Separator } from "react-resizable-panels";
import JSZip from "jszip";
import {
  AlertTriangle, Braces, CheckCircle2, Download, FilePlus2, FileText, FolderPlus, History, Loader2,
  Maximize2, Minimize2, Pencil, Play, Save, Search, Square, Trash2, X, XCircle,
} from "lucide-react";
import { Badge, Button, Segmented } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { useToast } from "../context/ToastContext";
import { useJourney } from "../context/JourneyContext";
import { useTutor } from "../hooks/useTutor";
import { conversations, newConversation, newProject, patchProject, projects, uid } from "../lib/store";
import type { Project, ProjectFile } from "../lib/store";
import { RUNNABLE, buildWebPreview, langOf, pythonStatus, runScript, stopRun } from "../lib/runner";
import type { LogLine, RunResult } from "../lib/runner";
import type { Page } from "../lib/nav";
import { cn } from "../utils/cn";

const editorTheme = EditorView.theme(
  {
    "&": { backgroundColor: "var(--code-bg)", color: "var(--code-text)" },
    ".cm-gutters": { backgroundColor: "var(--code-bg)", color: "var(--code-muted)", border: "none" },
    ".cm-activeLine": { backgroundColor: "var(--code-active)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--accent)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "rgba(77,156,255,0.28) !important" },
    ".cm-cursor": { borderLeftColor: "var(--accent)" },
    ".cm-panels": { backgroundColor: "var(--code-head)", color: "var(--code-text)", borderTop: "1px solid var(--code-line)" },
    ".cm-tooltip": { backgroundColor: "var(--code-head)", border: "1px solid var(--code-line)" },
    ".cm-foldPlaceholder": { backgroundColor: "var(--code-line)", border: "none", color: "var(--code-muted)" },
  },
  { dark: true }
);

function extFor(path: string) {
  switch (langOf(path)) {
    case "javascript": return [javascript({ jsx: true })];
    case "typescript": return [javascript({ typescript: true, jsx: path.endsWith("x") })];
    case "python": return [python()];
    case "html": return [htmlLang()];
    case "css": return [cssLang()];
    default: return [];
  }
}

const LUMEN_ACTIONS = [
  "Explain this function", "Find the error", "Optimise this code", "Add comments",
  "Convert this to Python", "Write test cases", "Explain the output", "Walk me through this line by line",
];

type SaveState = "saved" | "saving" | "failed";

export function Code({ projectId, onNavigate }: { projectId?: string; onNavigate: (p: Page, arg?: string) => void }) {
  const all = projects.use();
  const { toast } = useToast();
  const { mark } = useJourney();

  // resolve project: explicit → most recent active → create a real scratchpad
  const project = useMemo(() => all.find((p) => p.id === projectId) ?? all.find((p) => p.status === "active"), [all, projectId]);
  useEffect(() => {
    if (!project) newProject({ name: "Scratchpad", type: "javascript", description: "Your personal coding sandbox" });
  }, [project]);
  if (!project) return <div className="flex h-full items-center justify-center text-[13px] text-muted"><Loader2 className="mr-2 size-4 spin" />Creating your scratchpad…</div>;
  return <Workspace key={project.id} project={project} onNavigate={onNavigate} toast={toast} mark={mark} />;
}

function Workspace({ project, onNavigate, toast, mark }: { project: Project; onNavigate: (p: Page, arg?: string) => void; toast: ReturnType<typeof useToast>["toast"]; mark: ReturnType<typeof useJourney>["mark"] }) {
  const [open, setOpen] = useState<string[]>(() => (project.files[0] ? [project.files[0].path] : []));
  const [active, setActive] = useState<string | null>(project.files[0]?.path ?? null);
  const [save, setSave] = useState<SaveState>("saved");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [previewLogs, setPreviewLogs] = useState<LogLine[]>([]);
  const [tab, setTab] = useState<"console" | "tests" | "problems" | "preview" | "lumen">("console");
  const [focusMode, setFocusMode] = useState(false);
  const [filter, setFilter] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [mobile, setMobile] = useState<"files" | "editor" | "output">("editor");
  const [pyLoading, setPyLoading] = useState(false);
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Map<string, string>>(new Map());

  const file = project.files.find((f) => f.path === active) ?? null;
  const lang = file ? langOf(file.path) : "text";
  const isWeb = project.files.some((f) => f.path === "index.html");
  const webTarget = isWeb && (lang === "html" || lang === "css" || lang === "javascript" || lang === "typescript") && !file?.path.includes(".test.");
  const canRun = file && (RUNNABLE.includes(lang) || webTarget);

  /* ---------- autosave (honest) ---------- */
  const flush = useCallback(() => {
    if (!pending.current.size) return;
    const changes = new Map(pending.current);
    pending.current.clear();
    const ok = patchProject(project.id, (p) => ({ files: p.files.map((f) => (changes.has(f.path) ? { ...f, content: changes.get(f.path)! } : f)) }));
    setSave(ok ? "saved" : "failed");
    if (!ok) changes.forEach((v, k) => pending.current.set(k, v)); // keep for retry, never drop work
  }, [project.id]);

  const onChange = (val: string) => {
    if (!file) return;
    pending.current.set(file.path, val);
    setSave("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 600);
  };
  useEffect(() => () => flush(), [flush]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (pending.current.size) { flush(); e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [flush]);

  const snapshot = useCallback((label: string) => {
    flush();
    const p = projects.get().find((x) => x.id === project.id)!;
    const ok = patchProject(project.id, { versions: [{ id: uid(), label, at: Date.now(), files: p.files.map((f) => ({ ...f })) }, ...p.versions].slice(0, 30) });
    toast(ok ? { title: "Version saved", detail: label, tone: "success" } : { title: "Save failed", detail: "Browser storage is full. Export a ZIP to keep your work." });
  }, [flush, project.id, toast]);

  /* ---------- run ---------- */
  const doRun = useCallback(async () => {
    if (!file || running) return;
    flush();
    const fresh = projects.get().find((x) => x.id === project.id)!;
    mark("ran_code");
    if (webTarget) {
      setPreviewLogs([]);
      setPreviewDoc(buildWebPreview(fresh.files) + `<!-- ${Date.now()} -->`);
      setTab("preview");
      setMobile("output");
      return;
    }
    setRunning(true);
    setTab("console");
    setMobile("output");
    if (lang === "python" && pythonStatus() !== "ready") setPyLoading(true);
    const code = fresh.files.find((f) => f.path === file.path)?.content ?? "";
    const r = await runScript(code, lang);
    setPyLoading(false);
    setResult(r);
    setRunning(false);
    if (r.tests.length) setTab("tests");
  }, [file, running, flush, project.id, webTarget, lang, mark]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== previewRef.current?.contentWindow || !e.data?.__lumen || e.data.t !== "log") return;
      setPreviewLogs((p) => [...p.slice(-500), { stream: e.data.stream, text: e.data.text }]);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); snapshot(`Manual save · ${new Date().toLocaleTimeString()}`); }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void doRun(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [snapshot, doRun]);

  /* ---------- files ---------- */
  const openFile = (path: string) => {
    flush();
    setOpen((o) => (o.includes(path) ? o : [...o, path]));
    setActive(path);
    setMobile("editor");
  };
  const closeTab = (path: string) => {
    flush();
    setOpen((o) => {
      const n = o.filter((p) => p !== path);
      if (active === path) setActive(n[n.length - 1] ?? null);
      return n;
    });
  };
  const createFile = (folder = false) => {
    const name = window.prompt(folder ? "Folder name" : "File name (e.g. utils.js, src/app.py)");
    if (!name) return;
    const path = folder ? `${name.replace(/\/$/, "")}/README.md` : name.trim();
    if (!/^[\w\-./ ]+$/.test(path) || path.includes("..")) return toast({ title: "Invalid name", detail: "Use letters, numbers, - _ . and /" });
    if (project.files.some((f) => f.path === path)) return toast({ title: "A file with that name exists" });
    const ok = patchProject(project.id, (p) => ({ files: [...p.files, { path, content: folder ? `# ${name}\n` : "" }] }));
    if (ok) openFile(path);
  };
  const renameFile = (path: string) => {
    const next = window.prompt("Rename to", path)?.trim();
    if (!next || next === path) return;
    if (project.files.some((f) => f.path === next)) return toast({ title: "A file with that name exists" });
    flush();
    patchProject(project.id, (p) => ({ files: p.files.map((f) => (f.path === path ? { ...f, path: next } : f)) }));
    setOpen((o) => o.map((x) => (x === path ? next : x)));
    if (active === path) setActive(next);
  };
  const deleteFile = (path: string) => {
    flush();
    const snap = project.files.find((f) => f.path === path);
    if (!snap) return;
    patchProject(project.id, (p) => ({ files: p.files.filter((f) => f.path !== path) }));
    closeTab(path);
    toast({ title: `Deleted ${path}`, action: { label: "Undo", onClick: () => patchProject(project.id, (p) => ({ files: [...p.files, snap] })) } });
  };

  const reindent = () => {
    const view = cmRef.current?.view;
    if (!view) return;
    const changes = indentRange(view.state, 0, view.state.doc.length);
    if (changes.empty) return toast({ title: "Indentation already consistent" });
    view.dispatch({ changes });
    toast({ title: "Reindented", detail: "Applied the language's indentation rules." });
  };

  const resetFile = () => {
    if (!file) return;
    const v = project.versions.find((x) => x.files.some((f) => f.path === file.path));
    const prev = file.content;
    if (!v) return toast({ title: "No saved version of this file yet", detail: "Press ⌘S to save a version." });
    const content = v.files.find((f) => f.path === file.path)!.content;
    pending.current.delete(file.path);
    patchProject(project.id, (p) => ({ files: p.files.map((f) => (f.path === file.path ? { ...f, content } : f)) }));
    toast({ title: `Reset to "${v.label}"`, action: { label: "Undo", onClick: () => patchProject(project.id, (p) => ({ files: p.files.map((f) => (f.path === file.path ? { ...f, content: prev } : f)) })) } });
  };

  const exportZip = async () => {
    flush();
    const zip = new JSZip();
    projects.get().find((x) => x.id === project.id)!.files.forEach((f) => zip.file(f.path, f.content));
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name.replace(/\W+/g, "-").toLowerCase() || "project"}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const logs = webTarget ? previewLogs : result?.logs ?? [];
  const problems = logs.filter((l) => l.stream === "stderr");
  const lineOf = (t: string) => Number(t.match(/line (\d+)/i)?.[1] ?? t.match(/<anonymous>:(\d+)/)?.[1] ?? NaN);
  const jumpTo = (n: number) => {
    const view = cmRef.current?.view;
    if (!view || !Number.isFinite(n) || n < 1 || n > view.state.doc.lines) return;
    const line = view.state.doc.line(n);
    view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
    view.focus();
  };

  const visible = project.files.filter((f) => f.path.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => a.path.localeCompare(b.path));

  /* ---------- panels ---------- */
  const explorer = (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex items-center gap-1 border-b border-border px-2.5 py-2">
        <span className="flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted">Files</span>
        <IconBtn label="New file" onClick={() => createFile()}><FilePlus2 className="size-3.5" /></IconBtn>
        <IconBtn label="New folder" onClick={() => createFile(true)}><FolderPlus className="size-3.5" /></IconBtn>
        <IconBtn label="Version history" active={showHistory} onClick={() => setShowHistory((v) => !v)}><History className="size-3.5" /></IconBtn>
      </div>
      <div className="relative border-b border-border px-2 py-1.5">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-3 -translate-y-1/2 text-muted" />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search files" aria-label="Search files" className="h-7 w-full rounded-md border border-border bg-surface pl-6 pr-2 text-[12px] text-primary outline-none focus:border-accent" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {showHistory ? (
          <div className="space-y-0.5">
            {project.versions.length === 0 && <p className="px-2 py-3 text-[12px] text-muted">No versions yet. Press ⌘S or Save to create one.</p>}
            {project.versions.map((v) => (
              <div key={v.id} className="group rounded-md px-2 py-1.5 hover:bg-surface-2">
                <p className="truncate text-[12px] text-primary">{v.label}</p>
                <p className="flex items-center gap-2 text-[11px] text-muted">
                  {new Date(v.at).toLocaleString()} · {v.files.length} files
                  <button
                    onClick={() => {
                      const prev = projects.get().find((x) => x.id === project.id)!.files;
                      patchProject(project.id, { files: v.files.map((f) => ({ ...f })) });
                      toast({ title: "Version restored", action: { label: "Undo", onClick: () => patchProject(project.id, { files: prev }) } });
                    }}
                    className="ml-auto font-medium text-accent opacity-0 group-hover:opacity-100"
                  >
                    Restore
                  </button>
                </p>
              </div>
            ))}
          </div>
        ) : (
          visible.map((f) => {
            const depth = f.path.split("/").length - 1;
            return (
              <div key={f.path} className={cn("group flex items-center gap-1.5 rounded-md py-1 pr-1 text-[12.5px]", active === f.path ? "bg-surface-2 text-primary" : "text-secondary hover:bg-surface-2/60")} style={{ paddingLeft: 8 + depth * 10 }}>
                <button onClick={() => openFile(f.path)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                  <FileText className="size-3.5 flex-none text-muted" />
                  <span className="truncate">{f.path}</span>
                </button>
                <button aria-label={`Rename ${f.path}`} onClick={() => renameFile(f.path)} className="flex-none rounded p-0.5 text-muted opacity-0 hover:text-primary group-hover:opacity-100"><Pencil className="size-3" /></button>
                <button aria-label={`Delete ${f.path}`} onClick={() => deleteFile(f.path)} className="flex-none rounded p-0.5 text-muted opacity-0 hover:text-danger group-hover:opacity-100"><Trash2 className="size-3" /></button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const editor = (
    <div className="flex h-full min-h-0 flex-col bg-code-bg">
      <div className="flex flex-none items-end gap-px overflow-x-auto border-b border-code-line bg-code-head no-scrollbar">
        {open.map((p) => (
          <div key={p} className={cn("group flex flex-none items-center gap-1.5 border-r border-code-line px-3 py-2 font-mono text-[11.5px] transition-colors", p === active ? "bg-code-bg text-code" : "text-code-muted hover:text-code")}>
            <button onClick={() => setActive(p)}>{p.split("/").pop()}</button>
            <button aria-label={`Close ${p}`} onClick={() => closeTab(p)} className="opacity-50 hover:opacity-100"><X className="size-3" /></button>
          </div>
        ))}
      </div>
      <div className="cm-host min-h-0 flex-1">
        {file ? (
          <CodeMirror
            key={file.path}
            ref={cmRef}
            value={file.content}
            height="100%"
            theme={editorTheme}
            extensions={extFor(file.path)}
            onChange={onChange}
            basicSetup={{ foldGutter: true, bracketMatching: true, autocompletion: true, highlightActiveLine: true, searchKeymap: true, indentOnInput: true }}
            aria-label={`Editor: ${file.path}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[12.5px] text-code-muted">Open a file from the explorer.</div>
        )}
      </div>
    </div>
  );

  const output = (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex flex-none items-center gap-0.5 overflow-x-auto border-b border-border px-1.5 py-1.5 no-scrollbar">
        {([
          ["console", "Console"],
          ...(result?.tests.length ? [["tests", `Tests ${result.tests.filter((t) => t.pass).length}/${result.tests.length}`]] : []),
          ["problems", `Problems${problems.length ? ` ${problems.length}` : ""}`],
          ...(isWeb ? [["preview", "Preview"]] : []),
          ["lumen", "Ask Lumen"],
        ] as [typeof tab, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={cn("h-7 flex-none rounded-md px-2 text-[11.5px] font-medium transition-colors", tab === v ? "bg-surface-2 text-primary" : "text-muted hover:text-secondary", v === "problems" && problems.length ? "text-danger" : "")}>
            {l}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "console" && (
          <div className="code-chrome h-full overflow-auto bg-code-bg p-3 font-mono text-[12px] leading-[20px]">
            {running && <p className="flex items-center gap-2 text-code-muted"><Loader2 className="size-3 spin" />{pyLoading ? "Loading Python runtime (first run only, ~10 MB)…" : "Running…"}</p>}
            {!running && !result && !webTarget && <p className="text-code-muted">{canRun ? "Press Run (⌘↵) to execute this file." : `${file?.path ?? "This file"} can't be executed here. Runnable: .js .ts .py and web projects.`}</p>}
            {logs.map((l, i) => (
              <div key={i} className={cn("whitespace-pre-wrap break-words", l.stream === "stderr" ? "text-danger" : l.stream === "info" ? "text-code-muted" : "text-code")}>{l.text}</div>
            ))}
            {result && !running && !webTarget && (
              <p className="mt-2 border-t border-code-line pt-2 text-code-muted">
                {result.timedOut ? "Timed out" : result.ok ? "Finished" : "Finished with errors"} · {result.durationMs} ms {result.logs.length === 0 && "· no output"}
              </p>
            )}
          </div>
        )}
        {tab === "tests" && result && (
          <div className="space-y-1.5 p-3">
            {result.tests.map((t) => (
              <div key={t.name} className="flex items-start gap-2 rounded-md border border-border bg-surface p-2.5">
                {t.pass ? <CheckCircle2 className="mt-px size-3.5 flex-none text-accent-2" /> : <XCircle className="mt-px size-3.5 flex-none text-danger" />}
                <span className="min-w-0 flex-1 text-[12px]">
                  <span className="text-primary">{t.name}</span>
                  {t.error && <span className="mt-0.5 block font-mono text-[11px] text-danger">{t.error}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
        {tab === "problems" && (
          <div className="p-2">
            {problems.length === 0 ? <p className="p-2 text-[12px] text-muted">No problems reported by the last run.</p> : problems.map((p, i) => {
              const n = lineOf(p.text);
              return (
                <button key={i} onClick={() => jumpTo(n)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
                  <AlertTriangle className="mt-0.5 size-3.5 flex-none text-danger" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-secondary">{p.text.split("\n").slice(-1)[0]}</span>
                  {Number.isFinite(n) && <span className="flex-none font-mono text-[11px] text-accent">Ln {n}</span>}
                </button>
              );
            })}
          </div>
        )}
        {tab === "preview" && (
          <div className="flex h-full flex-col">
            {previewDoc ? (
              <iframe ref={previewRef} title="Preview" sandbox="allow-scripts allow-modals" srcDoc={previewDoc} className="min-h-0 w-full flex-1 bg-white" />
            ) : (
              <p className="p-3 text-[12px] text-muted">Press Run to render the preview.</p>
            )}
          </div>
        )}
        {tab === "lumen" && <LumenPanel project={project} file={file} result={webTarget ? { ok: !problems.length, logs, tests: [], durationMs: 0 } : result} onNavigate={onNavigate} />}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* toolbar */}
      <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-border bg-app px-3 py-2">
        <button onClick={() => onNavigate("project", project.id)} className="max-w-[180px] truncate font-display text-[17px] text-primary hover:underline" title="Open project overview">{project.name}</button>
        <Badge>{file ? (webTarget ? "Web preview" : lang === "python" ? "Python · Pyodide" : lang === "typescript" ? "TypeScript → JS" : lang) : "—"}</Badge>
        <span className={cn("inline-flex items-center gap-1.5 text-[11.5px]", save === "failed" ? "text-danger" : "text-muted")} aria-live="polite">
          <span className={cn("size-1.5 rounded-full", save === "saved" ? "bg-accent-2" : save === "saving" ? "animate-pulse bg-warn" : "bg-danger")} />
          {save === "saved" ? "Saved on this device" : save === "saving" ? "Saving…" : "Save failed — retrying on next edit"}
        </span>
        <div className="flex-1" />
        <div className="lg:hidden">
          <Segmented size="sm" value={mobile} onChange={setMobile} options={[{ value: "files", label: "Files" }, { value: "editor", label: "Editor" }, { value: "output", label: "Output" }]} />
        </div>
        <IconBtn label="Reindent" onClick={reindent}><Braces className="size-3.5" /></IconBtn>
        <IconBtn label="Reset file to last saved version" onClick={resetFile}><History className="size-3.5" /></IconBtn>
        <IconBtn label="Save version (⌘S)" onClick={() => snapshot(`Manual save · ${new Date().toLocaleTimeString()}`)}><Save className="size-3.5" /></IconBtn>
        <IconBtn label="Export ZIP" onClick={exportZip}><Download className="size-3.5" /></IconBtn>
        <IconBtn label={focusMode ? "Exit focus mode" : "Focus mode"} onClick={() => setFocusMode((v) => !v)}>{focusMode ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}</IconBtn>
        {running ? (
          <Button size="sm" variant="secondary" onClick={() => { stopRun(); setRunning(false); setPyLoading(false); }}><Square className="size-3 fill-current" />Stop</Button>
        ) : (
          <Button size="sm" variant="primary" onClick={doRun} disabled={!canRun} title={canRun ? "Run (⌘↵)" : "This file type can't be run"}><Play className="size-3" />Run</Button>
        )}
      </div>

      {/* desktop: resizable */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <Group orientation="horizontal" id="lumen-code">
          {!focusMode && (
            <>
              <Panel defaultSize="18%" minSize="12%" maxSize="35%">{explorer}</Panel>
              <Separator className="w-px bg-border transition-colors hover:bg-accent data-[separator=active]:bg-accent" />
            </>
          )}
          <Panel minSize="30%">{editor}</Panel>
          {!focusMode && (
            <>
              <Separator className="w-px bg-border transition-colors hover:bg-accent data-[separator=active]:bg-accent" />
              <Panel defaultSize="32%" minSize="20%">{output}</Panel>
            </>
          )}
        </Group>
      </div>
      {/* mobile/tablet: one panel at a time */}
      <div className="min-h-0 flex-1 lg:hidden">{mobile === "files" ? explorer : mobile === "editor" ? editor : output}</div>
    </div>
  );
}

/** Lumen reads the real open file and the real last run before answering. */
function LumenPanel({ project, file, result, onNavigate }: { project: Project; file: ProjectFile | null; result: RunResult | null; onNavigate: (p: Page, arg?: string) => void }) {
  const all = conversations.use();
  const { send, isBusy, cancel } = useTutor();
  const conv = all.find((c) => c.projectId === project.id && c.mode === "code");
  const lastA = conv ? [...conv.messages].reverse().find((m) => m.role === "assistant") : undefined;

  const ask = (q: string) => {
    if (!file) return;
    const c = conv ?? newConversation("code", { title: `${project.name} · code`, projectId: project.id });
    if (!conv) patchProject(project.id, (p) => ({ conversationIds: [...p.conversationIds, c.id] }));
    const out = result
      ? `\n\nLATEST REAL EXECUTION (${result.ok ? "ok" : "errors"}, ${result.durationMs} ms):\n${result.logs.map((l) => `[${l.stream}] ${l.text}`).join("\n").slice(0, 4000) || "(no output)"}`
      : "\n\n(The code has not been run yet.)";
    send(c.id, q, undefined, `OPEN FILE: ${file.path}\n\`\`\`${langOf(file.path)}\n${file.content.split("\n").map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join("\n").slice(0, 12000)}\n\`\`\`${out}`);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-border p-2.5">
        {LUMEN_ACTIONS.map((a) => (
          <button key={a} disabled={!file || (conv && isBusy(conv.id))} onClick={() => ask(a)} className="h-7 rounded-md border border-border bg-surface px-2 text-[11.5px] text-secondary transition-colors hover:border-strong hover:text-primary disabled:opacity-40">{a}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!lastA && <p className="text-[12.5px] leading-5 text-muted">Lumen will see <span className="font-mono text-secondary">{file?.path ?? "the open file"}</span> with line numbers{result ? " and your last real run output" : ""}.</p>}
        {lastA && (
          <>
            {lastA.status === "pending" && <p className="flex items-center gap-2 text-[12px] text-secondary"><Loader2 className="size-3 spin" />Waiting for Lumen…</p>}
            {lastA.content && <div className="text-[13px]"><Markdown content={lastA.content} streaming={lastA.status === "streaming"} /></div>}
            {lastA.status === "failed" && <p className="mt-2 rounded-md border border-danger/35 bg-danger/[0.07] px-2.5 py-2 text-[12px] text-secondary">{lastA.error}</p>}
            <div className="mt-3 flex items-center gap-3">
              {conv && isBusy(conv.id) && <button onClick={() => cancel(conv.id)} className="text-[12px] text-secondary hover:text-primary">Stop</button>}
              {conv && <button onClick={() => onNavigate("chat", conv.id)} className="text-[12px] font-medium text-accent">Open full conversation →</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button title={label} aria-label={label} onClick={onClick} className={cn("ring-focus flex size-7 flex-none items-center justify-center rounded-md transition-colors hover:bg-surface-2 hover:text-primary", active ? "bg-surface-2 text-accent" : "text-muted")}>
      {children}
    </button>
  );
}
