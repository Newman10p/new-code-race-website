import { contextItems, settings } from "./store";
import type { Message, Mode } from "./store";
import { buildTutorPrompt } from "./profile";
import type { Profile } from "./profile";

/* =========================================================================
 * Lumen AI client. Talks to a CodeQuest backend proxy that holds provider
 * keys server-side. Protocol (see docs/BACKEND.md):
 *   GET  {api}/models  -> { models: ModelInfo[] }
 *   POST {api}/chat    -> text/event-stream  `data: {"delta":"…"}` … `data: [DONE]`
 *                         (plain chunked text is also accepted)
 * No key is ever read or sent from the browser.
 * ========================================================================= */

export interface ModelInfo {
  id: string;
  name: string;
  available: boolean;
  capabilities: string[]; // e.g. ["text","vision","code"]
  limits?: string;
}

export type Connection =
  | { status: "not_configured" }
  | { status: "checking" }
  | { status: "ok"; models: ModelInfo[] }
  | { status: "error"; error: string };

export function apiUrl(): string {
  return (
    settings.get().apiUrl.trim() ||
    window.CODEQUEST?.apiUrl ||
    import.meta.env.VITE_LUMEN_API_URL ||
    ""
  ).replace(/\/$/, "");
}

export async function checkConnection(signal?: AbortSignal): Promise<Connection> {
  const base = apiUrl();
  if (!base) return { status: "not_configured" };
  try {
    const r = await fetch(`${base}/models`, { signal, credentials: "include" });
    if (!r.ok) return { status: "error", error: `Backend responded ${r.status}` };
    const j = (await r.json()) as { models?: ModelInfo[] };
    return { status: "ok", models: (j.models ?? []).filter((m) => m && m.id) };
  } catch (e) {
    if ((e as Error).name === "AbortError") return { status: "checking" };
    return { status: "error", error: "Could not reach the Lumen backend" };
  }
}

/* ---------------- policy (competitions / assessments) ---------------- */

export type Policy = "open" | "review_only" | "prohibited";
export function currentPolicy(): { policy: Policy; reason?: string } {
  const fromHost = window.CODEQUEST?.aiPolicy;
  const fromUrl = new URLSearchParams(window.location.search).get("ai_policy") as Policy | null;
  const policy = fromHost ?? (fromUrl && ["open", "review_only", "prohibited"].includes(fromUrl) ? fromUrl : "open");
  return { policy, reason: window.CODEQUEST?.policyReason };
}

/* ---------------- teaching intelligence: system prompts ---------------- */

const TEACHING_CORE = `You are Lumen, the CodeQuest learning companion. Your job is understanding, not answers.
Teaching cycle — TEACH (explain), GUIDE (questions and hints), PRACTISE (exercises), ASSESS (evaluate and recommend the next step).
Progressive assistance when a student is stuck: 1) ask what they tried, 2) conceptual hint, 3) point to the principle, 4) partial example, 5) full walkthrough only if still needed or explicitly requested.
If you notice a misconception (e.g. assignment vs equality, loop bounds, variable scope, frontend vs backend responsibilities), name it respectfully and give one targeted exercise.
Use Markdown: headings, lists, tables, fenced code with language tags, and $…$ / $$…$$ for maths. Use diagrams only when they genuinely help.
Never claim to have run code, saved files or accessed data you were not given. Lumen practice is never part of official CodeQuest scores — label generated exercises as practice.`;

const MODE_PROMPTS: Record<Mode, string> = {
  ask: `MODE: Ask. Answer the question clearly and accurately at the student's level. End with one useful follow-up the student could explore.`,
  learn: `MODE: Learn — you are conducting a private lesson. Sequence: establish what they know → introduce → explain at their level → demonstrate → ask them to apply → identify misunderstandings → correct → check understanding → recommend next step. Keep turns short and interactive; ask one question at a time. Do not reveal full solutions to exercises the student is attempting unless they explicitly ask.`,
  code: `MODE: Code. The student's open file, and the latest real execution output when present, are included. Refer to specific line numbers. Prefer explaining the bug and hinting at the fix before rewriting their code. When you do provide code, give complete, runnable snippets.`,
  visualise: `MODE: Visualise. When asked for a diagram, reply with a short explanation followed by ONE fenced \`\`\`json block: {"title": string, "type": string, "nodes":[{"id":string,"label":string,"detail":string}], "edges":[{"from":string,"to":string,"label"?:string}], "steps"?: string[]}. Keep to 3–14 nodes. "steps" lists node ids in execution order when the process can be animated.`,
  build: `MODE: Build. You are guiding a project from idea to working code. Clarify requirements first, then propose a plan as a Markdown checklist using "- [ ] task" lines, wait for approval, then build iteratively. Explain significant implementation decisions briefly so the student learns.`,
};

