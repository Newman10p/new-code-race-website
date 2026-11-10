import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, ChevronLeft, ChevronRight, Download, FolderOpen, Link2, Loader2, Maximize2, Minus, MousePointer2,
  Pause, Play, Plus, Redo2, Save, Shuffle, Trash2, Undo2, Wand2,
} from "lucide-react";
import { Badge, Button } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { useToast } from "../context/ToastContext";
import { useJourney } from "../context/JourneyContext";
import { useTutor } from "../hooks/useTutor";
import { extractJson } from "../lib/ai";
import { conversations, diagrams, newConversation, uid } from "../lib/store";
import type { DEdge, DNode, Diagram } from "../lib/store";
import { cn } from "../utils/cn";

const NW = 176;
const NH = 58;

/* ---------- layout ---------- */
function autoLayout(nodes: DNode[], edges: DEdge[]): DNode[] {
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  edges.forEach((e) => indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1));
  const layer = new Map<string, number>();
  const queue = nodes.filter((n) => !indeg.get(n.id)).map((n) => n.id);
  if (!queue.length && nodes[0]) queue.push(nodes[0].id);
  queue.forEach((id) => layer.set(id, 0));
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    edges.filter((e) => e.from === id).forEach((e) => {
      if (!layer.has(e.to)) {
        layer.set(e.to, (layer.get(id) ?? 0) + 1);
        queue.push(e.to);
      }
    });
  }
  nodes.forEach((n) => !layer.has(n.id) && layer.set(n.id, 0));
  const rows = new Map<number, string[]>();
  nodes.forEach((n) => rows.set(layer.get(n.id)!, [...(rows.get(layer.get(n.id)!) ?? []), n.id]));
  return nodes.map((n) => {
    const l = layer.get(n.id)!;
    const row = rows.get(l)!;
    const i = row.indexOf(n.id);
    return { ...n, x: (i - (row.length - 1) / 2) * (NW + 48) + 400, y: l * (NH + 56) + 40 };
  });
}

/* ---------- templates (clearly labelled, not "generated") ---------- */
function tpl(title: string, type: string, labels: [string, string][], links: [number, number, string?][], steps = true): Omit<Diagram, "id" | "createdAt" | "updatedAt"> {
  const nodes = labels.map(([label, detail], i) => ({ id: `n${i}`, label, detail, x: 0, y: 0 }));
  const edges = links.map(([a, b, label]) => ({ id: uid(), from: `n${a}`, to: `n${b}`, label }));
  return { title, type, nodes: autoLayout(nodes, edges), edges, steps: steps ? nodes.map((n) => n.id) : [], version: 1, source: "template" };
}
const TEMPLATES = [
  tpl("Binary search", "algorithm", [
    ["Start: lo = 0, hi = n−1", "Search a sorted array between two indices."],
    ["lo ≤ hi?", "If the range is empty the target is not present."],
    ["mid = ⌊(lo+hi)/2⌋", "Pick the middle index of the current range."],
    ["a[mid] == target?", "Compare the middle element with the target."],
    ["Found → return mid", "The target sits at index mid."],
    ["a[mid] < target → lo = mid+1", "Discard the left half."],
    ["Not found → return −1", "Range collapsed without a match."],
  ], [[0, 1], [1, 2, "yes"], [1, 6, "no"], [2, 3], [3, 4, "yes"], [3, 5, "no"], [5, 1]]),
  tpl("HTTP request lifecycle", "process", [
    ["Browser", "The user enters a URL or the page calls fetch()."],
    ["DNS lookup", "The domain name is resolved to an IP address."],
    ["TCP + TLS handshake", "A secure connection is established."],
    ["Server", "The server routes the request to a handler."],
    ["Database", "The handler reads or writes data."],
    ["Response", "Status, headers and body travel back to the browser."],
  ], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 3, "rows"], [3, 5]]),
  tpl("Stack: push & pop", "data-structure", [
    ["Empty stack", "top = −1"],
    ["push(3)", "top = 0 · [3]"],
    ["push(7)", "top = 1 · [3, 7]"],
    ["pop() → 7", "Last in, first out · [3]"],
    ["peek() → 3", "Reads the top without removing it."],
  ], [[0, 1], [1, 2], [2, 3], [3, 4]]),
];

