import { transform } from "sucrase";
import type { ProjectFile } from "./store";

/* =========================================================================
 * Real, isolated execution — nothing here is simulated.
 *  JS / TS : sandboxed iframe (allow-scripts only, opaque origin, no parent
 *            access), console + test harness bridged via postMessage, hard
 *            timeout destroys the frame.
 *  Python  : Pyodide inside a dedicated Web Worker; timeout terminates it.
 *  HTML    : live preview in a sandboxed iframe with console bridging.
 * Student code never runs on the application server.
 * ========================================================================= */

export type LogLine = { stream: "stdout" | "stderr" | "info"; text: string };
export type TestResult = { name: string; pass: boolean; error?: string };
export interface RunResult {
  ok: boolean;
  logs: LogLine[];
  tests: TestResult[];
  durationMs: number;
  timedOut?: boolean;
  error?: string;
}

export type Lang = "javascript" | "typescript" | "python" | "html" | "css" | "markdown" | "json" | "text";

export function langOf(path: string): Lang {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js": case "mjs": case "cjs": return "javascript";
    case "ts": case "tsx": return "typescript";
    case "py": return "python";
    case "html": case "htm": return "html";
    case "css": return "css";
    case "md": return "markdown";
    case "json": return "json";
    default: return "text";
  }
}

export const RUNNABLE: Lang[] = ["javascript", "typescript", "python", "html"];

const fmt = `function __fmt(v){try{if(typeof v==="string")return v;if(v instanceof Error)return v.name+": "+v.message;return JSON.stringify(v,(k,x)=>typeof x==="bigint"?x.toString()+"n":x,2)}catch(e){return String(v)}}`;

const BRIDGE = `
${fmt}
const __post=(m)=>parent.postMessage(Object.assign({__lumen:true},m),"*");
["log","info","debug"].forEach(k=>{const o=console[k];console[k]=(...a)=>{__post({t:"log",stream:"stdout",text:a.map(__fmt).join(" ")});o.apply(console,a)}});
["warn","error"].forEach(k=>{const o=console[k];console[k]=(...a)=>{__post({t:"log",stream:"stderr",text:a.map(__fmt).join(" ")});o.apply(console,a)}});
window.addEventListener("error",e=>__post({t:"log",stream:"stderr",text:(e.error&&e.error.stack)||e.message}));
window.addEventListener("unhandledrejection",e=>__post({t:"log",stream:"stderr",text:"Unhandled rejection: "+__fmt(e.reason)}));
const __tests=[];
window.test=(name,fn)=>__tests.push({name,fn});
window.it=window.test;
window.expect=(a)=>({
  toBe:(b)=>{if(!Object.is(a,b))throw new Error("Expected "+__fmt(b)+" but received "+__fmt(a))},
  toEqual:(b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error("Expected "+__fmt(b)+" but received "+__fmt(a))},
  toBeTruthy:()=>{if(!a)throw new Error("Expected truthy but received "+__fmt(a))},
  toThrow:()=>{let t=false;try{a()}catch(e){t=true}if(!t)throw new Error("Expected function to throw")},
});
window.__runTests=async()=>{const r=[];for(const t of __tests){try{await t.fn();r.push({name:t.name,pass:true})}catch(e){r.push({name:t.name,pass:false,error:e&&e.message||String(e)})}}__post({t:"tests",results:r})};
`;

function runInFrame(html: string, timeoutMs: number, keepAlive = false): { promise: Promise<RunResult>; frame: HTMLIFrameElement; cancel: () => void } {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.style.display = "none";
  const logs: LogLine[] = [];
  let tests: TestResult[] = [];
  const t0 = performance.now();
  let settle!: (r: RunResult) => void;
  const promise = new Promise<RunResult>((res) => (settle = res));
  let finished = false;

  const finish = (r: Partial<RunResult>) => {
    if (finished) return;
    finished = true;
    window.removeEventListener("message", onMsg);
    clearTimeout(timer);
    if (!keepAlive) frame.remove();
    settle({ ok: !logs.some((l) => l.stream === "stderr") && !r.timedOut, logs, tests, durationMs: Math.round(performance.now() - t0), ...r });
  };

  const onMsg = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow || !e.data?.__lumen) return;
    const d = e.data as { t: string; stream?: LogLine["stream"]; text?: string; results?: TestResult[] };
    if (d.t === "log" && logs.length < 2000) logs.push({ stream: d.stream ?? "stdout", text: String(d.text ?? "") });
    if (d.t === "tests") tests = d.results ?? [];
    if (d.t === "done") finish({});
  };
  window.addEventListener("message", onMsg);
  const timer = setTimeout(() => {
    logs.push({ stream: "stderr", text: `Execution stopped: exceeded ${timeoutMs / 1000}s time limit.` });
    finish({ timedOut: true });
  }, timeoutMs);

  frame.srcdoc = html;
  document.body.appendChild(frame);
  return { promise, frame, cancel: () => { logs.push({ stream: "info", text: "Stopped by user." }); finish({ ok: false }); frame.remove(); } };
}

function compile(code: string, lang: Lang): { js?: string; error?: string } {
  if (lang !== "typescript") return { js: code };
  try {
    return { js: transform(code, { transforms: ["typescript"] }).code };
  } catch (e) {
    return { error: `TypeScript compile error: ${(e as Error).message}` };
  }
}

