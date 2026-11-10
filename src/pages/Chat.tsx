import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { Composer } from "../components/Composer";
import { ChatMessage } from "../components/Message";
import type { MessageAction } from "../components/Message";
import { Hint } from "../components/Hint";
import { useTutor } from "../hooks/useTutor";
import { useToast } from "../context/ToastContext";
import { useJourney } from "../context/JourneyContext";
import { addLibraryItem, conversations, library, newProject, patchConversation, patchProject, projects } from "../lib/store";
import type { Message, Mode } from "../lib/store";
import { EXPLAIN_STYLES, currentPolicy } from "../lib/ai";
import { modeMeta } from "../lib/modes";
import type { Page } from "../lib/nav";
import { cn } from "../utils/cn";

const TEACH_CONTROLS: { label: string; prompt: string }[] = [
  { label: "Explain", prompt: "Explain the current concept again, at my level." },
  { label: "Give an example", prompt: "Give me a concrete example of this." },
  { label: "Simplify", prompt: "Simplify that explanation." },
  { label: "Go deeper", prompt: "Go deeper — what's happening underneath?" },
  { label: "Give me a hint", prompt: "I'm stuck. Give me the next hint only — don't reveal the full answer." },
  { label: "Ask me a question", prompt: "Ask me one question to check my understanding." },
  { label: "Test me", prompt: "Test me with 3 short practice questions (mixed types). Wait for my answers before marking them." },
  { label: "Recap", prompt: "Recap this lesson in a few bullet points and suggest what I should learn next." },
];

