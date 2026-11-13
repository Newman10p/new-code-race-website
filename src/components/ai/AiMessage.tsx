import { memo, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileCode2,
  Pencil,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { cn } from "../../utils/cn";
import type { Message } from "../../lib/store";
import { TOOL_TAG, languageMeta, toolMeta } from "../../lib/aiTools";
import type { AiLanguage } from "../../lib/aiTools";
import { Markdown } from "../Markdown";
import { RaceMark } from "./primitives";

const firstCode = (content: string): { code: string; lang: string } | null => {
  const match = /```([\w+#-]*)\n([\s\S]*?)```/.exec(content);
  if (!match) return null;
  return { lang: match[1] || "txt", code: match[2].replace(/\n$/, "") };
};

const EXT: Record<string, string> = {
  python: "py", py: "py", javascript: "js", js: "js", typescript: "ts", ts: "ts",
  cpp: "cpp", c: "c", html: "html", css: "css", json: "json", sql: "sql", bash: "sh",
};

const timeOf = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const AiMessage = memo(function AiMessage({
  message,
  isLast,
  language,
  onRegenerate,
  onRetry,
  onFeedback,
  onEdit,
}: {
  message: Message;
  isLast: boolean;
  language: AiLanguage;
  onRegenerate: () => void;
  onRetry: () => void;
  onFeedback: (value: "up" | "down") => void;
  onEdit: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => {
        editRef.current?.focus();
        const len = editRef.current?.value.length ?? 0;
        editRef.current?.setSelectionRange(len, len);
      }, 20);
      return () => clearTimeout(t);
    }
  }, [editing]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const download = () => {
    const block = firstCode(message.content);
    if (!block) return;
    const blob = new Blob([block.code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codequest-ai.${EXT[block.lang.toLowerCase()] ?? languageMeta(language).ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (message.role === "user") {
    return (
      <div className="group flex flex-col items-end gap-1">
        <div className="cr-user-bubble max-w-[88%] rounded-2xl rounded-br-md px-4 py-2.5 sm:max-w-[78%]">
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap justify-end gap-1.5">
              {message.attachments.map((a) =>
                a.kind === "image" ? (
                  <img
                    key={a.id}
                    src={a.data}
                    alt={a.name}
                    className="max-h-40 max-w-[220px] rounded-md border border-white/10 object-cover"
                  />
                ) : (
                  <span
                    key={a.id}
                    className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-white/10 bg-black/20 px-1.5 py-1 text-[10.5px] text-secondary"
                    title={a.name}
                  >
                    <FileCode2 className="size-3 flex-none text-[#93bbff]" />
                    <span className="truncate">{a.name}</span>
                  </span>
                )
              )}
            </div>
          )}
          <p className="whitespace-pre-wrap break-words text-[14px] leading-6 text-primary">{message.content}</p>
        </div>

        {editing ? (
          <div className="w-full max-w-[88%] rounded-xl border border-accent/40 bg-surface p-2 sm:max-w-[78%]">
            <textarea
              ref={editRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (draft.trim()) {
                    onEdit(draft.trim());
                    setEditing(false);
                  }
                }
                if (e.key === "Escape") setEditing(false);
              }}
              rows={3}
              aria-label="Edit your message"
              className="block max-h-[200px] w-full resize-none rounded-md bg-transparent px-1 py-1 text-[13.5px] leading-6 text-primary outline-none"
            />
            <div className="mt-1 flex items-center justify-end gap-1.5">
              <span className="mr-auto text-[10px] text-muted">Resending replaces later replies.</span>
              <button
                onClick={() => setEditing(false)}
                className="ring-focus flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] text-muted hover:bg-surface-2 hover:text-primary"
              >
                <X className="size-3" /> Cancel
              </button>
              <button
                onClick={() => {
                  if (!draft.trim()) return;
                  onEdit(draft.trim());
                  setEditing(false);
                }}
                disabled={!draft.trim()}
                className="ring-focus flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 text-[11.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
              >
                Save & resend
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-0.5 pr-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
            <span className="mr-1 font-mono text-[9.5px] text-muted/70">{timeOf(message.createdAt)}</span>
            <IconAction label={copied ? "Copied" : "Copy message"} onClick={copy}>
              {copied ? <Check className="size-3 text-accent-2" /> : <Copy className="size-3" />}
            </IconAction>
            <IconAction label="Edit and resend" onClick={() => { setDraft(message.content); setEditing(true); }}>
              <Pencil className="size-3" />
            </IconAction>
          </div>
        )}
      </div>
    );
  }

  const meta = toolMeta(message.tool);
  const tag = TOOL_TAG[message.tool ?? "auto"];
  const done = message.status === "done" || message.status === "cancelled";
  const hasCode = /```/.test(message.content);

  return (
    <div className="group flex gap-2.5 sm:gap-3.5">
      <div className="cr-gradient-brand mt-0.5 hidden size-7 flex-none items-center justify-center rounded-lg text-white/95 shadow-[0_2px_12px_-2px_rgba(124,92,246,0.7)] sm:flex">
        <RaceMark className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1.5 sm:hidden">
            <span className="cr-gradient-brand flex size-5 items-center justify-center rounded-md text-white">
              <RaceMark className="size-3" />
            </span>
          </span>
          <span className="text-[11.5px] font-semibold tracking-[0.01em] text-primary">CodeQuest AI</span>
          <span className={cn("inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-px text-[9.5px] font-medium", tag.className)}>
            <meta.icon className="size-2.5" />
            {tag.label}
          </span>
          {message.demo && (
            <span
              className="inline-flex items-center gap-1 rounded-[4px] border border-border bg-surface-2 px-1.5 py-px text-[9.5px] font-medium text-muted"
              title="Generated locally for demonstration. Not produced by an AI model."
            >
              <AlertTriangle className="size-2.5" />
              Demo sample
            </span>
          )}
          <span className="ml-auto hidden font-mono text-[9.5px] text-muted/60 group-hover:block">
            {timeOf(message.createdAt)}
          </span>
        </div>

        {message.status === "pending" && (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface/40 px-3 py-2.5">
            <span className="cr-thinking flex items-center gap-1" aria-label="Generating">
              <span /><span /><span />
            </span>
            <span className="text-[12px] text-secondary">
              {message.demo ? "Preparing a demonstration sample…" : "Thinking…"}
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted">
              <meta.icon className={cn("size-3", meta.tint)} />
              {meta.label}
            </span>
          </div>
        )}

        {message.status === "failed" ? (
          <div className="rounded-lg border border-danger/30 bg-danger/[0.06] p-3.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-3.5 flex-none text-danger" />
              <p className="text-[12px] font-medium text-primary">This response couldn't be completed</p>
            </div>
            <p className="mt-1 text-[11.5px] leading-5 text-secondary">
              {message.error ?? "The request failed before a response arrived."}
            </p>
            {message.content && (
              <div className="mt-2 border-t border-danger/20 pt-2">
                <Markdown content={message.content} />
              </div>
            )}
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={onRetry}
                className="ring-focus flex h-7 items-center gap-1.5 rounded-md border border-strong bg-surface px-2.5 text-[11.5px] font-medium text-primary hover:bg-surface-2"
              >
                <RefreshCw className="size-3" /> Retry
              </button>
              {!message.demo && (
                <span className="text-[10.5px] text-muted">Check the model connection in AI preferences.</span>
              )}
            </div>
          </div>
        ) : (
          <>
            {(message.content || message.status === "streaming") && (
              <div className="relative">
                <Markdown content={message.content} streaming={message.status === "streaming"} />
                {message.status === "streaming" && <span className="stream-cursor" aria-hidden="true" />}
              </div>
            )}
            {message.status === "cancelled" && (
              <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-muted">
                <span className="size-1.5 rounded-full bg-muted/60" /> Generation stopped.
              </p>
            )}
            {message.demo && done && isLast && (
              <p className="mt-2 flex items-start gap-1.5 rounded-md border border-border/60 bg-surface/30 px-2.5 py-1.5 text-[10px] leading-4 text-muted">
                <AlertTriangle className="mt-px size-3 flex-none text-warn/80" />
                Demonstration only — assembled in your browser with no model connected. Nothing was executed.
              </p>
            )}
          </>
        )}

        {done && message.content && (
          <div
            className={cn(
              "mt-2 flex flex-wrap items-center gap-0.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100",
              isLast && "lg:opacity-100"
            )}
          >
            <Action label={copied ? "Copied" : "Copy response"} onClick={copy}>
              {copied ? <Check className="size-3.5 text-accent-2" /> : <Copy className="size-3.5" />}
            </Action>
            {isLast && (
              <Action label="Regenerate response" onClick={onRegenerate}>
                <RefreshCw className="size-3.5" />
              </Action>
            )}
            <span className="mx-0.5 h-3.5 w-px bg-border" />
            <Action
              label="Good response"
              onClick={() => onFeedback("up")}
              active={message.feedback === "up"}
            >
              <ThumbsUp className={cn("size-3.5", message.feedback === "up" && "fill-current")} />
            </Action>
            <Action
              label="Needs improvement"
              onClick={() => onFeedback("down")}
              active={message.feedback === "down"}
            >
              <ThumbsDown className={cn("size-3.5", message.feedback === "down" && "fill-current")} />
            </Action>
            {hasCode && (
              <>
                <span className="mx-0.5 h-3.5 w-px bg-border" />
                <Action label="Download code" onClick={download}>
                  <Download className="size-3.5" />
                </Action>
              </>
            )}
            <span className="ml-auto hidden items-center gap-1 font-mono text-[9px] text-muted/50 sm:flex">
              {message.model ?? (message.demo ? "local-demo" : "")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

function Action({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "ring-focus flex size-7 items-center justify-center rounded-md transition-colors",
        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-primary"
      )}
    >
      {children}
    </button>
  );
}

function IconAction({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="ring-focus flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/5 hover:text-primary"
    >
      {children}
    </button>
  );
}
