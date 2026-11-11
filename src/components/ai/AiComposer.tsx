import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Braces,
  Check,
  ChevronDown,
  FileCode2,
  Image as ImageIcon,
  Info,
  Mic,
  MicOff,
  Paperclip,
  Square,
  X,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { currentPolicy } from "../../lib/ai";
import { uid } from "../../lib/store";
import type { Attachment } from "../../lib/store";
import { AI_LANGUAGES, AI_TOOLS, languageMeta, toolMeta } from "../../lib/aiTools";
import type { AiLanguage, ToolId } from "../../lib/aiTools";
import { useSpeechInput } from "../../hooks/useTutor";
import { Popover } from "./primitives";
import { SnippetDialog } from "./AiDialogs";

const MAX_TEXT = 200 * 1024;
const MAX_IMAGE = 4 * 1024 * 1024;
const MAX_FILES = 6;

type Pending = { id: string; name: string; progress: number; error?: string; att?: Attachment };

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AiComposer({
  tool,
  language,
  onTool,
  onLanguage,
  onSend,
  onStop,
  isBusy,
  connected,
  onOpenPreferences,
  seed,
  onSeedConsumed,
  focusNonce,
}: {
  tool: ToolId;
  language: AiLanguage;
  onTool: (t: ToolId) => void;
  onLanguage: (l: AiLanguage) => void;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  isBusy: boolean;
  connected: boolean;
  onOpenPreferences: () => void;
  seed: { text: string; nonce: number } | null;
  onSeedConsumed: () => void;
  focusNonce: number;
}) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [toolMenu, setToolMenu] = useState(false);
  const [langMenu, setLangMenu] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const policy = currentPolicy();
  const blocked = policy.policy === "prohibited";
  const toolInfo = toolMeta(tool);
  const lang = languageMeta(language);
  const speech = useSpeechInput((t) => setValue((v) => (v ? `${v} ${t}` : t)));

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 236)}px`;
  }, [value]);

  useEffect(() => {
    if (seed) {
      setValue((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${seed.text}` : seed.text));
      onSeedConsumed();
      setTimeout(() => textRef.current?.focus(), 20);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.nonce]);

  useEffect(() => {
    if (focusNonce > 0) {
      const t = setTimeout(() => textRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [focusNonce]);

  const ready = files.filter((f) => f.att && !f.error).map((f) => f.att!);
  const uploading = files.some((f) => !f.att && !f.error);
  const canSend = !blocked && !isBusy && !uploading && (value.trim().length > 0 || ready.length > 0);

  const submit = () => {
    if (!canSend) return;
    onSend(value.trim() || "Please review the attached code.", ready);
    setValue("");
    setFiles([]);
    setToolMenu(false);
    setLangMenu(false);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    Array.from(list).forEach((file) => {
      if (files.length >= MAX_FILES) return;
      const id = uid();
      const isImage = file.type.startsWith("image/");
      const entry: Pending = { id, name: file.name, progress: 0 };
      if (isImage && file.size > MAX_IMAGE) entry.error = "Image larger than 4 MB";
      else if (!isImage && file.size > MAX_TEXT) entry.error = "File larger than 200 KB";
      setFiles((p) => [...p, entry]);
      if (entry.error) return;
      const reader = new FileReader();
      reader.onprogress = (e) =>
        e.lengthComputable && setFiles((p) => p.map((f) => (f.id === id ? { ...f, progress: e.loaded / e.total } : f)));
      reader.onerror = () => setFiles((p) => p.map((f) => (f.id === id ? { ...f, error: "Could not read file" } : f)));
      reader.onload = () => {
        const data = String(reader.result ?? "");
        if (!isImage && /\u0000/.test(data.slice(0, 2000))) {
          setFiles((p) => p.map((f) => (f.id === id ? { ...f, error: "Binary files aren't supported" } : f)));
          return;
        }
        setFiles((p) =>
          p.map((f) =>
            f.id === id
              ? { ...f, progress: 1, att: { id, name: file.name, kind: isImage ? "image" : "text", size: file.size, data } }
              : f
          )
        );
      };
      if (isImage) reader.readAsDataURL(file);
      else reader.readAsText(file);
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const addSnippet = ({ name, language: l, code }: { name: string; language: AiLanguage; code: string }) => {
    const att: Attachment = {
      id: uid(),
      name,
      kind: "text",
      size: new Blob([code]).size,
      data: code,
    };
    setFiles((p) => [...p, { id: att.id, name: att.name || `snippet.${languageMeta(l).ext}`, progress: 1, att }]);
    setTimeout(() => textRef.current?.focus(), 40);
  };

  return (
    <div className="w-full">
      <div
        className={cn(
          "cr-composer relative z-20 rounded-2xl border",
          blocked ? "border-border opacity-70" : isBusy ? "border-accent/50" : "border-strong/80"
        )}
      >
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-border/70 px-3 pb-2.5 pt-3">
            {files.map((f) => (
              <span
                key={f.id}
                className={cn(
                  "relative inline-flex max-w-[220px] items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px]",
                  f.error ? "border-danger/40 bg-danger/5 text-danger" : "border-border bg-surface-2/80 text-secondary"
                )}
                title={f.error ?? f.name}
              >
                {f.att?.kind === "image" ? (
                  <img src={f.att.data} alt="" className="size-5 flex-none rounded object-cover" />
                ) : f.att ? (
                  <FileCode2 className="size-3 flex-none text-[#93bbff]" />
                ) : (
                  <ImageIcon className="size-3 flex-none" />
                )}
                <span className="truncate">{f.name}</span>
                {f.error ? (
                  <span className="flex-none text-[10px]">· {f.error}</span>
                ) : (
                  <span className="flex-none font-mono text-[9.5px] text-muted">
                    {f.att ? bytes(f.att.size) : `${Math.round(f.progress * 100)}%`}
                  </span>
                )}
                <button
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}
                  className="flex-none text-muted hover:text-primary"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="px-3.5 pt-3">
          <textarea
            ref={textRef}
            value={value}
            rows={1}
            disabled={blocked}
            aria-label="Message CODE RACE AI"
            onChange={(e) => setValue(e.target.value)}
            onPaste={(e) => e.clipboardData.files.length > 0 && addFiles(e.clipboardData.files)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={blocked ? policy.reason ?? "AI assistance is disabled under the current assessment policy." : toolInfo.placeholder}
            className="block max-h-[236px] min-h-[52px] w-full resize-none bg-transparent text-[14px] leading-6 text-primary outline-none placeholder:text-muted/80 disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
            accept=".txt,.md,.py,.js,.jsx,.ts,.tsx,.html,.css,.json,.csv,.java,.c,.cpp,.h,.sql,.yaml,.yml,image/*"
          />
          <ToolbarButton label="Attach code, text or image" onClick={() => fileRef.current?.click()} disabled={blocked || files.length >= MAX_FILES}>
            <Paperclip className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="Attach a code snippet" onClick={() => setSnippetOpen(true)} disabled={blocked || files.length >= MAX_FILES} className="hidden sm:flex">
            <Braces className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label={
              speech.state === "unsupported"
                ? "Voice input isn't supported in this browser"
                : speech.state === "denied"
                ? "Microphone permission denied"
                : speech.state === "listening"
                ? "Stop listening"
                : "Voice input"
            }
            onClick={() => (speech.state === "listening" ? speech.stop() : speech.start())}
            disabled={blocked || speech.state === "unsupported"}
            active={speech.state === "listening"}
            danger={speech.state === "denied"}
          >
            {speech.state === "denied" ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            {speech.state === "listening" && (
              <span className="flex h-3 items-center gap-[2px]" aria-label="Listening">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="listen-bar h-3 w-[2px] rounded-full bg-danger" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            )}
          </ToolbarButton>

          <span className="mx-1 h-4 w-px flex-none bg-border" />

          {/* tool selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setToolMenu((v) => !v);
                setLangMenu(false);
              }}
              aria-haspopup="menu"
              aria-expanded={toolMenu}
              className="ring-focus flex h-7 items-center gap-1.5 rounded-md border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 px-2 text-[11.5px] font-medium text-[#ddd6fe] transition-colors hover:bg-[#8b5cf6]/20"
            >
              <toolInfo.icon className={cn("size-3.5", toolInfo.tint)} />
              <span className="max-w-[86px] truncate">{toolInfo.label}</span>
              <ChevronDown className="size-3 opacity-60" />
            </button>
            <Popover open={toolMenu} onClose={() => setToolMenu(false)} align="left" side="top" className="max-h-[290px] w-[260px] overflow-y-auto">
              <p className="px-2.5 pb-1 pt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">Assistant mode</p>
              {AI_TOOLS.map((t) => (
                <button
                  key={t.id}
                  role="menuitemradio"
                  aria-checked={t.id === tool}
                  onClick={() => {
                    onTool(t.id);
                    setToolMenu(false);
                  }}
                  className={cn(
                    "ring-focus flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors",
                    t.id === tool ? "bg-accent-soft" : "hover:bg-surface-2"
                  )}
                >
                  <t.icon className={cn("mt-0.5 size-3.5 flex-none", t.tint)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-primary">{t.label}</span>
                    <span className="block text-[10.5px] leading-4 text-muted">{t.description}</span>
                  </span>
                  {t.id === tool && <Check className="mt-0.5 size-3.5 flex-none text-accent" />}
                </button>
              ))}
            </Popover>
          </div>

          {/* language selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setLangMenu((v) => !v);
                setToolMenu(false);
              }}
              aria-haspopup="menu"
              aria-expanded={langMenu}
              className="ring-focus flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface/60 px-2 text-[11.5px] font-medium text-secondary transition-colors hover:border-strong hover:text-primary"
            >
              <span className="font-mono text-[9.5px] uppercase tracking-wide text-[#67e8f9]">{lang.ext}</span>
              <span>{lang.label}</span>
              <ChevronDown className="size-3 opacity-60" />
            </button>
            <Popover open={langMenu} onClose={() => setLangMenu(false)} align="left" side="top" className="w-[190px]">
              <p className="px-2.5 pb-1 pt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">Language</p>
              {AI_LANGUAGES.map((l) => (
                <button
                  key={l.id}
                  role="menuitemradio"
                  aria-checked={l.id === language}
                  onClick={() => {
                    onLanguage(l.id);
                    setLangMenu(false);
                  }}
                  className={cn(
                    "ring-focus flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors",
                    l.id === language ? "bg-accent-soft text-primary" : "text-secondary hover:bg-surface-2"
                  )}
                >
                  <span className="font-mono text-[9.5px] uppercase text-[#67e8f9]">{l.ext}</span>
                  {l.label}
                  {l.id === language && <Check className="ml-auto size-3.5 text-accent" />}
                </button>
              ))}
            </Popover>
          </div>

          </div>

          <span className="mr-1 hidden items-center gap-1.5 text-[10px] text-muted/80 md:flex">
            <kbd className="rounded border border-border bg-surface-2 px-1 py-px text-[9px]">Enter</kbd> send
            <kbd className="ml-1 rounded border border-border bg-surface-2 px-1 py-px text-[9px]">⇧ Enter</kbd> new line
          </span>

          {isBusy ? (
            <button
              onClick={onStop}
              title="Stop generating"
              aria-label="Stop generating"
              className="ring-focus ml-1 flex size-9 flex-none items-center justify-center rounded-lg border border-strong bg-surface-2 text-primary transition-colors hover:bg-surface-3"
            >
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!canSend}
              title={uploading ? "Waiting for attachments" : "Send message"}
              aria-label="Send message"
              className={cn(
                "ring-focus ml-1 flex size-9 flex-none items-center justify-center rounded-lg transition-all",
                canSend
                  ? "cr-gradient-brand text-white shadow-[0_6px_20px_-6px_rgba(124,92,246,0.9)] hover:brightness-110"
                  : "cursor-not-allowed bg-surface-3 text-muted"
              )}
            >
              <ArrowUp className="size-4" strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[10.5px] text-muted/80">
        {connected ? (
          <span>Responses stream from the connected model. Code execution isn't connected — verify facts and run code yourself.</span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1">
              <Info className="size-3" />
              Demo mode — replies are local samples, not model output.
            </span>
            <button onClick={onOpenPreferences} className="font-medium text-[#a78bfa] hover:underline">
              Connect a model
            </button>
          </>
        )}
      </div>

      <SnippetDialog open={snippetOpen} onClose={() => setSnippetOpen(false)} onAttach={addSnippet} />

      {blocked && (
        <p className="mt-1.5 text-center text-[10.5px] text-warn">
          AI assistance is disabled under the current assessment policy.
        </p>
      )}
    </div>
  );
}

function ToolbarButton({
  children,
  label,
  onClick,
  disabled,
  active,
  danger,
  className,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "ring-focus flex h-7 items-center gap-1.5 rounded-md px-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        className,
        active ? "bg-danger/15 text-danger" : danger ? "text-danger" : "text-muted hover:bg-surface-2 hover:text-primary"
      )}
    >
      {children}
    </button>
  );
}
