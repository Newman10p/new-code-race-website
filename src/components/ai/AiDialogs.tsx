import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  Code2,
  Keyboard,
  Link2,
  Loader2,
  Plug,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { AI_LANGUAGES, languageMeta } from "../../lib/aiTools";
import type { AiLanguage } from "../../lib/aiTools";
import { apiUrl } from "../../lib/ai";
import { settings } from "../../lib/store";
import { refreshConnection, useConnection } from "../../hooks/useTutor";
import { Modal } from "./primitives";

/* ---------------- code snippet attachment ---------------- */

export function SnippetDialog({
  open,
  onClose,
  onAttach,
}: {
  open: boolean;
  onClose: () => void;
  onAttach: (attachment: { name: string; language: AiLanguage; code: string }) => void;
}) {
  const [language, setLanguage] = useState<AiLanguage>("python");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!open) return;
    setLanguage("python");
    setName("");
    setCode("");
  }, [open]);

  const meta = languageMeta(language);
  const attach = () => {
    if (!code.trim()) return;
    onAttach({ name: name.trim() || `snippet.${meta.ext}`, language, code });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Attach a code snippet"
      description="Add code as context without leaving the composer. It stays local until you send."
      icon={<Code2 className="size-4" />}
      width="max-w-xl"
      footer={
        <>
          <button onClick={onClose} className="ring-focus h-8 rounded-md border border-border px-3 text-[12.5px] font-medium text-secondary hover:border-strong hover:text-primary">
            Cancel
          </button>
          <button
            onClick={attach}
            disabled={!code.trim()}
            className="ring-focus h-8 rounded-md bg-accent px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Attach snippet
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="mb-1 block text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">Language</span>
          <select
            data-autofocus
            value={language}
            onChange={(e) => {
              const next = e.target.value as AiLanguage;
              setLanguage(next);
              if (name.trim() && /^snippet\.\w+$/.test(name.trim())) setName(`snippet.${languageMeta(next).ext}`);
            }}
            aria-label="Snippet language"
            className="h-8 w-full rounded-md border border-strong bg-surface px-2 text-[12.5px] text-primary outline-none focus:border-accent"
          >
            {AI_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">Filename</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`snippet.${meta.ext}`}
            aria-label="Snippet filename"
            className="h-8 w-full rounded-md border border-strong bg-surface px-2 font-mono text-[11.5px] text-primary outline-none placeholder:text-muted focus:border-accent"
          />
        </label>
      </div>
      <label className="mt-2.5 block">
        <span className="mb-1 block text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">Code</span>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={9}
          spellCheck={false}
          placeholder={"def solve(items):\n    ..."}
          aria-label="Code snippet"
          className="block w-full resize-y rounded-md border border-strong bg-code-bg p-3 font-mono text-[12px] leading-5 text-code outline-none placeholder:text-code-muted/60 focus:border-accent"
        />
      </label>
      <p className="mt-2 text-[10.5px] text-muted">Snippets are capped at 200 KB. Binary files aren't accepted.</p>
    </Modal>
  );
}

/* ---------------- confirmation ---------------- */

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  tone = "danger",
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  tone?: "danger" | "accent";
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={<AlertTriangle className={cn("size-4", tone === "danger" ? "text-warn" : "text-accent")} />}
      width="max-w-md"
      footer={
        <>
          <button onClick={onClose} className="ring-focus h-8 rounded-md border border-border px-3 text-[12.5px] font-medium text-secondary hover:border-strong hover:text-primary">
            Cancel
          </button>
          <button
            data-autofocus
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={cn(
              "ring-focus flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium text-white transition-colors",
              tone === "danger" ? "bg-[#e11d48] hover:bg-[#be123c]" : "bg-accent hover:bg-accent-hover"
            )}
          >
            <Trash2 className="size-3.5" />
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}

/* ---------------- help ---------------- */

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Enter"], label: "Send message" },
  { keys: ["Shift", "Enter"], label: "New line" },
  { keys: ["⌘", "K"], label: "Search conversations" },
  { keys: ["⌘", "N"], label: "New chat" },
  { keys: ["⌘", "\\"], label: "Collapse or expand sidebar" },
  { keys: ["Esc"], label: "Close panels and dialogs" },
];

