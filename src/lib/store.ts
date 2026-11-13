import { useSyncExternalStore } from "react";
import type { AiLanguage, ToolId } from "./aiTools";

/* =========================================================================
 * Local persistence. Data lives in this browser's localStorage, scoped per
 * student id when the CodeQuest host provides one. Every write reports real
 * success/failure — the UI never shows "Saved" for a write that failed.
 * When a backend is connected these entities map 1:1 onto tutor_* tables.
 * ========================================================================= */

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const scope = () => (typeof window !== "undefined" && window.CODEQUEST?.student?.id) || "local";
const k = (name: string) => `lumen:${scope()}:${name}`;

export type SaveState = "idle" | "saving" | "saved" | "failed";

function createStore<T>(name: string, initial: T) {
  let state: T = initial;
  try {
    const raw = localStorage.getItem(k(name));
    if (raw) state = JSON.parse(raw) as T;
  } catch {
    /* corrupted entry: keep initial, do not overwrite until next write */
  }
  let saveState: SaveState = "idle";
  let lastError: string | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const persist = (): boolean => {
    try {
      localStorage.setItem(k(name), JSON.stringify(state));
      saveState = "saved";
      lastError = null;
      return true;
    } catch (e) {
      saveState = "failed";
      lastError = e instanceof Error ? e.message : "Storage write failed";
      return false;
    }
  };

  return {
    get: () => state,
    /** Returns true only if the change was actually persisted. */
    set(updater: (prev: T) => T): boolean {
      state = updater(state);
      saveState = "saving";
      const ok = persist();
      emit();
      return ok;
    },
    status: () => ({ saveState, lastError }),
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    use(): T {
      return useSyncExternalStore(this.subscribe, this.get, this.get);
    },
  };
}

/* ---------------- entities ---------------- */

export type Mode = "ask" | "learn" | "code" | "visualise" | "build";
export type MsgStatus = "pending" | "streaming" | "done" | "failed" | "cancelled";

export interface Attachment {
  id: string;
  name: string;
  kind: "text" | "image";
  size: number;
  /** text content, or data URL for images */
  data: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: MsgStatus;
  error?: string;
  model?: string;
  attachments?: Attachment[];
  createdAt: number;
  /** Which CodeQuest AI tool produced the response. */
  tool?: ToolId;
  /** True for locally-built demonstration replies — never presented as model output. */
  demo?: boolean;
  feedback?: "up" | "down";
}

export interface Conversation {
  id: string;
  title: string;
  mode: Mode;
  pinned: boolean;
  archived: boolean;
  useContext: boolean;
  explainStyle?: string;
  projectId?: string;
  branchedFrom?: string;
  /** CodeQuest AI workspace state (optional: older conversations predate it). */
  aiTool?: ToolId;
  language?: AiLanguage;
  topic?: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface LibraryItem {
  id: string;
  kind: "note" | "response" | "snippet" | "diagram" | "exercise";
  title: string;
  content: string;
  tags: string[];
  collection?: string;
  pinned: boolean;
  language?: string;
  source?: { conversationId?: string; messageId?: string; projectId?: string; diagramId?: string };
  createdAt: number;
  updatedAt: number;
}

export interface ProjectFile {
  path: string;
  content: string;
}

export interface Task {
  id: string;
  text: string;
  done: boolean;
}

export interface ProjectVersion {
  id: string;
  label: string;
  at: number;
  files: ProjectFile[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  type: "web" | "python" | "javascript" | "other";
  status: "active" | "archived" | "complete";
  requirements: string;
  notes: string;
  tasks: Task[];
  files: ProjectFile[];
  versions: ProjectVersion[];
  conversationIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface DNode {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
}
export interface DEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}
export interface Diagram {
  id: string;
  title: string;
  type: string;
  nodes: DNode[];
  edges: DEdge[];
  /** ordered node ids for step-through animation */
  steps: string[];
  version: number;
  source: "template" | "generated" | "manual";
  conversationId?: string;
  projectId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContextItem {
  id: string;
  label: string;
  value: string;
  enabled: boolean;
  createdAt: number;
}

export interface TutorSettings {
  personalisation: boolean;
  apiUrl: string;
  model: string;
}

/* ---------------- stores ---------------- */

export const conversations = createStore<Conversation[]>("conversations", []);
export const library = createStore<LibraryItem[]>("library", []);
export const projects = createStore<Project[]>("projects", []);
export const diagrams = createStore<Diagram[]>("diagrams", []);
export const contextItems = createStore<ContextItem[]>("context", []);
export const settings = createStore<TutorSettings>("settings", {
  personalisation: true,
  apiUrl: "",
  model: "",
});

/* ---------------- helpers ---------------- */

export function newConversation(mode: Mode, partial: Partial<Conversation> = {}): Conversation {
  const c: Conversation = {
    id: uid(),
    title: "New conversation",
    mode,
    pinned: false,
    archived: false,
    useContext: settings.get().personalisation,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    ...partial,
  };
  conversations.set((p) => [c, ...p]);
  return c;
}

export function patchConversation(id: string, patch: Partial<Conversation> | ((c: Conversation) => Partial<Conversation>)) {
  return conversations.set((p) =>
    p.map((c) => (c.id === id ? { ...c, ...(typeof patch === "function" ? patch(c) : patch), updatedAt: Date.now() } : c))
  );
}

export function addLibraryItem(item: Omit<LibraryItem, "id" | "createdAt" | "updatedAt" | "pinned" | "tags"> & Partial<LibraryItem>) {
  const full: LibraryItem = { id: uid(), tags: [], pinned: false, createdAt: Date.now(), updatedAt: Date.now(), ...item };
  const ok = library.set((p) => [full, ...p]);
  return ok ? full : null;
}

export const STARTER_FILES: Record<Project["type"], ProjectFile[]> = {
  web: [
    { path: "index.html", content: `<!doctype html>\n<html>\n  <head>\n    <link rel="stylesheet" href="style.css" />\n  </head>\n  <body>\n    <h1>Hello, CodeQuest</h1>\n    <button id="btn">Click me</button>\n    <script src="script.js"></script>\n  </body>\n</html>\n` },
    { path: "style.css", content: `body {\n  font-family: system-ui, sans-serif;\n  padding: 2rem;\n}\n` },
    { path: "script.js", content: `document.getElementById("btn").addEventListener("click", () => {\n  console.log("Button clicked");\n});\n` },
  ],
  python: [{ path: "main.py", content: `def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("CodeQuest"))\n` }],
  javascript: [
    { path: "main.js", content: `function add(a, b) {\n  return a + b;\n}\n\nconsole.log(add(2, 3));\n` },
    { path: "main.test.js", content: `test("adds two numbers", () => {\n  expect(2 + 3).toBe(5);\n});\n` },
  ],
  other: [{ path: "notes.md", content: "# Notes\n" }],
};

export function newProject(p: Partial<Project> & { name: string; type: Project["type"] }): Project {
  const proj: Project = {
    id: uid(),
    description: "",
    status: "active",
    requirements: "",
    notes: "",
    tasks: [],
    files: STARTER_FILES[p.type].map((f) => ({ ...f })),
    versions: [],
    conversationIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...p,
  };
  projects.set((prev) => [proj, ...prev]);
  return proj;
}

export function patchProject(id: string, patch: Partial<Project> | ((p: Project) => Partial<Project>)) {
  return projects.set((prev) =>
    prev.map((p) => (p.id === id ? { ...p, ...(typeof patch === "function" ? patch(p) : patch), updatedAt: Date.now() } : p))
  );
}

export function relTime(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
}
