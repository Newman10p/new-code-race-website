import { useCallback, useSyncExternalStore } from "react";
import { NotConnectedError, buildSystemPrompt, currentPolicy, streamChat } from "../lib/ai";
import { conversations, patchConversation, projects, settings, uid } from "../lib/store";
import type { Attachment, Conversation, Message } from "../lib/store";
import { languageMeta, toolMeta } from "../lib/aiTools";
import type { AiLanguage, ToolId } from "../lib/aiTools";
import { buildDemoReply } from "../lib/aiDemo";
import { useProfile } from "../context/ProfileContext";
import { useConnection } from "./useTutor";

/* =========================================================================
 * CODE RACE AI conversation engine.
 *
 * Real path: the existing /models + streaming /chat client — unchanged, no
 * API keys in the browser. Demo path: clearly-labelled local samples with a
 * simulated stream so the interface can be evaluated without a backend.
 * In-flight work is module-scoped, so it survives navigation.
 * ========================================================================= */

type Runner = { cancel: () => void };
const runners = new Map<string, Runner>();
const listeners = new Set<() => void>();
let snapshot: string[] = [];
const emit = () => {
  snapshot = [...runners.keys()];
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getBusy = () => snapshot;

function updateMsg(convId: string, msgId: string, patch: (m: Message) => Partial<Message>) {
  conversations.set((all) =>
    all.map((c) =>
      c.id !== convId
        ? c
        : { ...c, updatedAt: Date.now(), messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch(m) } : m)) }
    )
  );
}