export function HelpDialog({
  open,
  onClose,
  connected,
  modelLabel,
  onOpenPreferences,
}: {
  open: boolean;
  onClose: () => void;
  connected: boolean;
  modelLabel: string;
  onOpenPreferences: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="CodeQuest AI"
      description="Your coding workspace: explanations, debugging, reviews, challenges and lessons in one conversation."
      icon={<Sparkles className="size-4" />}
      width="max-w-xl"
      footer={
        <button
          onClick={() => {
            onClose();
            onOpenPreferences();
          }}
          className="ring-focus h-8 rounded-md bg-accent px-3.5 text-[12.5px] font-medium text-white hover:bg-accent-hover"
        >
          Open AI preferences
        </button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-2/50 p-3">
          <div className="flex items-center gap-2">
            <span className={cn("size-1.5 rounded-full", connected ? "bg-accent-2" : "bg-warn")} />
            <span className="text-[12px] font-medium text-primary">{connected ? "Model connected" : "Demo mode"}</span>
            <span className="truncate font-mono text-[10.5px] text-muted">{modelLabel}</span>
          </div>
          <p className="mt-1 text-[11.5px] leading-[18px] text-secondary">
            {connected
              ? "Responses stream from the CodeQuest AI backend. Provider keys stay server-side — never in this browser."
              : "No model is connected. Replies are clearly labelled local samples that demonstrate the response format; they are not model output."}
          </p>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
            <Keyboard className="size-3.5" /> Keyboard shortcuts
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            {SHORTCUTS.map((s) => (
              <div key={s.label} className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-2.5 py-1.5">
                <span className="text-[11.5px] text-secondary">{s.label}</span>
                <span className="flex items-center gap-1">
                  {s.keys.map((k) => (
                    <kbd key={k} className="rounded border border-strong bg-surface-2 px-1 py-px font-sans text-[9.5px] text-muted">{k}</kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { icon: BookOpen, title: "Teaching, not just answers", body: "The assistant explains reasoning and can withhold solutions while you attempt a challenge." },
            { icon: ShieldCheck, title: "Honest by default", body: "Code execution and challenge context are labelled as unavailable until those services are connected." },
            { icon: Link2, title: "Context you control", body: "Language, project and attachments appear in the context panel before they are sent." },
            { icon: Code2, title: "Ready for the IDE", body: "The attachment workflow is prepared for sending selected code from the CodeQuest editor." },
          ].map((c) => (
            <div key={c.title} className="rounded-lg border border-border bg-surface-2/40 p-3">
              <c.icon className="size-3.5 text-[#a78bfa]" />
              <p className="mt-1.5 text-[11.5px] font-medium text-primary">{c.title}</p>
              <p className="mt-0.5 text-[10.5px] leading-[16px] text-muted">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}


/* ---------------- AI connection preferences ---------------- */

export function PreferencesDialog({
  open,
  onClose,
  onOpenPlatformSettings,
}: {
  open: boolean;
  onClose: () => void;
  onOpenPlatformSettings: () => void;
}) {
  const s = settings.use();
  const conn = useConnection();
  const [url, setUrl] = useState(s.apiUrl);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setUrl(s.apiUrl);
      setSaved(false);
    }
  }, [open, s.apiUrl]);

  const trimmed = url.trim();
  const valid = !trimmed || /^https?:\/\//.test(trimmed);
  const dirty = trimmed !== s.apiUrl;
  const effective = apiUrl();
  const available = conn.status === "ok" ? conn.models.filter((m) => m.available) : [];

  const save = () => {
    if (!valid || !dirty) return;
    settings.set((p) => ({ ...p, apiUrl: trimmed }));
    setSaved(true);
    void refreshConnection();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI preferences"
      description="Connect the CodeQuest AI backend. Provider keys stay on the server — this browser never holds one."
      icon={<Plug className="size-4" />}
      width="max-w-xl"
      footer={
        <>
          <button
            onClick={() => {
              onClose();
              onOpenPlatformSettings();
            }}
            className="ring-focus mr-auto h-8 rounded-md px-2 text-[12px] font-medium text-muted hover:bg-surface-2 hover:text-primary"
          >
            All platform preferences
          </button>
          <button
            onClick={save}
            disabled={!valid || !dirty}
            className="ring-focus h-8 rounded-md bg-accent px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save &amp; test
          </button>
        </>
      }
    >
      <div className="rounded-lg border border-border bg-surface-2/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {conn.status === "checking" && (
            <>
              <Loader2 className="size-3.5 animate-spin text-muted" />
              <span className="text-[12px] text-secondary">Checking connection…</span>
            </>
          )}
          {conn.status === "not_configured" && (
            <>
              <span className="size-1.5 rounded-full bg-warn" />
              <span className="text-[12px] font-medium text-primary">Demo mode</span>
              <span className="text-[11.5px] text-muted">No backend endpoint configured</span>
            </>
          )}
          {conn.status === "ok" && (
            <>
              <span className="size-1.5 rounded-full bg-accent-2" />
              <span className="text-[12px] font-medium text-primary">Connected</span>
              <span className="max-w-[260px] truncate font-mono text-[10.5px] text-muted">{effective}</span>
            </>
          )}
          {conn.status === "error" && (
            <>
              <span className="size-1.5 rounded-full bg-danger" />
              <span className="min-w-0 flex-1 text-[11.5px] text-secondary">{conn.error}</span>
            </>
          )}
          <button
            onClick={() => void refreshConnection()}
            title="Test connection"
            aria-label="Test connection"
            className="ring-focus ml-auto flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary"
          >
            <RefreshCw className={cn("size-3.5", conn.status === "checking" && "animate-spin")} />
          </button>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-4 text-muted">
          {conn.status === "ok"
            ? "Responses stream from this backend. If a request fails, the error is shown in the conversation."
            : "Without an endpoint the workspace stays honest: replies are labelled local demonstration samples, never model output."}
        </p>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">Backend base URL</span>
        <div className="flex gap-2">
          <input
            data-autofocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder={window.CODEQUEST?.aiUrl || import.meta.env.VITE_CODEQUEST_AI_URL || window.CODEQUEST?.apiUrl || import.meta.env.VITE_LUMEN_API_URL || "https://your-project.supabase.co/functions/v1/ai-chat"}
            aria-label="Backend base URL"
            spellCheck={false}
            className={cn(
              "h-9 min-w-0 flex-1 rounded-md border bg-surface px-3 font-mono text-[11.5px] text-primary outline-none transition-colors placeholder:text-muted/70 focus:border-accent",
              valid ? "border-strong" : "border-danger/60"
            )}
          />
          <button
            onClick={() => setUrl("")}
            disabled={!url}
            className="ring-focus h-9 flex-none rounded-md border border-border px-2.5 text-[11.5px] text-secondary transition-colors hover:border-strong hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear
          </button>
        </div>
        {!valid && <span className="mt-1 block text-[10.5px] text-danger">Enter a URL starting with http:// or https://</span>}
        {saved && dirty === false && <span className="mt-1 block text-[10.5px] text-accent-2">Saved. Testing the connection…</span>}
      </label>

      {available.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">Default model</p>
          <div className="overflow-hidden rounded-lg border border-border">
            {available.map((m, i) => (
              <label
                key={m.id}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 px-3 py-2.5 hover:bg-surface-2",
                  i > 0 && "border-t border-border"
                )}
              >
                <input
                  type="radio"
                  name="cr-model"
                  className="mt-1"
                  checked={s.model === m.id}
                  onChange={() => settings.set((p) => ({ ...p, model: m.id }))}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium text-primary">{m.name}</span>
                  <span className="block truncate font-mono text-[10px] text-muted">{m.id}</span>
                </span>
                <span className="flex flex-wrap justify-end gap-1">
                  {m.capabilities.slice(0, 3).map((c) => (
                    <span key={c} className="rounded-[3px] border border-border px-1 text-[8.5px] uppercase tracking-wide text-muted">{c}</span>
                  ))}
                </span>
                {s.model === m.id && <Check className="mt-1 size-3.5 flex-none text-accent" />}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/70 bg-surface-2/30 p-2.5">
        <ShieldCheck className="mt-px size-3.5 flex-none text-[#6ee7b7]" />
        <p className="text-[10.5px] leading-4 text-muted">
          The client calls <span className="font-mono text-secondary">GET /models</span> and streaming{" "}
          <span className="font-mono text-secondary">POST /chat</span> with credentials. Never paste a provider API key here — it cannot be kept secret in a browser.
        </p>
      </div>
    </Modal>
  );
}