type Snapshot = { nodes: DNode[]; edges: DEdge[] };

export function Visualise({ initialPrompt, onConsumed }: { initialPrompt?: string; onConsumed: () => void }) {
  const saved = diagrams.use();
  const allConvs = conversations.use();
  const { send, isBusy } = useTutor();
  const { toast } = useToast();
  const { mark } = useJourney();

  const [doc, setDoc] = useState<Diagram | null>(null);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [sel, setSel] = useState<{ kind: "node" | "edge"; id: string } | null>(null);
  const [tool, setTool] = useState<"select" | "connect">("select");
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [convId, setConvId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const drag = useRef<{ id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const conv = allConvs.find((c) => c.id === convId);
  const lastA = conv ? [...conv.messages].reverse().find((m) => m.role === "assistant") : undefined;
  const generating = conv ? isBusy(conv.id) : false;

  /* ---------- history ---------- */
  const commit = useCallback((mut: (s: Snapshot) => Snapshot) => {
    setDoc((d) => {
      if (!d) return d;
      setPast((p) => [...p.slice(-60), { nodes: d.nodes, edges: d.edges }]);
      setFuture([]);
      const next = mut({ nodes: d.nodes, edges: d.edges });
      return { ...d, ...next };
    });
    setDirty(true);
  }, []);
  const undo = () => {
    if (!doc || !past.length) return;
    setFuture((f) => [{ nodes: doc.nodes, edges: doc.edges }, ...f]);
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setDoc({ ...doc, ...prev });
    setDirty(true);
  };
  const redo = () => {
    if (!doc || !future.length) return;
    setPast((p) => [...p, { nodes: doc.nodes, edges: doc.edges }]);
    setDoc({ ...doc, ...future[0] });
    setFuture((f) => f.slice(1));
    setDirty(true);
  };

  const load = (d: Omit<Diagram, "id" | "createdAt" | "updatedAt"> & Partial<Diagram>) => {
    setDoc({ id: d.id ?? uid(), createdAt: d.createdAt ?? Date.now(), updatedAt: Date.now(), ...d } as Diagram);
    setPast([]);
    setFuture([]);
    setSel(null);
    setStep(-1);
    setPlaying(false);
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setDirty(!d.id);
  };

  /* ---------- generation (real AI, structured JSON) ---------- */
  const generate = useCallback((text: string) => {
    if (!text.trim()) return;
    const c = convId && conversations.get().find((x) => x.id === convId) ? conversations.get().find((x) => x.id === convId)! : newConversation("visualise", { title: `Diagram · ${text.slice(0, 40)}` });
    setConvId(c.id);
    send(c.id, text);
    mark("visited_create");
  }, [convId, send, mark]);

  useEffect(() => {
    if (initialPrompt?.startsWith("open:")) {
      const d = diagrams.get().find((x) => x.id === initialPrompt.slice(5));
      if (d) load(d);
      onConsumed();
    } else if (initialPrompt) {
      setPrompt(initialPrompt.split("\n")[0]);
      generate(initialPrompt);
      onConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  // when an AI reply completes, try to parse a diagram from it
  const parsedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!lastA || lastA.status !== "done" || parsedFor.current === lastA.id) return;
    parsedFor.current = lastA.id;
    const j = extractJson<{ title?: string; type?: string; nodes?: { id: string; label: string; detail?: string }[]; edges?: { from: string; to: string; label?: string }[]; steps?: string[] }>(lastA.content);
    if (!j?.nodes?.length) return; // explanation-only reply (e.g. answering about a node)
    const nodes = j.nodes.slice(0, 30).map((n) => ({ id: String(n.id), label: String(n.label).slice(0, 80), detail: String(n.detail ?? ""), x: 0, y: 0 }));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = (j.edges ?? []).filter((e) => ids.has(String(e.from)) && ids.has(String(e.to))).map((e) => ({ id: uid(), from: String(e.from), to: String(e.to), label: e.label }));
    load({ title: j.title ?? "Untitled diagram", type: j.type ?? "flow", nodes: autoLayout(nodes, edges), edges, steps: (j.steps ?? []).filter((s) => ids.has(s)), version: 1, source: "generated", conversationId: convId ?? undefined });
    toast({ title: "Diagram generated", detail: `${nodes.length} nodes · editable`, tone: "success" });
  }, [lastA, convId, toast]);

  /* ---------- step animation ---------- */
  const steps = doc?.steps.length ? doc.steps : [];
  useEffect(() => {
    if (!playing || !steps.length) return;
    const t = setInterval(() => setStep((s) => (s + 1 >= steps.length ? (setPlaying(false), s) : s + 1)), 1200);
    return () => clearInterval(t);
  }, [playing, steps.length]);
  const currentStepId = step >= 0 ? steps[step] : null;

  /* ---------- canvas interaction ---------- */
  const toWorld = (cx: number, cy: number, rect: DOMRect) => ({ x: (cx - rect.left - pan.x) / zoom, y: (cy - rect.top - pan.y) / zoom });

  const onNodeDown = (e: React.PointerEvent, n: DNode) => {
    e.stopPropagation();
    if (tool === "connect") {
      if (!connectFrom) setConnectFrom(n.id);
      else if (connectFrom !== n.id) {
        const from = connectFrom;
        commit((s) => ({ ...s, edges: [...s.edges, { id: uid(), from, to: n.id }] }));
        setConnectFrom(null);
        toast({ title: "Connected" });
      }
      return;
    }
    setSel({ kind: "node", id: n.id });
    drag.current = { id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !doc) return;
    const dx = (e.clientX - d.sx) / (d.id ? zoom : 1);
    const dy = (e.clientY - d.sy) / (d.id ? zoom : 1);
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    if (!d.moved && d.id) setPast((p) => [...p.slice(-60), { nodes: doc.nodes, edges: doc.edges }]);
    d.moved = true;
    if (d.id) setDoc({ ...doc, nodes: doc.nodes.map((n) => (n.id === d.id ? { ...n, x: d.ox + dx, y: d.oy + dy } : n)) });
    else setPan({ x: d.ox + dx, y: d.oy + dy });
  };
  const onUp = () => {
    if (drag.current?.moved && drag.current.id) setDirty(true);
    drag.current = null;
  };

  const addNode = () => {
    if (!doc) return;
    const id = uid();
    commit((s) => ({ ...s, nodes: [...s.nodes, { id, label: "New step", detail: "", x: 400 - pan.x / zoom, y: 60 - pan.y / zoom + s.nodes.length * 8 }] }));
    setSel({ kind: "node", id });
  };
  const removeSelected = useCallback(() => {
    if (!sel || !doc) return;
    if (sel.kind === "node") commit((s) => ({ nodes: s.nodes.filter((n) => n.id !== sel.id), edges: s.edges.filter((e) => e.from !== sel.id && e.to !== sel.id) }));
    else commit((s) => ({ ...s, edges: s.edges.filter((e) => e.id !== sel.id) }));
    setDoc((d) => (d ? { ...d, steps: d.steps.filter((x) => x !== sel.id) } : d));
    setSel(null);
  }, [sel, doc, commit]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement).tagName;
      if (t === "INPUT" || t === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); removeSelected(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if (e.key === "Escape") { setSel(null); setConnectFrom(null); setTool("select"); }
      if (e.key === "c" && !e.metaKey && !e.ctrlKey) setTool((x) => (x === "connect" ? "select" : "connect"));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const saveDoc = () => {
    if (!doc) return;
    const exists = saved.some((d) => d.id === doc.id);
    const next = { ...doc, version: exists ? doc.version + 1 : doc.version, updatedAt: Date.now() };
    const ok = diagrams.set((p) => (exists ? p.map((d) => (d.id === doc.id ? next : d)) : [next, ...p]));
    if (ok) { setDoc(next); setDirty(false); }
    toast(ok ? { title: `Saved · v${next.version}`, tone: "success" } : { title: "Save failed", detail: "Browser storage unavailable — export JSON to keep it." });
  };
  const exportJson = () => {
    if (!doc) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ title: doc.title, type: doc.type, nodes: doc.nodes, edges: doc.edges, steps: doc.steps }, null, 2)], { type: "application/json" }));
    a.download = `${doc.title.replace(/\W+/g, "-").toLowerCase()}.json`;
    a.click();
  };

  const selectedNode = sel?.kind === "node" ? doc?.nodes.find((n) => n.id === sel.id) : undefined;
  const selectedEdge = sel?.kind === "edge" ? doc?.edges.find((e) => e.id === sel.id) : undefined;
  const nodeById = useMemo(() => new Map((doc?.nodes ?? []).map((n) => [n.id, n])), [doc?.nodes]);

  const askAbout = (q: string) => {
    if (!doc || !selectedNode) return;
    const c = conv ?? newConversation("visualise", { title: `Diagram · ${doc.title}` });
    setConvId(c.id);
    parsedFor.current = "__skip_next__";
    send(c.id, `${q}\n\nSelected element: "${selectedNode.label}" — ${selectedNode.detail}`, undefined,
      `CURRENT DIAGRAM (structured): ${JSON.stringify({ title: doc.title, nodes: doc.nodes.map(({ id, label, detail }) => ({ id, label, detail })), edges: doc.edges.map(({ from, to, label }) => ({ from, to, label })) })}\nAnswer in prose. Only include a JSON block if the student asks you to change the diagram.`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* prompt bar */}
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border bg-app px-3 py-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generate(prompt)}
          placeholder="Describe a process, algorithm or system to diagram…"
          aria-label="Diagram prompt"
          className="h-8 min-w-[220px] flex-1 rounded-md border border-strong bg-surface px-3 text-[13px] text-primary outline-none focus:border-accent"
        />
        <Button size="md" variant="primary" disabled={generating || !prompt.trim()} onClick={() => generate(prompt)}>
          {generating ? <Loader2 className="size-3.5 spin" /> : <Wand2 className="size-3.5" />}
          {generating ? "Generating…" : "Generate"}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* left: tools + library */}
        <aside className="hidden w-[220px] flex-none flex-col overflow-y-auto border-r border-border bg-sidebar p-2.5 md:flex">
          <Label>Tools</Label>
          <div className="mb-3 grid grid-cols-2 gap-1">
            <ToolBtn active={tool === "select"} onClick={() => setTool("select")}><MousePointer2 className="size-3.5" />Select</ToolBtn>
            <ToolBtn active={tool === "connect"} onClick={() => { setTool("connect"); setConnectFrom(null); }}><Link2 className="size-3.5" />Connect</ToolBtn>
            <ToolBtn onClick={addNode} disabled={!doc}><Plus className="size-3.5" />Node</ToolBtn>
            <ToolBtn onClick={removeSelected} disabled={!sel}><Trash2 className="size-3.5" />Delete</ToolBtn>
          </div>
          <Label>Templates</Label>
          <div className="mb-3 space-y-0.5">
            {TEMPLATES.map((t) => (
              <button key={t.title} onClick={() => load({ ...t, nodes: t.nodes.map((n) => ({ ...n })), edges: t.edges.map((e) => ({ ...e, id: uid() })) })} className="w-full rounded-md px-2 py-1.5 text-left text-[12.5px] text-secondary hover:bg-surface-2 hover:text-primary">
                {t.title}
              </button>
            ))}
          </div>
          <Label>Saved diagrams</Label>
          {saved.length === 0 && <p className="px-2 text-[12px] text-muted">Nothing saved yet.</p>}
          {saved.map((d) => (
            <button key={d.id} onClick={() => load(d)} className={cn("flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-surface-2", doc?.id === d.id ? "text-primary" : "text-secondary")}>
              <FolderOpen className="size-3 flex-none text-muted" />
              <span className="truncate">{d.title}</span>
              <span className="ml-auto font-mono text-[10px] text-muted">v{d.version}</span>
            </button>
          ))}
        </aside>

        {/* canvas */}
        <div className="relative min-w-0 flex-1">
          {!doc ? (
            <div className="dot-grid flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="font-display text-[26px] text-primary">Nothing on the canvas yet</p>
              <p className="max-w-sm text-[13px] text-secondary">Generate a diagram from a prompt, start from a template, or reopen a saved one. Every diagram is structured data you can edit.</p>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {TEMPLATES.map((t) => (
                  <Button key={t.title} size="sm" onClick={() => load({ ...t })}>{t.title}</Button>
                ))}
              </div>
              {lastA?.status === "failed" && <p className="mt-2 max-w-md rounded-md border border-danger/35 bg-danger/[0.07] px-3 py-2 text-[12.5px] text-secondary">{lastA.error}</p>}
              {generating && <p className="flex items-center gap-2 text-[12.5px] text-secondary"><Loader2 className="size-3.5 spin" />Waiting for Lumen…</p>}
            </div>
          ) : (
            <div
              className={cn("dot-grid relative h-full w-full touch-none overflow-hidden", tool === "connect" ? "cursor-crosshair" : "cursor-grab")}
              onPointerDown={(e) => { setSel(null); drag.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y, moved: false }; }}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
              onWheel={(e) => {
                if (!e.ctrlKey && !e.metaKey) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const w = toWorld(e.clientX, e.clientY, rect);
                const z = Math.min(2, Math.max(0.3, zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
                setZoom(z);
                setPan({ x: e.clientX - rect.left - w.x * z, y: e.clientY - rect.top - w.y * z });
              }}
            >
              <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
                  <defs>
                    <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="var(--border-strong)" /></marker>
                    <marker id="arr-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="var(--accent)" /></marker>
                  </defs>
                  {doc.edges.map((e) => {
                    const a = nodeById.get(e.from);
                    const b = nodeById.get(e.to);
                    if (!a || !b) return null;
                    const ax = a.x + NW / 2, ay = a.y + NH / 2, bx = b.x + NW / 2, by = b.y + NH / 2;
                    const vert = Math.abs(by - ay) >= Math.abs(bx - ax);
                    const p1 = vert ? { x: ax, y: ay + Math.sign(by - ay || 1) * NH / 2 } : { x: ax + Math.sign(bx - ax || 1) * NW / 2, y: ay };
                    const p2 = vert ? { x: bx, y: by - Math.sign(by - ay || 1) * NH / 2 } : { x: bx - Math.sign(bx - ax || 1) * NW / 2, y: by };
                    const d = vert ? `M${p1.x} ${p1.y}C${p1.x} ${(p1.y + p2.y) / 2},${p2.x} ${(p1.y + p2.y) / 2},${p2.x} ${p2.y}` : `M${p1.x} ${p1.y}C${(p1.x + p2.x) / 2} ${p1.y},${(p1.x + p2.x) / 2} ${p2.y},${p2.x} ${p2.y}`;
                    const on = sel?.id === e.id || sel?.id === e.from || sel?.id === e.to || currentStepId === e.to;
                    return (
                      <g key={e.id}>
                        <path d={d} fill="none" stroke="transparent" strokeWidth={14} className="pointer-events-auto cursor-pointer" onPointerDown={(ev) => { ev.stopPropagation(); setSel({ kind: "edge", id: e.id }); }} />
                        <path d={d} fill="none" stroke={on ? "var(--accent)" : "var(--border-strong)"} strokeWidth={on ? 1.8 : 1.3} markerEnd={on ? "url(#arr-on)" : "url(#arr)"} />
                        {e.label && <text x={(p1.x + p2.x) / 2 + 6} y={(p1.y + p2.y) / 2} className="fill-[var(--text-3)] text-[10.5px]">{e.label}</text>}
                      </g>
                    );
                  })}
                </svg>
                {doc.nodes.map((n, i) => {
                  const isSel = sel?.id === n.id;
                  const isStep = currentStepId === n.id;
                  const stepIdx = doc.steps.indexOf(n.id);
                  return (
                    <div
                      key={n.id}
                      onPointerDown={(e) => onNodeDown(e, n)}
                      className={cn(
                        "node-in absolute flex select-none flex-col justify-center rounded-lg border bg-surface px-3 transition-[border-color,box-shadow,background-color]",
                        isStep ? "border-accent bg-accent-soft shadow-[0_0_0_3px_var(--ring)]" : isSel ? "border-accent ring-1 ring-accent/40" : connectFrom === n.id ? "border-accent-2" : "border-strong hover:border-accent/50",
                        tool === "connect" ? "cursor-crosshair" : "cursor-move"
                      )}
                      style={{ left: n.x, top: n.y, width: NW, height: NH, animationDelay: `${i * 0.03}s` }}
                    >
                      <span className="truncate text-[12.5px] font-semibold text-primary">{n.label}</span>
                      {n.detail && <span className="truncate text-[11px] text-muted">{n.detail}</span>}
                      {stepIdx >= 0 && <span className="absolute -left-2 -top-2 flex size-4 items-center justify-center rounded-full border border-border bg-surface-2 font-mono text-[9px] text-muted">{stepIdx + 1}</span>}
                    </div>
                  );
                })}
              </div>

              {/* overlays */}
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
                <input value={doc.title} onChange={(e) => { setDoc({ ...doc, title: e.target.value }); setDirty(true); }} aria-label="Diagram title" className="w-44 bg-transparent font-display text-[16px] text-primary outline-none" />
                <Badge tone={doc.source === "generated" ? "accent" : "plain"}>{doc.source}</Badge>
                <span className={cn("text-[11px]", dirty ? "text-warn" : "text-muted")}>{dirty ? "Unsaved changes" : saved.some((d) => d.id === doc.id) ? `Saved · v${doc.version}` : ""}</span>
              </div>
              <div className="absolute right-3 top-3 flex items-center gap-0.5 rounded-md border border-border bg-surface/95 p-0.5 backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
                <Ico label="Undo (⌘Z)" onClick={undo} disabled={!past.length}><Undo2 className="size-3.5" /></Ico>
                <Ico label="Redo (⇧⌘Z)" onClick={redo} disabled={!future.length}><Redo2 className="size-3.5" /></Ico>
                <Ico label="Reset layout" onClick={() => commit((s) => ({ ...s, nodes: autoLayout(s.nodes, s.edges) }))}><Shuffle className="size-3.5" /></Ico>
                <Ico label="Export JSON" onClick={exportJson}><Download className="size-3.5" /></Ico>
                <Ico label="Save" onClick={saveDoc}><Save className="size-3.5" /></Ico>
              </div>
              <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-md border border-border bg-surface/95 p-0.5 backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
                <Ico label="Zoom out" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}><Minus className="size-3.5" /></Ico>
                <span className="w-10 text-center font-mono text-[11px] text-secondary">{Math.round(zoom * 100)}%</span>
                <Ico label="Zoom in" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}><Plus className="size-3.5" /></Ico>
                <Ico label="Reset view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Maximize2 className="size-3.5" /></Ico>
              </div>
              {tool === "connect" && (
                <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-accent-line bg-accent-soft px-2.5 py-1 text-[12px] text-primary">
                  {connectFrom ? "Now click the target node" : "Click the source node"} · Esc to cancel
                </p>
              )}
            </div>
          )}
        </div>

        {/* right: properties + explanation */}
        {doc && (
          <aside className="hidden w-[300px] flex-none flex-col overflow-y-auto border-l border-border bg-sidebar lg:flex">
            {selectedNode ? (
              <div className="space-y-3 p-3.5">
                <Label>Node</Label>
                <input value={selectedNode.label} onChange={(e) => commit((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === selectedNode.id ? { ...n, label: e.target.value } : n)) }))} aria-label="Node label" className="h-8 w-full rounded-md border border-strong bg-surface px-2.5 text-[13px] text-primary outline-none focus:border-accent" />
                <textarea value={selectedNode.detail} onChange={(e) => commit((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === selectedNode.id ? { ...n, detail: e.target.value } : n)) }))} rows={3} aria-label="Node detail" placeholder="Explanation" className="w-full resize-none rounded-md border border-strong bg-surface px-2.5 py-2 text-[12.5px] text-primary outline-none focus:border-accent" />
                <label className="flex items-center gap-2 text-[12px] text-secondary">
                  <input type="checkbox" checked={doc.steps.includes(selectedNode.id)} onChange={(e) => { setDoc({ ...doc, steps: e.target.checked ? [...doc.steps, selectedNode.id] : doc.steps.filter((x) => x !== selectedNode.id) }); setDirty(true); }} />
                  Include in step-through ({doc.steps.includes(selectedNode.id) ? `#${doc.steps.indexOf(selectedNode.id) + 1}` : "off"})
                </label>
                <div>
                  <Label>Ask Lumen</Label>
                  <div className="space-y-0.5">
                    {["What does this represent?", "Why is it connected here?", "What happens next?", "Explain this in simpler terms.", "Show an example."].map((q) => (
                      <button key={q} disabled={generating} onClick={() => askAbout(q)} className="group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12.5px] text-secondary hover:bg-surface-2 hover:text-primary disabled:opacity-40">
                        {q}<ArrowRight className="size-3 opacity-0 group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : selectedEdge ? (
              <div className="space-y-3 p-3.5">
                <Label>Connection</Label>
                <p className="text-[12.5px] text-secondary">{nodeById.get(selectedEdge.from)?.label} → {nodeById.get(selectedEdge.to)?.label}</p>
                <input value={selectedEdge.label ?? ""} onChange={(e) => commit((s) => ({ ...s, edges: s.edges.map((x) => (x.id === selectedEdge.id ? { ...x, label: e.target.value } : x)) }))} placeholder="Label (optional)" aria-label="Edge label" className="h-8 w-full rounded-md border border-strong bg-surface px-2.5 text-[13px] text-primary outline-none focus:border-accent" />
                <Button size="sm" variant="danger" onClick={removeSelected}><Trash2 className="size-3" />Delete connection</Button>
              </div>
            ) : (
              <div className="p-3.5 text-[12.5px] leading-5 text-muted">Select a node to edit it or ask Lumen about it. Drag to move · <kbd>C</kbd> connect · <kbd>Del</kbd> delete · ⌘-scroll to zoom.</div>
            )}
            {lastA && (selectedNode || lastA.status !== "done") && !extractJson(lastA.content) && (
              <div className="border-t border-border p-3.5 text-[13px]">
                {lastA.status === "pending" && <p className="flex items-center gap-2 text-[12px] text-secondary"><Loader2 className="size-3 spin" />Waiting for Lumen…</p>}
                {lastA.content && <Markdown content={lastA.content} streaming={lastA.status === "streaming"} />}
                {lastA.status === "failed" && <p className="text-[12px] text-danger">{lastA.error}</p>}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* step controls */}
      {doc && steps.length > 0 && (
        <div className="flex flex-none items-center gap-2 border-t border-border bg-app px-3 py-2">
          <Ico label="Previous step" onClick={() => { setPlaying(false); setStep((s) => Math.max(-1, s - 1)); }}><ChevronLeft className="size-4" /></Ico>
          <Ico label={playing ? "Pause" : "Play"} onClick={() => { if (step >= steps.length - 1) setStep(-1); setPlaying((p) => !p); }}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</Ico>
          <Ico label="Next step" onClick={() => { setPlaying(false); setStep((s) => Math.min(steps.length - 1, s + 1)); }}><ChevronRight className="size-4" /></Ico>
          <span className="font-mono text-[11px] text-muted">{step + 1}/{steps.length}</span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-primary">
            {currentStepId ? <><strong className="font-medium">{nodeById.get(currentStepId)?.label}</strong> <span className="text-secondary">— {nodeById.get(currentStepId)?.detail}</span></> : <span className="text-muted">Press play to step through the process.</span>}
          </span>
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted">{children}</p>;
}
function ToolBtn({ children, active, onClick, disabled }: { children: React.ReactNode; active?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={cn("inline-flex h-8 items-center justify-center gap-1.5 rounded-md border text-[12px] font-medium transition-colors disabled:opacity-40", active ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-secondary hover:border-strong hover:text-primary")}>
      {children}
    </button>
  );
}
function Ico({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button title={label} aria-label={label} onClick={onClick} disabled={disabled} className="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-primary disabled:opacity-30">
      {children}
    </button>
  );
}