const STYLE_PROMPTS: Record<string, string> = {
  beginner: "Explanation style: beginner-friendly. Define jargon on first use.",
  steps: "Explanation style: step-by-step, numbered.",
  technical: "Explanation style: technical and detailed; include trade-offs and edge cases.",
  analogy: "Explanation style: lead with an accurate analogy, then the precise explanation.",
  practical: "Explanation style: practical and example-driven; show working code early.",
};

export function buildSystemPrompt(opts: {
  mode: Mode;
  profile: Profile;
  useContext: boolean;
  explainStyle?: string;
  extra?: string;
}): string {
  const parts = [TEACHING_CORE, MODE_PROMPTS[opts.mode]];
  if (opts.explainStyle && STYLE_PROMPTS[opts.explainStyle]) parts.push(STYLE_PROMPTS[opts.explainStyle]);
  if (opts.useContext) {
    parts.push("PERSISTENT LEARNING CONTEXT (provided by the student; may be corrected by them):\n" + buildTutorPrompt(opts.profile));
    const items = contextItems.get().filter((c) => c.enabled);
    if (items.length) parts.push("Additional context items:\n" + items.map((i) => `- ${i.label}: ${i.value}`).join("\n"));
  } else {
    parts.push("The student has chosen not to share saved learning context for this conversation. Use only what is said here.");
  }
  if (opts.extra) parts.push(opts.extra);
  return parts.join("\n\n");
}

export const EXPLAIN_STYLES = [
  { id: "beginner", label: "Beginner-friendly" },
  { id: "steps", label: "Step-by-step" },
  { id: "technical", label: "Technical" },
  { id: "analogy", label: "Analogy-based" },
  { id: "practical", label: "Practical" },
];

/* ---------------- streaming ---------------- */

export class NotConnectedError extends Error {
  constructor() {
    super("Lumen isn't connected to an AI backend yet.");
    this.name = "NotConnectedError";
  }
}

export async function streamChat(opts: {
  model: string;
  system: string;
  messages: Pick<Message, "role" | "content" | "attachments">[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
}): Promise<void> {
  const base = apiUrl();
  if (!base) throw new NotConnectedError();

  const body = {
    model: opts.model,
    system: opts.system,
    messages: opts.messages.map((m) => ({
      role: m.role,
      content: [
        m.content,
        ...(m.attachments ?? [])
          .filter((a) => a.kind === "text")
          .map((a) => `\n\n[Attached file: ${a.name}]\n\`\`\`\n${a.data}\n\`\`\``),
      ].join(""),
      images: (m.attachments ?? []).filter((a) => a.kind === "image").map((a) => a.data),
    })),
  };

  const r = await fetch(`${base}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    credentials: "include",
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!r.ok || !r.body) {
    let detail = "";
    try {
      detail = ((await r.json()) as { error?: string }).error ?? "";
    } catch {
      /* noop */
    }
    throw new Error(detail || `The backend returned ${r.status}`);
  }

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  const sse = (r.headers.get("content-type") ?? "").includes("event-stream");
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value, { stream: true });
    if (!sse) {
      opts.onDelta(chunk);
      continue;
    }
    buf += chunk;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data) as { delta?: string; error?: string };
        if (j.error) throw new Error(j.error);
        if (j.delta) opts.onDelta(j.delta);
      } catch (e) {
        if (e instanceof SyntaxError) opts.onDelta(data);
        else throw e;
      }
    }
  }
}

/** Extract the first fenced JSON block from a response (used by Visualise). */
export function extractJson<T>(text: string): T | null {
  const m = text.match(/```json\s*([\s\S]*?)```/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as T;
  } catch {
    return null;
  }
}
