import { useMemo } from "react";
import {
  ChevronDown,
  Copy,
  Download,
  FileCode2,
  FolderKanban,
  Image as ImageIcon,
  Info,
  Languages,
  Paperclip,
  Target,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { projects } from "../../lib/store";
import type { Conversation } from "../../lib/store";
import {
  AI_LANGUAGES,
  QUICK_TOOLS,
  languageMeta,
  toolMeta,
} from "../../lib/aiTools";
import type { AiLanguage, ToolId } from "../../lib/aiTools";
import type { Page } from "../../lib/nav";
import { Switch } from "./primitives";

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border/70 px-4 py-3.5 last:border-b-0">
      <p className="mb-2.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted/80">{title}</p>
      {children}
    </section>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-muted">
        <span className="text-muted/80">{icon}</span>
        {label}
      </div>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        disabled={disabled}
        className="h-7 w-full cursor-pointer appearance-none rounded-md border border-border bg-surface/70 pl-2 pr-7 text-[11.5px] text-primary outline-none transition-colors hover:border-strong focus:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function AiContextPanel({
  conversation,
  tool,
  language,
  connected,
  modelLabel,
  topic,
  useContext,
  onLanguage,
  onProject,
  onTopic,
  onUseContext,
  onQuickTool,
  onCopyTranscript,
  onExport,
  onClearRequest,
  onClose,
  onNavigate,
  mobile,
}: {
  conversation?: Conversation;
  tool: ToolId;
  language: AiLanguage;
  connected: boolean;
  modelLabel: string;
  topic: string;
  useContext: boolean;
  onLanguage: (l: AiLanguage) => void;
  onProject: (id?: string) => void;
  onTopic: (v: string) => void;
  onUseContext: (v: boolean) => void;
  onQuickTool: (prompt: string) => void;
  onCopyTranscript: () => void;
  onExport: () => void;
  onClearRequest: () => void;
  onClose: () => void;
  onNavigate: (page: Page) => void;
  mobile?: boolean;
}) {
  const allProjects = projects.use();
  const activeProjects = useMemo(
    () => allProjects.filter((p) => p.status !== "archived").sort((a, b) => b.updatedAt - a.updatedAt),
    [allProjects]
  );

  const attachments = useMemo(() => {
    const map = new Map<string, { id: string; name: string; kind: "text" | "image"; size: number }>();
    conversation?.messages.forEach((m) => m.attachments?.forEach((a) => map.set(a.id, a)));
    return [...map.values()];
  }, [conversation]);

  const messageCount = conversation?.messages.length ?? 0;
  const lang = languageMeta(language);
  const toolInfo = toolMeta(tool);
  const hasMessages = messageCount > 0;

  return (
    <aside
      aria-label="Conversation context"
      className={cn(
        "flex h-full w-full flex-col bg-sidebar",
        !mobile && "border-l border-border"
      )}
    >
      <div className="flex h-14 flex-none items-center gap-2 border-b border-border px-4">
        <span className="text-[12px] font-semibold tracking-[0.01em] text-primary">Context</span>
        <span className="rounded-[3px] border border-border bg-surface px-1 py-px text-[9px] font-medium uppercase tracking-[0.1em] text-muted">
          Panel
        </span>
        <span className="flex-1" />
        <button
          onClick={onClose}
          aria-label="Close context panel"
          className="ring-focus flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-primary"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Current context">
          <Field icon={<Languages className="size-3" />} label="Programming language">
            <Select
              ariaLabel="Programming language"
              value={language}
              onChange={(v) => onLanguage(v as AiLanguage)}
              options={AI_LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
            />
          </Field>

          <Field icon={<Trophy className="size-3" />} label="Active challenge">
            <div className="rounded-md border border-dashed border-border bg-surface/40 px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-muted/60" />
                <span className="text-[11.5px] text-secondary">Not connected</span>
              </div>
              <p className="mt-1 text-[10.5px] leading-4 text-muted">
                Challenges you open in the CODE RACE arena will attach here automatically.
              </p>
            </div>
          </Field>

          <Field icon={<FolderKanban className="size-3" />} label="Current project">
            {activeProjects.length > 0 ? (
              <Select
                ariaLabel="Current project"
                value={conversation?.projectId ?? ""}
                onChange={(v) => onProject(v || undefined)}
                disabled={!conversation}
                options={[{ value: "", label: "No project attached" }, ...activeProjects.map((p) => ({ value: p.id, label: p.name }))]}
              />
            ) : (
              <div className="rounded-md border border-dashed border-border bg-surface/40 px-2.5 py-2">
                <p className="text-[11px] leading-4 text-muted">No projects in this workspace yet.</p>
                <button
                  onClick={() => onNavigate("create")}
                  className="ring-focus mt-1.5 text-[11px] font-medium text-[#a78bfa] hover:underline"
                >
                  Create a project →
                </button>
              </div>
            )}
            {!conversation && activeProjects.length > 0 && (
              <p className="mt-1 text-[10px] text-muted">Start a conversation to attach a project.</p>
            )}
          </Field>

          <Field icon={<Paperclip className="size-3" />} label={`Attached files${attachments.length ? ` · ${attachments.length}` : ""}`}>
            {attachments.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-surface/40 px-2.5 py-2 text-[11px] leading-4 text-muted">
                No files in this conversation. Attach code, text or an image with the paperclip.
              </p>
            ) : (
              <ul className="space-y-1">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-surface/50 px-2 py-1.5">
                    {a.kind === "image" ? (
                      <ImageIcon className="size-3.5 flex-none text-[#67e8f9]" />
                    ) : (
                      <FileCode2 className="size-3.5 flex-none text-[#93bbff]" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[11px] text-secondary" title={a.name}>{a.name}</span>
                    <span className="flex-none font-mono text-[9.5px] text-muted">{bytes(a.size)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <Field icon={<Target className="size-3" />} label="Learning topic">
            <input
              value={topic}
              onChange={(e) => onTopic(e.target.value)}
              placeholder="e.g. Dynamic programming"
              aria-label="Learning topic"
              className="h-7 w-full rounded-md border border-border bg-surface/70 px-2 text-[11.5px] text-primary outline-none transition-colors placeholder:text-muted hover:border-strong focus:border-accent/60"
            />
            {topic.trim() && (
              <p className="mt-1 flex items-center gap-1 text-[10px] text-muted">
                <Info className="size-2.5" /> Included in this session's context.
              </p>
            )}
          </Field>
        </Section>

        <Section title="AI tools">
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_TOOLS.map((qt) => (
              <button
                key={qt.id}
                onClick={() => onQuickTool(qt.prompt(lang.label))}
                title={qt.prompt(lang.label)}
                className="ring-focus flex items-center gap-1.5 rounded-md border border-border bg-surface/50 px-2 py-2 text-left text-[10.5px] font-medium text-secondary transition-colors hover:border-accent/40 hover:bg-surface-2 hover:text-primary"
              >
                <qt.icon className="size-3.5 flex-none text-[#a78bfa]" />
                <span className="truncate">{qt.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted">Tools add a focused prompt to the composer.</p>
        </Section>

        <Section title="Session">
          <dl className="space-y-2 text-[11px]">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted">Conversation</dt>
              <dd className="min-w-0 max-w-[62%] truncate text-right text-secondary" title={conversation?.title}>
                {conversation?.title ?? "New conversation"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Model</dt>
              <dd className="flex min-w-0 items-center gap-1.5 text-right text-secondary">
                <span className={cn("size-1.5 flex-none rounded-full", connected ? "bg-accent-2" : "bg-warn")} />
                <span className="truncate">{modelLabel}</span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Assistant</dt>
              <dd className="flex items-center gap-1.5 text-secondary">
                <toolInfo.icon className={cn("size-3", toolInfo.tint)} />
                {toolInfo.label}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Messages</dt>
              <dd className="font-mono text-[10.5px] text-secondary">{messageCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Language</dt>
              <dd className="text-secondary">{lang.label}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Code execution</dt>
              <dd className="flex items-center gap-1.5 text-muted">
                <span className="size-1.5 rounded-full bg-muted/50" />
                Not connected
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex items-start justify-between gap-3 border-t border-border/70 pt-3">
            <div className="min-w-0">
              <p className="text-[11px] text-secondary">Saved learning profile</p>
              <p className="mt-0.5 text-[10px] leading-4 text-muted">
                {connected ? "Shared with the model for this session." : "Stored locally; shared only when a model is connected."}
              </p>
            </div>
            <Switch
              checked={useContext}
              onChange={onUseContext}
              label="Use saved learning profile"
              disabled={!conversation}
            />
          </div>

          {!conversation && (
            <p className="mt-2 text-[10px] text-muted">Session preferences unlock once a conversation starts.</p>
          )}
        </Section>

        <Section title="Transcript">
          <div className="space-y-1">
            <button
              onClick={onCopyTranscript}
              disabled={!hasMessages}
              className="ring-focus flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] text-secondary transition-colors hover:bg-surface-2 hover:text-primary disabled:opacity-40"
            >
              <Copy className="size-3.5" /> Copy conversation
            </button>
            <button
              onClick={onExport}
              disabled={!hasMessages}
              className="ring-focus flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] text-secondary transition-colors hover:bg-surface-2 hover:text-primary disabled:opacity-40"
            >
              <Download className="size-3.5" /> Export as Markdown
            </button>
            <button
              onClick={onClearRequest}
              disabled={!hasMessages}
              className="ring-focus flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
            >
              <Trash2 className="size-3.5" /> Clear conversation
            </button>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-muted">
            <Info className="mt-px size-2.5 flex-none" />
            Conversations are stored in this browser. No data leaves it until a model is connected.
          </p>
        </Section>
      </div>
    </aside>
  );
}
