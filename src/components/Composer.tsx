import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileCode2, Image as ImageIcon, Mic, MicOff, Paperclip, Square, X } from "lucide-react";
import { cn } from "../utils/cn";
import { Kbd } from "./ui";
import { useConnection, useSpeechInput } from "../hooks/useTutor";
import { settings, uid } from "../lib/store";
import type { Attachment, Mode } from "../lib/store";
import { currentPolicy } from "../lib/ai";
import { MODES } from "../lib/modes";

const MAX_TEXT = 200 * 1024;
const MAX_IMAGE = 4 * 1024 * 1024;

type Pending = { id: string; name: string; progress: number; error?: string; att?: Attachment };

export function Composer({
  onSend,
  onStop,
  isBusy,
  autoFocus,
  placeholder = "Ask Lumen anything…",
  size = "md",
  mode,
  onModeChange,
  disabled,
}: {
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop?: () => void;
  isBusy?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  size?: "md" | "lg";
  mode?: Mode;
  onModeChange?: (m: Mode) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [files, setFiles] = useState<Pending[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const conn = useConnection();
  const s = settings.use();
  const model = conn.status === "ok" ? conn.models.find((m) => m.id === s.model) : undefined;
  const vision = model?.capabilities.includes("vision") ?? false;
  const policy = currentPolicy();
  const blocked = disabled || policy.policy === "prohibited";

  const speech = useSpeechInput((t) => setValue((v) => (v ? v + " " : "") + t));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const ready = files.filter((f) => f.att && !f.error).map((f) => f.att!);
  const uploading = files.some((f) => !f.att && !f.error);
  const canSend = !blocked && !isBusy && !uploading && (value.trim().length > 0 || ready.length > 0);

  const submit = () => {
    if (!canSend) return;
    onSend(value.trim() || "Please look at the attached file.", ready);
    setValue("");
    setFiles([]);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    Array.from(list).forEach((file) => {
      const id = uid();
      const isImage = file.type.startsWith("image/");
      const entry: Pending = { id, name: file.name, progress: 0 };
      if (isImage && !vision) entry.error = model ? `${model.name} doesn't accept images` : "Images need a vision-capable model";
      else if (isImage && file.size > MAX_IMAGE) entry.error = "Image larger than 4 MB";
      else if (!isImage && file.size > MAX_TEXT) entry.error = "File larger than 200 KB";
      setFiles((p) => [...p, entry]);
      if (entry.error) return;
      const reader = new FileReader();
      reader.onprogress = (e) => e.lengthComputable && setFiles((p) => p.map((f) => (f.id === id ? { ...f, progress: e.loaded / e.total } : f)));
      reader.onerror = () => setFiles((p) => p.map((f) => (f.id === id ? { ...f, error: "Could not read file" } : f)));
      reader.onload = () => {
        const data = String(reader.result ?? "");
        if (!isImage && /\u0000/.test(data.slice(0, 2000))) {
          setFiles((p) => p.map((f) => (f.id === id ? { ...f, error: "Binary files aren't supported" } : f)));
          return;
        }
        setFiles((p) => p.map((f) => (f.id === id ? { ...f, progress: 1, att: { id, name: file.name, kind: isImage ? "image" : "text", size: file.size, data } } : f)));
      };
      isImage ? reader.readAsDataURL(file) : reader.readAsText(file);
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div
      data-tour="composer"
      className={cn(
        "overflow-hidden rounded-xl border bg-surface transition-[border-color,box-shadow] duration-150",
        blocked ? "border-border opacity-70" : isBusy ? "border-accent/60" : focused ? "border-accent shadow-[0_0_0_3px_var(--ring)]" : "border-strong"
      )}
    >
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-3 pb-2 pt-2.5">
          {files.map((f) => (
            <span
              key={f.id}
              className={cn(
                "relative inline-flex max-w-[220px] items-center gap-1.5 overflow-hidden rounded-md border px-2 py-1 text-[12px]",
                f.error ? "border-danger/40 text-danger" : "border-border bg-surface-2 text-secondary"
              )}
              title={f.error ?? f.name}
            >
              {f.att?.kind === "image" ? <ImageIcon className="size-3 flex-none" /> : <FileCode2 className="size-3 flex-none" />}
              <span className="truncate">{f.name}</span>
              {f.error && <span className="flex-none text-[11px]">· {f.error}</span>}
              {!f.att && !f.error && <span className="flex-none font-mono text-[10.5px]">{Math.round(f.progress * 100)}%</span>}
              <button aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} className="flex-none text-muted hover:text-primary">
                <X className="size-3" />
              </button>
              {!f.att && !f.error && <span className="absolute bottom-0 left-0 h-px bg-accent transition-all" style={{ width: `${f.progress * 100}%` }} />}
            </span>
          ))}
        </div>
      )}

      <div className="relative flex items-end">
        <textarea
          ref={ref}
          value={value}
          rows={1}
          disabled={blocked}
          aria-label="Message Lumen"
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={(e) => e.clipboardData.files.length && addFiles(e.clipboardData.files)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={blocked ? policy.reason ?? "Lumen is unavailable under the current assessment policy." : placeholder}
          className={cn(
            "block w-full resize-none bg-transparent pl-4 pr-14 text-primary outline-none placeholder:text-muted disabled:cursor-not-allowed",
            size === "lg" ? "max-h-[220px] py-3.5 text-[15.5px] leading-7" : "max-h-[180px] py-3 text-[14px] leading-6"
          )}
        />
        <div className="absolute bottom-2 right-2">
          {isBusy ? (
            <button onClick={onStop} title="Stop generating" aria-label="Stop generating" className="ring-focus flex size-8 items-center justify-center rounded-md bg-primary text-app hover:opacity-85">
              <Square className="size-2.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!canSend}
              title={uploading ? "Waiting for attachments" : "Send"}
              aria-label="Send"
              className={cn(
                "ring-focus flex size-8 items-center justify-center rounded-md transition-colors",
                canSend ? "bg-accent text-on-accent hover:bg-accent-hover" : "cursor-not-allowed bg-surface-2 text-muted"
              )}
            >
              <ArrowUp className="size-4" strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-2 py-1.5">
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} accept=".txt,.md,.py,.js,.ts,.tsx,.jsx,.html,.css,.json,.csv,.java,.c,.cpp,.sql,image/*" />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={blocked}
          title="Attach code, text or image"
          aria-label="Attach file"
          className="ring-focus flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-primary disabled:opacity-40"
        >
          <Paperclip className="size-3.5" />
        </button>
        <button
          onClick={() => (speech.state === "listening" ? speech.stop() : speech.start())}
          disabled={blocked || speech.state === "unsupported"}
          title={
            speech.state === "unsupported" ? "Voice input isn't supported in this browser" :
            speech.state === "denied" ? "Microphone permission denied — enable it in browser settings" :
            speech.state === "listening" ? "Stop listening" : "Voice input"
          }
          aria-label="Voice input"
          aria-pressed={speech.state === "listening"}
          className={cn(
            "ring-focus flex h-7 items-center gap-1.5 rounded-md px-1.5 transition-colors disabled:opacity-40",
            speech.state === "listening" ? "bg-danger/15 text-danger" : speech.state === "denied" ? "text-danger" : "text-muted hover:bg-surface-2 hover:text-primary"
          )}
        >
          {speech.state === "denied" ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
          {speech.state === "listening" && (
            <span className="flex h-3 items-center gap-[2px]" aria-label="Listening">
              {[0, 1, 2].map((i) => (
                <span key={i} className="listen-bar h-3 w-[2px] rounded-full bg-danger" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </span>
          )}
        </button>

        {mode && onModeChange && (
          <>
            <span className="mx-0.5 h-3.5 w-px bg-border" />
            <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar" role="radiogroup" aria-label="Mode">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={mode === m.id}
                  onClick={() => onModeChange(m.id)}
                  className={cn(
                    "ring-focus inline-flex h-7 flex-none items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium transition-colors",
                    mode === m.id ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-secondary"
                  )}
                >
                  <m.icon className="size-3.5" />
                  <span className="hidden sm:inline">{m.short}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex-1" />
        <ModelBadge />
        <span className="hidden items-center gap-1 text-[11px] text-muted lg:flex">
          <Kbd>Shift</Kbd>
          <Kbd>↵</Kbd>
        </span>
      </div>
    </div>
  );
}

/** Only real, backend-reported models are selectable. */
export function ModelBadge() {
  const conn = useConnection();
  const s = settings.use();
  if (conn.status === "checking") return <span className="font-mono text-[11px] text-muted">checking…</span>;
  if (conn.status !== "ok")
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-warn" title={conn.status === "error" ? conn.error : "No AI backend configured"}>
        <span className="size-1.5 rounded-full bg-warn" />
        {conn.status === "error" ? "backend unreachable" : "not connected"}
      </span>
    );
  const avail = conn.models.filter((m) => m.available);
  if (!avail.length) return <span className="font-mono text-[11px] text-warn">no models available</span>;
  return (
    <select
      value={s.model}
      onChange={(e) => settings.set((p) => ({ ...p, model: e.target.value }))}
      aria-label="Model"
      className="ring-focus h-7 max-w-[160px] cursor-pointer truncate rounded-md border border-border bg-surface px-1.5 font-mono text-[11px] text-secondary outline-none hover:border-strong"
    >
      {conn.models.map((m) => (
        <option key={m.id} value={m.id} disabled={!m.available}>
          {m.name}
          {!m.available ? " (unavailable)" : ""}
        </option>
      ))}
    </select>
  );
}
