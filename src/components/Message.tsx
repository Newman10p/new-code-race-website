import { memo, useState } from "react";
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  Copy,
  FileCode2,
  GitBranch,
  GraduationCap,
  Image as ImageIcon,
  ListChecks,
  Pin,
  RefreshCw,
  Shapes,
  Volume2,
  VolumeX,
  Wand,
} from "lucide-react";
import { cn } from "../utils/cn";
import type { Message } from "../lib/store";
import { Markdown } from "./Markdown";
import { LumenMark } from "./LumenMark";

export type MessageAction =
  | "save" | "pin" | "regenerate" | "differently" | "simplify" | "practice"
  | "diagram" | "lesson" | "project" | "branch" | "retry";

export const ChatMessage = memo(function ChatMessage({
  message,
  isLast,
  onAction,
  pinned,
}: {
  message: Message;
  isLast: boolean;
  onAction: (a: MessageAction, m: Message) => void;
  pinned?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  if (message.role === "user") {
    return (
      <div className="animate-fade-up flex justify-end">
        <div className="max-w-[85%] rounded-lg rounded-br-sm border border-border bg-surface-2 px-4 py-2.5 md:max-w-[75%]">
          {message.attachments?.length ? (
            <div className="mb-1.5 flex flex-wrap gap-1">
              {message.attachments.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-px text-[11px] text-muted">
                  {a.kind === "image" ? <ImageIcon className="size-3" /> : <FileCode2 className="size-3" />}
                  {a.name}
                </span>
              ))}
            </div>
          ) : null}
          <p className="whitespace-pre-wrap text-[14.5px] leading-7 text-primary">{message.content}</p>
        </div>
      </div>
    );
  }

  const hasCode = /```/.test(message.content);
  const done = message.status === "done";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: leave state unchanged */
    }
  };

  const speak = () => {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const text = message.content.replace(/```[\s\S]*?```/g, " (code block omitted) ").replace(/[#*_`>|$]/g, "");
    const u = new SpeechSynthesisUtterance(text);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    speechSynthesis.speak(u);
    setSpeaking(true);
  };

  return (
    <div className="animate-fade-up flex gap-3 md:gap-4">
      <div className={cn("mt-0.5 flex size-7 flex-none items-center justify-center rounded-md border", message.status === "streaming" || message.status === "pending" ? "border-accent/50 text-accent" : "border-border text-secondary")}>
        <LumenMark className="size-4" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {/* honest state line — no fabricated reasoning */}
        {message.status === "pending" && (
          <StatusLine tone="active">Waiting for Lumen to respond…</StatusLine>
        )}
        {message.content && (
          <div className="relative">
            <Markdown content={message.content} streaming={message.status === "streaming"} />
            {message.status === "streaming" && <span className="stream-cursor" />}
          </div>
        )}
        {message.status === "cancelled" && <StatusLine tone="muted">Stopped. {message.content ? "Partial response kept." : "No response received."}</StatusLine>}
        {message.status === "failed" && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-danger/35 bg-danger/[0.07] px-3 py-2 text-[12.5px]">
            <AlertTriangle className="mt-0.5 size-3.5 flex-none text-danger" />
            <span className="flex-1 text-secondary">{message.error ?? "Request failed."}</span>
            {isLast && (
              <button onClick={() => onAction("retry", message)} className="flex-none font-medium text-primary underline-offset-2 hover:underline">
                Retry
              </button>
            )}
          </div>
        )}

        {done && (
          <div className="mt-2.5 flex flex-wrap items-center gap-0.5">
            <Act label={copied ? "Copied" : "Copy"} onClick={copy}>{copied ? <Check className="size-3.5 text-accent-2" /> : <Copy className="size-3.5" />}</Act>
            <Act label="Save to notes" onClick={() => onAction("save", message)}><BookmarkPlus className="size-3.5" /></Act>
            <Act label={pinned ? "Pinned" : "Pin"} active={pinned} onClick={() => onAction("pin", message)}><Pin className="size-3.5" /></Act>
            {"speechSynthesis" in window && (
              <Act label={speaking ? "Stop reading" : "Read aloud"} active={speaking} onClick={speak}>{speaking ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}</Act>
            )}
            <Act label="Branch from here" onClick={() => onAction("branch", message)}><GitBranch className="size-3.5" /></Act>
            {isLast && <Act label="Regenerate" onClick={() => onAction("regenerate", message)}><RefreshCw className="size-3.5" /></Act>}
            {isLast && (
              <>
                <span className="mx-1 h-3.5 w-px bg-border" />
                <Chip onClick={() => onAction("differently", message)}><Wand className="size-3" />Explain differently</Chip>
                <Chip onClick={() => onAction("simplify", message)}>Simplify</Chip>
                <Chip onClick={() => onAction("practice", message)}><ListChecks className="size-3" />Practice questions</Chip>
                <Chip onClick={() => onAction("diagram", message)}><Shapes className="size-3" />Diagram</Chip>
                <Chip onClick={() => onAction("lesson", message)}><GraduationCap className="size-3" />Continue as lesson</Chip>
                {hasCode && <Chip onClick={() => onAction("project", message)}><FileCode2 className="size-3" />Add code to project</Chip>}
              </>
            )}
          </div>
        )}
        {done && message.model && <p className="mt-1 font-mono text-[10.5px] text-muted">{message.model}</p>}
      </div>
    </div>
  );
});

function StatusLine({ children, tone }: { children: React.ReactNode; tone: "active" | "muted" }) {
  return (
    <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[12px] text-secondary">
      <span className={cn("size-1.5 rounded-full", tone === "active" ? "animate-pulse bg-accent" : "bg-strong")} />
      {children}
    </div>
  );
}

function Act({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button title={label} aria-label={label} onClick={onClick} className={cn("ring-focus flex size-7 items-center justify-center rounded-md transition-colors hover:bg-surface-2 hover:text-primary", active ? "text-accent" : "text-muted")}>
      {children}
    </button>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="ring-focus inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] text-secondary transition-colors hover:border-strong hover:text-primary">
      {children}
    </button>
  );
}