let active: { cancel: () => void } | null = null;
export function stopRun() {
  active?.cancel();
  active = null;
}

export async function runScript(code: string, lang: Lang, timeoutMs = 5000): Promise<RunResult> {
  if (lang === "python") return runPython(code, Math.max(timeoutMs, 10000));
  const { js, error } = compile(code, lang);
  if (error) return { ok: false, logs: [{ stream: "stderr", text: error }], tests: [], durationMs: 0, error };
  const safe = JSON.stringify(js);
  const html = `<!doctype html><script>${BRIDGE}
(async()=>{try{await (0,eval)(${safe});await window.__runTests()}catch(e){__post({t:"log",stream:"stderr",text:(e&&e.stack)||String(e)})}finally{__post({t:"done"})}})();<\/script>`;
  const run = runInFrame(html, timeoutMs);
  active = run;
  return run.promise;
}

/** Build a self-contained preview document from a web project's files. */
export function buildWebPreview(files: ProjectFile[]): string {
  const get = (p: string) => files.find((f) => f.path === p)?.content;
  let html = get("index.html") ?? `<!doctype html><html><body></body></html>`;
  html = html.replace(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/g, (m, href) => {
    const css = get(href);
    return css != null ? `<style>${css}</style>` : m;
  });
  html = html.replace(/<script[^>]+src=["']([^"']+\.(?:js|ts))["'][^>]*><\/script>/g, (m, src) => {
    const code = get(src);
    if (code == null) return m;
    const { js, error } = compile(code, langOf(src));
    return `<script>${error ? `console.error(${JSON.stringify(error)})` : (js ?? "").replace(/<\/script>/g, "<\\/script>")}<\/script>`;
  });
  const bridge = `<script>${BRIDGE}<\/script>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + bridge) : bridge + html;
}

/* ---------------- Python via Pyodide in a Worker ---------------- */

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
const WORKER_SRC = `
let py=null;
self.onmessage=async(e)=>{
  const {code}=e.data;
  try{
    if(!py){
      self.postMessage({t:"status",text:"loading"});
      importScripts("${PYODIDE}pyodide.js");
      py=await loadPyodide({indexURL:"${PYODIDE}"});
      self.postMessage({t:"status",text:"ready"});
    }
    py.setStdout({batched:(s)=>self.postMessage({t:"log",stream:"stdout",text:s})});
    py.setStderr({batched:(s)=>self.postMessage({t:"log",stream:"stderr",text:s})});
    const t0=performance.now();
    await py.runPythonAsync(code);
    self.postMessage({t:"done",ms:performance.now()-t0});
  }catch(err){
    self.postMessage({t:"log",stream:"stderr",text:String(err&&err.message||err)});
    self.postMessage({t:"done",ms:0,failed:true});
  }
};`;

let pyWorker: Worker | null = null;
let pyReady = false;
export const pythonStatus = () => (pyReady ? "ready" : pyWorker ? "loading" : "cold");

function getWorker() {
  if (!pyWorker) {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
    pyWorker = new Worker(url);
  }
  return pyWorker;
}

export function runPython(code: string, timeoutMs = 10000, onStatus?: (s: string) => void): Promise<RunResult> {
  return new Promise((resolve) => {
    const w = getWorker();
    const logs: LogLine[] = [];
    const t0 = performance.now();
    let loadingPhase = !pyReady;
    let timer: ReturnType<typeof setTimeout>;
    const arm = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        w.terminate();
        pyWorker = null;
        pyReady = false;
        logs.push({ stream: "stderr", text: loadingPhase ? "Python runtime failed to load in time. Check your connection and retry." : `Execution stopped: exceeded ${ms / 1000}s time limit.` });
        resolve({ ok: false, logs, tests: [], durationMs: Math.round(performance.now() - t0), timedOut: true });
      }, ms);
    };
    arm(loadingPhase ? 60000 : timeoutMs);
    active = {
      cancel: () => {
        clearTimeout(timer);
        w.terminate();
        pyWorker = null;
        pyReady = false;
        logs.push({ stream: "info", text: "Stopped by user. The Python runtime will reload on next run." });
        resolve({ ok: false, logs, tests: [], durationMs: Math.round(performance.now() - t0) });
      },
    };
    w.onmessage = (e: MessageEvent) => {
      const d = e.data as { t: string; stream?: LogLine["stream"]; text?: string; ms?: number; failed?: boolean };
      if (d.t === "status") {
        if (d.text === "loading") { logs.push({ stream: "info", text: "Loading Python runtime (first run only)…" }); onStatus?.("loading"); }
        if (d.text === "ready") { pyReady = true; loadingPhase = false; onStatus?.("ready"); arm(timeoutMs); }
      }
      if (d.t === "log" && logs.length < 2000) logs.push({ stream: d.stream ?? "stdout", text: String(d.text ?? "") });
      if (d.t === "done") {
        clearTimeout(timer);
        active = null;
        resolve({ ok: !d.failed, logs, tests: [], durationMs: Math.round(d.ms ?? 0) });
      }
    };
    w.onerror = (e) => {
      clearTimeout(timer);
      logs.push({ stream: "stderr", text: `Python worker error: ${e.message}` });
      resolve({ ok: false, logs, tests: [], durationMs: Math.round(performance.now() - t0) });
    };
    w.postMessage({ code });
  });
}
