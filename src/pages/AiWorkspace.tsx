import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ChevronRight,
  FolderKanban,
  Info,
  Menu,
  PanelRight,
  PanelRightClose,
  Plus,
  Target,
} from "lucide-react";
import { cn } from "../utils/cn";
import { AiSidebar } from "../components/ai/AiSidebar";
import { AiWelcome } from "../components/ai/AiWelcome";
import { AiComposer } from "../components/ai/AiComposer";
import { AiMessage } from "../components/ai/AiMessage";
import { AiContextPanel } from "../components/ai/AiContextPanel";
import { ModelPicker } from "../components/ai/ModelPicker";
import { ConfirmDialog, HelpDialog, PreferencesDialog } from "../components/ai/AiDialogs";
import { useProfile } from "../context/ProfileContext";
import { useToast } from "../context/ToastContext";
import { useConnection } from "../hooks/useTutor";
import { useRaceChat } from "../hooks/useRaceChat";
import {
  conversations,
  newConversation,
  patchConversation,
  projects,
  settings,
} from "../lib/store";
import type { Attachment, Conversation } from "../lib/store";
import { languageFromProfile, languageMeta, toolMeta } from "../lib/aiTools";
import type { AiLanguage, PromptCard, ToolId } from "../lib/aiTools";
import type { Page } from "../lib/nav";

const KEYS = {
  last: "cr-ai-last-conversation",
  collapsed: "cr-ai-sidebar-collapsed",
  context: "cr-ai-context-open",
  tool: "cr-ai-draft-tool",
  language: "cr-ai-draft-language",
  topic: "cr-ai-draft-topic",
};

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: UI still works for this session */
  }
};
const isTool = (v: string | null): v is ToolId =>
  !!v && ["auto", "explain", "code", "debug", "review", "learn", "challenge"].includes(v);
const isLang = (v: string | null): v is AiLanguage => !!v && ["python", "javascript", "cpp"].includes(v);

