import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { NotConnectedError, buildSystemPrompt, checkConnection, currentPolicy, streamChat } from "../lib/ai";
import type { Connection } from "../lib/ai";
import { conversations, patchConversation, settings, uid } from "../lib/store";
import type { Attachment, Conversation, Message } from "../lib/store";
import { useProfile } from "../context/ProfileContext";

/* In-flight requests live at module scope so streaming survives navigation. */
const inflight = new Map<string, AbortController>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
let snapshot: string[] = [];
const getBusy = () => snapshot;
const setBusy = () => {
  snapshot = [...inflight.keys()];
  emit();
};

/* ---------------- connection (shared) ---------------- */
let conn: Connection = { status: "checking" };
const connListeners = new Set<() => void>();
export async function refreshConnection() {
  conn = { status: "checking" };
  connListeners.forEach((l) => l());
  conn = await checkConnection();
  if (conn.status === "ok") {
    const avail = conn.models.filter((m) => m.available);
    const cur = settings.get().model;
    if (!avail.some((m) => m.id === cur)) settings.set((s) => ({ ...s, model: avail[0]?.id ?? "" }));
  }
  connListeners.forEach((l) => l());
}
let started = false;
export function useConnection(): Connection {
  const c = useSyncExternalStore(
    (l) => (connListeners.add(l), () => connListeners.delete(l)),
    () => conn
  );
  useEffect(() => {
    if (!started) {
      started = true;
      void refreshConnection();
    }
  }, []);
  return c;
}

/* ---------------- tutor ---------------- */

function title(text: string) {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 48 ? t.slice(0, 48).trimEnd() + "…" : t || "New conversation";
}

function updateMsg(convId: string, msgId: string, patch: (m: Message) => Partial<Message>) {
  conversations.set((all) =>
    all.map((c) =>
      c.id !== convId ? c : { ...c, updatedAt: Date.now(), messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch(m) } : m)) }
    )
  );
}

export function useTutor() {
  const { profile } = useProfile();
  const busy = useSyncExternalStore(subscribe, getBusy);

  const run = useCallback(
    async (conv: Conversation, history: Message[], extra?: string) => {
      const policy = currentPolicy();
      const assistant: Message = { id: uid(), role: "assistant", content: "", status: "pending", createdAt: Date.now() };
      patchConversation(conv.id, { messages: [...history, assistant] });

      if (policy.policy === "prohibited") {
        updateMsg(conv.id, assistant.id, () => ({
          status: "failed",
          error: policy.reason ?? "AI assistance is disabled by the current CodeQuest competition or assessment policy.",
        }));
        return;
      }

      const ctrl = new AbortController();
      inflight.set(conv.id, ctrl);
      setBusy();
      const model = settings.get().model;
      const system = buildSystemPrompt({
        mode: conv.mode,
        profile,
        useContext: conv.useContext,
        explainStyle: conv.explainStyle,
        extra: [
          extra,
          policy.policy === "review_only"
            ? "POLICY: review only. Explain concepts and review submitted work, but do not produce solutions to active assessment questions."
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      });

      let buffer = "";
      let flushT: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        flushT = null;
        const content = buffer;
        updateMsg(conv.id, assistant.id, () => ({ content, status: "streaming", model }));
      };

      try {
        await streamChat({
          model,
          system,
          messages: history.filter((m) => m.status === "done" || m.role === "user"),
          signal: ctrl.signal,
          onDelta: (d) => {
            buffer += d;
            if (!flushT) flushT = setTimeout(flush, 40); // batch writes for smooth streaming
          },
        });
        if (flushT) clearTimeout(flushT);
        const content = buffer;
        updateMsg(conv.id, assistant.id, () => ({
          content,
          status: content ? "done" : "failed",
          error: content ? undefined : "The backend returned an empty response.",
          model,
        }));
      } catch (e) {
        if (flushT) clearTimeout(flushT);
        const content = buffer;
        if ((e as Error).name === "AbortError") {
          updateMsg(conv.id, assistant.id, () => ({ content, status: "cancelled" }));
        } else {
          updateMsg(conv.id, assistant.id, () => ({
            content,
            status: "failed",
            error: e instanceof NotConnectedError ? e.message : (e as Error).message || "Request failed",
          }));
        }
      } finally {
        inflight.delete(conv.id);
        setBusy();
      }
    },
    [profile]
  );

  const send = useCallback(
    (convId: string, text: string, attachments?: Attachment[], extra?: string) => {
      const conv = conversations.get().find((c) => c.id === convId);
      if (!conv || inflight.has(convId)) return;
      const user: Message = { id: uid(), role: "user", content: text, status: "done", attachments, createdAt: Date.now() };
      const history = [...conv.messages, user];
      if (conv.messages.length === 0) patchConversation(conv.id, { title: title(text) });
      void run({ ...conv }, history, extra);
    },
    [run]
  );

  const regenerate = useCallback(
    (convId: string) => {
      const conv = conversations.get().find((c) => c.id === convId);
      if (!conv || inflight.has(convId)) return;
      const msgs = [...conv.messages];
      while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
      if (!msgs.length) return;
      void run(conv, msgs);
    },
    [run]
  );

  const cancel = useCallback((convId: string) => inflight.get(convId)?.abort(), []);

  const branch = useCallback((convId: string, upToMsgId: string): Conversation | null => {
    const conv = conversations.get().find((c) => c.id === convId);
    if (!conv) return null;
    const idx = conv.messages.findIndex((m) => m.id === upToMsgId);
    const copy: Conversation = {
      ...conv,
      id: uid(),
      title: `${conv.title} (branch)`,
      pinned: false,
      branchedFrom: conv.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: conv.messages.slice(0, idx + 1).map((m) => ({ ...m, id: uid() })),
    };
    conversations.set((p) => [copy, ...p]);
    return copy;
  }, []);

  return { send, regenerate, cancel, branch, isBusy: (id: string) => busy.includes(id), busy };
}

/** Voice input via the Web Speech API — only ever started by an explicit click. */
export function useSpeechInput(onText: (t: string) => void) {
  type SR = { start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; interimResults: boolean; continuous: boolean; lang: string };
  const Ctor = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;
  const [state, setState] = useState<"idle" | "listening" | "denied" | "error" | "unsupported">(Ctor ? "idle" : "unsupported");
  const [rec, setRec] = useState<SR | null>(null);

  const start = () => {
    if (!Ctor) return setState("unsupported");
    const r = new Ctor();
    r.lang = navigator.language || "en-GB";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const t = Array.from(e.results).map((res) => res[0].transcript).join(" ");
      onText(t);
    };
    r.onerror = (e) => setState(e.error === "not-allowed" || e.error === "service-not-allowed" ? "denied" : "error");
    r.onend = () => setState((s) => (s === "listening" ? "idle" : s));
    setRec(r);
    setState("listening");
    r.start();
  };
  const stop = () => {
    rec?.stop();
    setState("idle");
  };
  return { state, start, stop };
}