function titleFrom(text: string) {
  const clean = text
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/[#*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > 54 ? clean.slice(0, 54).trimEnd() + "…" : clean || "New conversation";
}

function hasUserMessage(conv: Conversation | undefined) {
  return !!conv?.messages.some((m) => m.role === "user");
}

function contextExtra(conv: Conversation, language: AiLanguage) {
  const parts = [
    "You are CODE RACE AI, the coding assistant inside the CODE RACE platform. If any earlier instruction names a different assistant or platform, this identity takes precedence.",
    `The user's selected language for this session is ${languageMeta(language).label}. Use it unless they say otherwise.`,
  ];
  if (conv.topic?.trim()) parts.push(`Current learning topic: ${conv.topic.trim()}`);
  if (conv.projectId) {
    const project = projects.get().find((p) => p.id === conv.projectId);
    if (project) {
      parts.push(
        `PROJECT CONTEXT (real, from the user's workspace): "${project.name}" (${project.type}). Description: ${
          project.description || "none given"
        }. Files: ${project.files.map((f) => f.path).join(", ") || "none"}. Reference these files by name; never invent files.`
      );
    }
  }
  return parts.join("\n");
}

export interface RespondOptions {
  tool: ToolId;
  language: AiLanguage;
}

export function useRaceChat() {
  const { profile } = useProfile();
  const conn = useConnection();
  const busy = useSyncExternalStore(subscribe, getBusy, getBusy);

  const connected = conn.status === "ok" && conn.models.some((m) => m.available);
  const activeModel =
    conn.status === "ok"
      ? conn.models.find((m) => m.available && m.id === settings.get().model)?.id ??
        conn.models.find((m) => m.available)?.id ??
        ""
      : "";

  const respond = useCallback(
    async (conv: Conversation, history: Message[], opts: RespondOptions) => {
      if (runners.has(conv.id)) return;
      const tool = toolMeta(opts.tool);
      const policy = currentPolicy();
      const demo = !connected;

      const assistant: Message = {
        id: uid(),
        role: "assistant",
        content: "",
        status: "pending",
        createdAt: Date.now(),
        tool: opts.tool,
        demo,
        model: connected ? activeModel : undefined,
      };
      patchConversation(conv.id, { messages: [...history, assistant], aiTool: opts.tool, language: opts.language });

      if (policy.policy === "prohibited") {
        updateMsg(conv.id, assistant.id, () => ({
          status: "failed",
          error: policy.reason ?? "AI assistance is disabled by the current CODE RACE competition or assessment policy.",
        }));
        return;
      }

      /* ---------------- demo stream (clearly not a model) ---------------- */
      if (demo) {
        const full = buildDemoReply(opts.tool, opts.language, history.filter((m) => m.role === "user").pop()?.content ?? "");
        const tokens = full.match(/\s+|\S+/g) ?? [];
        let index = 0;
        let written = "";
        let timer: ReturnType<typeof setTimeout> | null = null;
        let cancelled = false;

        const finish = (cancelledByUser: boolean) => {
          if (timer) clearTimeout(timer);
          timer = null;
          runners.delete(conv.id);
          emit();
          updateMsg(conv.id, assistant.id, () => ({
            content: written,
            status: cancelledByUser ? "cancelled" : "done",
          }));
        };

        const tick = () => {
          if (cancelled) return finish(true);
          if (!conversations.get().some((c) => c.id === conv.id)) {
            runners.delete(conv.id);
            emit();
            return;
          }
          const next = Math.min(tokens.length, index + 4);
          written += tokens.slice(index, next).join("");
          index = next;
          updateMsg(conv.id, assistant.id, () => ({ content: written, status: "streaming" }));
          if (index < tokens.length) timer = setTimeout(tick, 18);
          else finish(false);
        };

        runners.set(conv.id, {
          cancel: () => {
            cancelled = true;
          },
        });
        emit();
        timer = setTimeout(tick, 420);
        return;
      }

      /* ---------------- real stream ---------------- */
      const ctrl = new AbortController();
      runners.set(conv.id, { cancel: () => ctrl.abort() });
      emit();

      const system = buildSystemPrompt({
        mode: tool.mode,
        profile,
        useContext: conv.useContext,
        explainStyle: conv.explainStyle,
        extra: [tool.instruction, contextExtra(conv, opts.language), policy.policy === "review_only"
          ? "POLICY: review only. Explain concepts and review submitted work, but do not produce solutions to active assessment questions."
          : ""]
          .filter(Boolean)
          .join("\n\n"),
      });

      let buffer = "";
      let flushT: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        flushT = null;
        const content = buffer;
        updateMsg(conv.id, assistant.id, () => ({ content, status: "streaming" }));
      };

      try {
        await streamChat({
          model: activeModel,
          system,
          messages: history.filter((m) => m.status === "done" || m.role === "user"),
          signal: ctrl.signal,
          onDelta: (d) => {
            buffer += d;
            if (!flushT) flushT = setTimeout(flush, 40);
          },
        });
        if (flushT) clearTimeout(flushT);
        const content = buffer;
        updateMsg(conv.id, assistant.id, () => ({
          content,
          status: content ? "done" : "failed",
          error: content ? undefined : "The backend returned an empty response.",
          model: activeModel,
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
        runners.delete(conv.id);
        emit();
      }
    },
    [activeModel, connected, profile]
  );

  const send = useCallback(
    (convId: string, text: string, attachments: Attachment[], opts: RespondOptions) => {
      const conv = conversations.get().find((c) => c.id === convId);
      if (!conv || runners.has(convId)) return;
      const user: Message = { id: uid(), role: "user", content: text, status: "done", attachments, createdAt: Date.now() };
      const history = [...conv.messages, user];
      if (!hasUserMessage(conv)) patchConversation(conv.id, { title: titleFrom(text) });
      void respond(conv, history, opts);
    },
    [respond]
  );

  const regenerate = useCallback(
    (convId: string) => {
      const conv = conversations.get().find((c) => c.id === convId);
      if (!conv || runners.has(convId)) return;
      const msgs = [...conv.messages];
      while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
      if (!msgs.length) return;
      void respond(
        conv,
        msgs,
        { tool: conv.aiTool ?? "auto", language: conv.language ?? "javascript" }
      );
    },
    [respond]
  );

  const retry = useCallback(
    (convId: string, msgId: string) => {
      const conv = conversations.get().find((c) => c.id === convId);
      if (!conv || runners.has(convId)) return;
      const idx = conv.messages.findIndex((m) => m.id === msgId);
      if (idx < 0) return;
      const history = conv.messages.slice(0, idx);
      if (!history.some((m) => m.role === "user")) return;
      void respond(conv, history, { tool: conv.aiTool ?? "auto", language: conv.language ?? "javascript" });
    },
    [respond]
  );

  const editAndResend = useCallback(
    (convId: string, msgId: string, text: string) => {
      const conv = conversations.get().find((c) => c.id === convId);
      if (!conv || runners.has(convId)) return;
      const idx = conv.messages.findIndex((m) => m.id === msgId);
      if (idx < 0) return;
      const history = conv.messages.slice(0, idx + 1).map((m) => (m.id === msgId ? { ...m, content: text } : m));
      if (idx === 0) patchConversation(convId, { title: titleFrom(text) });
      void respond(conv, history, { tool: conv.aiTool ?? "auto", language: conv.language ?? "javascript" });
    },
    [respond]
  );

  const feedback = useCallback((convId: string, msgId: string, value: "up" | "down") => {
    updateMsg(convId, msgId, (m) => ({ feedback: m.feedback === value ? undefined : value }));
  }, []);

  const stop = useCallback((convId: string) => {
    runners.get(convId)?.cancel();
  }, []);

  return {
    send,
    regenerate,
    retry,
    editAndResend,
    feedback,
    stop,
    connected,
    activeModel,
    busy,
    isBusy: (id: string | undefined) => !!id && busy.includes(id),
  };
}