export function Chat({
  convId,
  initialPrompt,
  onConsumed,
  onNavigate,
}: {
  convId: string;
  initialPrompt?: string;
  onConsumed: () => void;
  onNavigate: (p: Page, arg?: string) => void;
}) {
  const all = conversations.use();
  const lib = library.use();
  const conv = all.find((c) => c.id === convId);
  const { send, regenerate, cancel, branch, isBusy } = useTutor();
  const { toast } = useToast();
  const { mark, has } = useJourney();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const policy = currentPolicy();
  const busy = conv ? isBusy(conv.id) : false;

  useEffect(() => {
    if (initialPrompt && conv) {
      send(conv.id, initialPrompt);
      mark("first_message");
      onConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, conv?.id]);

  const last = conv?.messages[conv.messages.length - 1];
  const streamKey = last ? last.content.length + last.status : "";
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [streamKey, conv?.messages.length]);

  if (!conv)
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <p className="font-display text-[22px] text-primary">Conversation not found</p>
          <p className="mt-1 text-[13px] text-secondary">It may have been deleted.</p>
          <button onClick={() => onNavigate("home")} className="mt-4 text-[13px] font-medium text-accent">Back to Home</button>
        </div>
      </div>
    );

  const meta = modeMeta(conv.mode);
  const doSend = (text: string, atts: Message["attachments"] = []) => {
    send(conv.id, text, atts);
    if (has("first_message")) mark("second_message");
    mark("first_message");
  };

  const isPinned = (m: Message) => lib.some((i) => i.pinned && i.source?.messageId === m.id);

  const onAction = (a: MessageAction, m: Message) => {
    switch (a) {
      case "retry":
      case "regenerate":
        return regenerate(conv.id);
      case "save": {
        const ok = addLibraryItem({ kind: "note", title: conv.title, content: m.content, source: { conversationId: conv.id, messageId: m.id } });
        return toast(ok ? { title: "Saved to Library", tone: "success", action: { label: "Open", onClick: () => onNavigate("library") } } : { title: "Couldn't save", detail: "Browser storage is full or unavailable." });
      }
      case "pin": {
        const existing = lib.find((i) => i.pinned && i.source?.messageId === m.id);
        if (existing) {
          library.set((p) => p.filter((i) => i.id !== existing.id));
          return toast({ title: "Unpinned" });
        }
        const ok = addLibraryItem({ kind: "response", pinned: true, title: conv.title, content: m.content, source: { conversationId: conv.id, messageId: m.id } });
        return toast(ok ? { title: "Pinned to Library", tone: "success" } : { title: "Couldn't pin", detail: "Storage unavailable." });
      }
      case "differently":
        return doSend("Explain that differently — use another angle or analogy.");
      case "simplify":
        return doSend("Simplify that explanation.");
      case "practice":
        return doSend("Create 3 practice questions on this (one multiple-choice, one predict-the-output, one short coding task), with difficulty labels. Don't show answers until I respond.");
      case "diagram":
        return onNavigate("visualise", `Create a diagram that explains:\n\n${m.content.slice(0, 1200)}`);
      case "lesson":
        patchConversation(conv.id, { mode: "learn" as Mode });
        return doSend("Let's continue this as a guided lesson. Start by checking what I already understand.");
      case "branch": {
        const b = branch(conv.id, m.id);
        if (b) {
          toast({ title: "Branched conversation", detail: "The original is unchanged." });
          onNavigate("chat", b.id);
        }
        return;
      }
      case "project": {
        const blocks = [...m.content.matchAll(/```(\w+)?\n([\s\S]*?)```/g)];
        if (!blocks.length) return;
        const ext: Record<string, string> = { python: "py", py: "py", javascript: "js", js: "js", typescript: "ts", ts: "ts", html: "html", css: "css", json: "json" };
        let proj = conv.projectId ? projects.get().find((p) => p.id === conv.projectId) : projects.get().find((p) => p.status === "active");
        if (!proj) proj = newProject({ name: "Scratchpad", type: "javascript", description: "Code collected from Lumen conversations" });
        const target = proj;
        const files = blocks.map((b, i) => ({ path: `lumen-snippet-${Date.now().toString(36)}-${i + 1}.${ext[(b[1] ?? "").toLowerCase()] ?? "txt"}`, content: b[2] }));
        const ok = patchProject(target.id, (p) => ({ files: [...p.files, ...files], conversationIds: Array.from(new Set([...p.conversationIds, conv.id])) }));
        return toast(ok ? { title: `Added ${files.length} file${files.length > 1 ? "s" : ""} to ${target.name}`, tone: "success", action: { label: "Open", onClick: () => onNavigate("code", target.id) } } : { title: "Couldn't add to project", detail: "Storage unavailable." });
      }
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* conversation strip */}
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border bg-app/80 px-4 py-2 backdrop-blur md:px-6">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[12px] font-medium text-primary">
          <meta.icon className="size-3.5 text-accent" /> {meta.title}
        </span>
        {conv.mode === "learn" && (
          <select
            value={conv.explainStyle ?? "beginner"}
            onChange={(e) => patchConversation(conv.id, { explainStyle: e.target.value })}
            aria-label="Explanation style"
            className="h-7 cursor-pointer rounded-md border border-border bg-surface px-2 text-[12px] text-secondary outline-none hover:border-strong"
          >
            {EXPLAIN_STYLES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => patchConversation(conv.id, { useContext: !conv.useContext })}
          title={conv.useContext ? "Lumen is using your saved learning context" : "This conversation doesn't use saved learning context"}
          className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors", conv.useContext ? "border-border text-secondary hover:border-strong" : "border-warn/40 text-warn")}
        >
          {conv.useContext ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          {conv.useContext ? "Learning context on" : "Context off"}
        </button>
        {conv.branchedFrom && <span className="text-[11.5px] text-muted">Branched conversation</span>}
      </div>

      {policy.policy !== "open" && (
        <div className="flex flex-none items-start gap-2 border-b border-warn/30 bg-warn/[0.07] px-4 py-2 text-[12.5px] text-secondary md:px-6">
          <ShieldAlert className="mt-0.5 size-3.5 flex-none text-warn" />
          {policy.policy === "prohibited"
            ? policy.reason ?? "AI assistance is disabled during this competition or assessment."
            : "Review-only mode: Lumen can explain concepts and review your work, but won't solve active assessment questions."}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={() => {
            const el = scrollRef.current!;
            const d = el.scrollHeight - el.scrollTop - el.clientHeight;
            pinnedRef.current = d < 90;
            setShowJump(d > 260);
          }}
          className="h-full overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-3xl space-y-7 px-5 pb-8 pt-7">
            {conv.messages.length === 0 && (
              <div className="animate-fade-up pt-10 text-center">
                <p className="font-display text-[28px] text-primary">{meta.title}</p>
                <p className="mt-1.5 text-[13.5px] text-secondary">{meta.desc}.</p>
              </div>
            )}
            {conv.messages.map((m, i) => (
              <ChatMessage key={m.id} message={m} isLast={i === conv.messages.length - 1} onAction={onAction} pinned={isPinned(m)} />
            ))}
          </div>
        </div>
        <button
          onClick={() => {
            pinnedRef.current = true;
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          }}
          className={cn("absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-md border border-strong bg-surface px-2.5 py-1.5 text-[12px] text-secondary shadow-float transition-all", showJump ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0")}
        >
          <ArrowDown className="size-3.5" /> Jump to latest
        </button>
      </div>

      <div className="flex-none px-4 pb-4 md:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {conv.mode === "learn" && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar" aria-label="Teaching controls">
              {TEACH_CONTROLS.map((t) => (
                <button
                  key={t.label}
                  disabled={busy}
                  onClick={() => doSend(t.prompt)}
                  className="ring-focus inline-flex h-7 flex-none items-center rounded-md border border-border bg-surface px-2.5 text-[12px] text-secondary transition-colors hover:border-strong hover:text-primary disabled:opacity-40"
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {conv.messages.length > 1 && <Hint id="chat.actions">Responses have actions underneath: save, pin, branch, turn into a diagram, or continue as a lesson.</Hint>}
          <Composer
            onSend={doSend}
            onStop={() => cancel(conv.id)}
            isBusy={busy}
            autoFocus
            placeholder={meta.placeholder}
            mode={conv.mode}
            onModeChange={(mode) => patchConversation(conv.id, { mode })}
          />
          <p className="text-center text-[11px] text-muted">Lumen can make mistakes. Check important facts and run code yourself.</p>
        </div>
      </div>
    </div>
  );
}