export function AiWorkspace({
  convId,
  onNavigate,
}: {
  convId?: string;
  onNavigate: (p: Page, arg?: string) => void;
}) {
  const all = conversations.use();
  const allProjects = projects.use();
  const { profile } = useProfile();
  const { toast } = useToast();
  const conn = useConnection();
  const chat = useRaceChat();
  const s = settings.use();

  const [activeId, setActiveId] = useState<string | undefined>(() => {
    const exists = (id?: string | null) => !!id && conversations.get().some((c) => c.id === id);
    if (exists(convId)) return convId;
    const last = read(KEYS.last);
    return exists(last) ? last! : undefined;
  });
  const [draftTool, setDraftTool] = useState<ToolId>(() => {
    const stored = read(KEYS.tool);
    return isTool(stored) ? stored : "auto";
  });
  const [draftLanguage, setDraftLanguage] = useState<AiLanguage>(() => {
    const stored = read(KEYS.language);
    return isLang(stored) ? stored : languageFromProfile(profile.language);
  });
  const [draftTopic, setDraftTopic] = useState(() => read(KEYS.topic) ?? "");
  const [collapsed, setCollapsed] = useState(() => read(KEYS.collapsed) === "1");
  const [mobileNav, setMobileNav] = useState(false);
  const [contextOpen, setContextOpen] = useState(() => {
    const stored = read(KEYS.context);
    if (stored === "1") return true;
    if (stored === "0") return false;
    return typeof window !== "undefined" && window.innerWidth >= 1280;
  });
  const [contextMobile, setContextMobile] = useState(false);
  const [isWide, setIsWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1280);
  const [helpOpen, setHelpOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "delete" | "clear"; conv: Conversation } | null>(null);
  const [seed, setSeed] = useState<{ text: string; nonce: number } | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [showJump, setShowJump] = useState(false);

  const conv = all.find((c) => c.id === activeId);
  const tool = conv?.aiTool ?? draftTool;
  const language = conv?.language ?? draftLanguage;
  const topic = conv?.topic ?? draftTopic;
  const attachments = conv?.messages.flatMap((m) => m.attachments ?? []) ?? [];
  const currentProject = conv?.projectId;
  const projectName = currentProject ? allProjects.find((p) => p.id === currentProject)?.name ?? "Project" : "";
  const activeModelName =
    conn.status === "ok"
      ? conn.models.find((m) => m.available && m.id === s.model)?.name ??
        conn.models.find((m) => m.available)?.name ??
        "CODE RACE Auto"
      : "CODE RACE Auto";

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  /* ---------------- persistence ---------------- */
  useEffect(() => {
    write(KEYS.last, activeId ?? null);
  }, [activeId]);
  useEffect(() => write(KEYS.collapsed, collapsed ? "1" : "0"), [collapsed]);
  useEffect(() => write(KEYS.context, contextOpen ? "1" : "0"), [contextOpen]);
  useEffect(() => write(KEYS.tool, draftTool), [draftTool]);
  useEffect(() => write(KEYS.language, draftLanguage), [draftLanguage]);
  useEffect(() => write(KEYS.topic, draftTopic), [draftTopic]);

  /* ---------------- scroll behaviour ---------------- */
  const last = conv?.messages[conv.messages.length - 1];
  const messageCount = conv?.messages.length ?? 0;
  const streamKey = `${conv?.id ?? "none"}:${messageCount}:${last?.content.length ?? 0}:${last?.status ?? ""}`;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // The welcome screen is taller than a phone viewport: never autoscroll it.
    if (messageCount === 0) {
      el.scrollTop = 0;
      return;
    }
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [streamKey, messageCount]);

  useEffect(() => {
    pinnedRef.current = true;
    setShowJump(false);
  }, [activeId]);

  /* ---------------- handlers ---------------- */
  const setTool = useCallback(
    (next: ToolId) => {
      if (conv) patchConversation(conv.id, { aiTool: next });
      else setDraftTool(next);
      setFocusNonce((v) => v + 1);
    },
    [conv]
  );

  const setLanguage = useCallback(
    (next: AiLanguage) => {
      if (conv) patchConversation(conv.id, { language: next });
      else setDraftLanguage(next);
    },
    [conv]
  );

  const setTopic = useCallback(
    (next: string) => {
      if (conv) patchConversation(conv.id, { topic: next });
      else setDraftTopic(next);
    },
    [conv]
  );

  const newChat = useCallback(() => {
    setActiveId(undefined);
    setDraftTool("auto");
    setMobileNav(false);
    setContextMobile(false);
    setSeed(null);
    setFocusNonce((v) => v + 1);
  }, []);

  const send = useCallback(
    (text: string, atts: Attachment[]) => {
      let target = conv;
      if (!target) {
        target = newConversation(toolMeta(tool).mode, {
          aiTool: tool,
          language,
          topic: draftTopic || undefined,
          useContext: settings.get().personalisation,
        });
        setActiveId(target.id);
      }
      chat.send(target.id, text, atts, { tool, language });
      pinnedRef.current = true;
      setFocusNonce((v) => v + 1);
    },
    [chat, conv, tool, language, draftTopic]
  );

  const usePrompt = useCallback(
    (card: PromptCard) => {
      const nextLanguage = card.language ?? language;
      const nextTool = card.tool;
      let target = conv;
      if (!target) {
        target = newConversation(toolMeta(nextTool).mode, {
          aiTool: nextTool,
          language: nextLanguage,
          topic: draftTopic || undefined,
          useContext: settings.get().personalisation,
        });
        setActiveId(target.id);
      } else {
        patchConversation(target.id, { aiTool: nextTool, language: nextLanguage });
      }
      chat.send(target.id, card.prompt, [], { tool: nextTool, language: nextLanguage });
    },
    [chat, conv, language, draftTopic]
  );

  const prefill = useCallback((text: string) => {
    setSeed({ text, nonce: Date.now() });
    setContextMobile(false);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const onChange = () => setIsWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggleContext = useCallback(() => {
    if (!isWide) setContextMobile((v) => !v);
    else setContextOpen((v) => !v);
  }, [isWide]);

  const transcript = useCallback(() => {
    if (!conv) return "";
    const header = `# ${conv.title}\n\n*${toolMeta(conv.aiTool).label} · ${languageMeta(conv.language).label} · exported ${new Date().toLocaleString()}*\n`;
    const body = conv.messages
      .map((m) => {
        const who = m.role === "user" ? "You" : `CODE RACE AI${m.demo ? " (demo sample)" : ""}`;
        const files = m.attachments?.length
          ? `\n\n_Attachments: ${m.attachments.map((a) => a.name).join(", ")}_`
          : "";
        return `---\n\n### ${who}\n\n${m.content}${files}`;
      })
      .join("\n\n");
    return `${header}\n${body}\n`;
  }, [conv]);

  const copyTranscript = useCallback(async () => {
    const text = transcript();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Conversation copied", tone: "success" });
    } catch {
      toast({ title: "Couldn't copy", detail: "Clipboard access is blocked in this browser." });
    }
  }, [transcript, toast]);

  const exportTranscript = useCallback(() => {
    if (!conv) return;
    const text = transcript();
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${conv.title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "code-race-conversation"}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: "Conversation exported", detail: "Markdown file downloaded.", tone: "success" });
  }, [conv, transcript, toast]);

  const requestDelete = useCallback((target: Conversation) => setConfirm({ kind: "delete", conv: target }), []);
  const requestClear = useCallback(() => {
    if (conv) setConfirm({ kind: "clear", conv });
  }, [conv]);

  const removeConversation = useCallback(
    (target: Conversation) => {
      chat.stop(target.id);
      conversations.set((p) => p.filter((c) => c.id !== target.id));
      if (target.id === activeId) setActiveId(undefined);
      toast({
        title: "Conversation deleted",
        tone: "neutral",
        action: {
          label: "Undo",
          onClick: () => conversations.set((p) => [target, ...p]),
        },
      });
    },
    [activeId, chat, toast]
  );

  const clearConversation = useCallback(
    (target: Conversation) => {
      chat.stop(target.id);
      patchConversation(target.id, { messages: [], title: "New conversation" });
      toast({ title: "Conversation cleared", detail: "The context and settings were kept." });
    },
    [chat, toast]
  );

  const openPreferences = useCallback(() => setPreferencesOpen(true), []);

  /* ---------------- shortcuts ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (window.innerWidth < 1280) setMobileNav(true);
        else {
          setCollapsed(false);
          setTimeout(() => document.getElementById("cr-search")?.focus(), 80);
        }
      }
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newChat();
      }
      if (mod && e.key === "\\") {
        e.preventDefault();
        setCollapsed((v) => !v);
      }
      if (e.key === "Escape") {
        setMobileNav(false);
        setContextMobile(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat]);

  const showWelcome = !conv || conv.messages.length === 0;
  const busy = chat.isBusy(conv?.id);
  const contextVisible = isWide ? contextOpen : contextMobile;

  return (
    <div className="cr-ai flex h-full w-full overflow-hidden bg-app text-primary">
      <AiSidebar
        conversations={all}
        activeId={activeId}
        activeTool={tool}
        busy={chat.busy}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        mobileOpen={mobileNav}
        onCloseMobile={() => setMobileNav(false)}
        onSelect={(id) => {
          setActiveId(id);
          setMobileNav(false);
          pinnedRef.current = true;
        }}
        onNewChat={newChat}
        onTool={setTool}
        onRename={(id, title) => patchConversation(id, { title })}
        onDeleteRequest={requestDelete}
        onNavigate={(p) => onNavigate(p)}
        onHelp={() => setHelpOpen(true)}
        onPreferences={openPreferences}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 flex-none items-center gap-2 border-b border-border bg-app/95 px-2.5 sm:px-4">
          <button
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
            className="ring-focus flex size-8 flex-none items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary xl:hidden"
          >
            <Menu className="size-[18px]" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="hidden items-center gap-1 text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted sm:flex">
              <span>CODE RACE AI</span>
              <ChevronRight className="size-2.5 opacity-60" />
              <span className="text-[#a78bfa]/90">{toolMeta(tool).label}</span>
            </div>
            <h1 className="truncate text-[12.5px] font-medium leading-4 text-primary sm:mt-0.5">
              {conv?.title ?? "New conversation"}
            </h1>
          </div>

          <div className="flex flex-none items-center gap-1.5">
            <ModelPicker conn={conn} connected={chat.connected} onOpenPreferences={openPreferences} />
            <button
              onClick={newChat}
              aria-label="New chat"
              title="New chat (⌘N)"
              className="ring-focus hidden size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary sm:flex"
            >
              <Plus className="size-4" />
            </button>
            <button
              onClick={toggleContext}
              aria-label={contextVisible ? "Close context panel" : "Open context panel"}
              aria-pressed={contextVisible}
              title={contextVisible ? "Hide context panel" : "Show context panel"}
              className={cn(
                "ring-focus flex size-8 flex-none items-center justify-center rounded-md transition-colors",
                contextVisible ? "bg-accent-soft text-[#c4b5fd]" : "text-muted hover:bg-surface-2 hover:text-primary"
              )}
            >
              {contextVisible ? <PanelRightClose className="size-4" /> : <PanelRight className="size-4" />}
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1">
          <section className="relative flex min-w-0 flex-1 flex-col" aria-label="Conversation">
            <div className="cr-aurora pointer-events-none absolute inset-x-0 top-0 h-[380px] opacity-70" aria-hidden="true" />

            <div
              ref={scrollRef}
              role="log"
              aria-label="Conversation messages"
              onScroll={() => {
                const el = scrollRef.current!;
                const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
                pinnedRef.current = distance < 96;
                setShowJump(distance > 260);
              }}
              className="relative min-h-0 flex-1 overflow-y-auto"
            >
              {showWelcome ? (
                <AiWelcome
                  name={profile.nickname || profile.name}
                  connected={chat.connected}
                  modelLabel={activeModelName}
                  onPrompt={usePrompt}
                />
              ) : (
                <div className="mx-auto w-full max-w-[820px] space-y-6 px-3 pb-6 pt-5 sm:px-5 sm:pb-8 sm:pt-7">
                  {conv!.messages.map((m, i) => (
                    <AiMessage
                      key={m.id}
                      message={m}
                      isLast={i === conv!.messages.length - 1}
                      language={language}
                      onRegenerate={() => chat.regenerate(conv!.id)}
                      onRetry={() => chat.retry(conv!.id, m.id)}
                      onFeedback={(v) => {
                        chat.feedback(conv!.id, m.id, v);
                        toast({ title: v === "up" ? "Feedback saved" : "Feedback saved", detail: "Stored locally for this conversation." });
                      }}
                      onEdit={(text) => chat.editAndResend(conv!.id, m.id, text)}
                    />
                  ))}
                  <div className="h-2" />
                </div>
              )}
            </div>

            <button
              onClick={() => {
                pinnedRef.current = true;
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
                setShowJump(false);
              }}
              className={cn(
                "absolute bottom-[164px] left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-strong bg-surface px-3 py-1.5 text-[11px] text-secondary shadow-float transition-all",
                showJump ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"
              )}
            >
              <ArrowDown className="size-3.5" /> Jump to latest
            </button>

            <div className="relative flex-none px-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-4">
              <div className="mx-auto w-full max-w-[820px]">
                {(currentProject || topic.trim() || attachments.length > 0) && (
                  <div className="mb-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                    <span className="flex-none text-[9.5px] uppercase tracking-[0.1em] text-muted">Context</span>
                    {currentProject && (
                      <button
                        onClick={() => (isWide ? setContextOpen(true) : setContextMobile(true))}
                        className="inline-flex h-6 flex-none items-center gap-1 rounded-md border border-border bg-surface/60 px-1.5 text-[10px] text-secondary hover:border-strong hover:text-primary"
                      >
                        <FolderKanban className="size-2.5 text-[#a78bfa]" />
                        {projectName}
                      </button>
                    )}
                    {topic.trim() && (
                      <button
                        onClick={() => (isWide ? setContextOpen(true) : setContextMobile(true))}
                        className="inline-flex h-6 flex-none items-center gap-1 rounded-md border border-border bg-surface/60 px-1.5 text-[10px] text-secondary hover:border-strong hover:text-primary"
                      >
                        <Target className="size-2.5 text-[#67e8f9]" /> {topic.trim().slice(0, 34)}
                      </button>
                    )}
                    {attachments.length > 0 && (
                      <button
                        onClick={() => (isWide ? setContextOpen(true) : setContextMobile(true))}
                        className="inline-flex h-6 flex-none items-center gap-1 rounded-md border border-border bg-surface/60 px-1.5 text-[10px] text-secondary hover:border-strong hover:text-primary"
                      >
                        <Info className="size-2.5" /> {attachments.length} file{attachments.length === 1 ? "" : "s"}
                      </button>
                    )}
                    <button
                      onClick={() => (isWide ? setContextOpen(true) : setContextMobile(true))}
                      className="ml-auto flex-none text-[9.5px] text-muted hover:text-secondary"
                    >
                      View all
                    </button>
                  </div>
                )}

                <AiComposer
                  tool={tool}
                  language={language}
                  onTool={setTool}
                  onLanguage={setLanguage}
                  onSend={send}
                  onStop={() => conv && chat.stop(conv.id)}
                  isBusy={busy}
                  connected={chat.connected}
                  onOpenPreferences={openPreferences}
                  seed={seed}
                  onSeedConsumed={() => setSeed(null)}
                  focusNonce={focusNonce}
                />
              </div>
            </div>
          </section>

          {contextOpen && isWide && (
            <div className="hidden w-[304px] flex-none xl:block">
              <AiContextPanel
                conversation={conv}
                tool={tool}
                language={language}
                connected={chat.connected}
                modelLabel={activeModelName}
                topic={topic}
                useContext={conv?.useContext ?? settings.get().personalisation}
                onLanguage={setLanguage}
                onProject={(id) => conv && patchConversation(conv.id, { projectId: id })}
                onTopic={setTopic}
                onUseContext={(v) => conv && patchConversation(conv.id, { useContext: v })}
                onQuickTool={prefill}
                onCopyTranscript={copyTranscript}
                onExport={exportTranscript}
                onClearRequest={requestClear}
                onClose={() => setContextOpen(false)}
                onNavigate={onNavigate}
              />
            </div>
          )}
        </div>

        {contextMobile && !isWide && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/60 xl:hidden"
              onClick={() => setContextMobile(false)}
              aria-hidden="true"
            />
            <div className="animate-slide-in-right fixed inset-y-0 right-0 z-50 w-[320px] max-w-[88vw] border-l border-border shadow-float xl:hidden">
              <div className="flex h-full flex-col bg-sidebar">
                <AiContextPanel
                  mobile
                  conversation={conv}
                  tool={tool}
                  language={language}
                  connected={chat.connected}
                  modelLabel={activeModelName}
                  topic={topic}
                  useContext={conv?.useContext ?? settings.get().personalisation}
                  onLanguage={setLanguage}
                  onProject={(id) => conv && patchConversation(conv.id, { projectId: id })}
                  onTopic={setTopic}
                  onUseContext={(v) => conv && patchConversation(conv.id, { useContext: v })}
                  onQuickTool={prefill}
                  onCopyTranscript={copyTranscript}
                  onExport={exportTranscript}
                  onClearRequest={requestClear}
                  onClose={() => setContextMobile(false)}
                  onNavigate={onNavigate}
                />
              </div>
            </div>
          </>
        )}
      </main>

      <PreferencesDialog
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        onOpenPlatformSettings={() => onNavigate("settings")}
      />

      <HelpDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        connected={chat.connected}
        modelLabel={activeModelName}
        onOpenPreferences={openPreferences}
      />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === "delete" ? "Delete this conversation?" : "Clear this conversation?"}
        description={
          confirm?.kind === "delete"
            ? `“${confirm.conv.title}” and its messages will be removed from this browser. You can undo immediately after.`
            : "All messages in this conversation will be removed. Language and context settings are kept."
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete conversation" : "Clear conversation"}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "delete") removeConversation(confirm.conv);
          else clearConversation(confirm.conv);
        }}
      />
      {chat.busy.length > 0 && <span className="sr-only" aria-live="polite">Generating a response</span>}
  </div>
);
}
