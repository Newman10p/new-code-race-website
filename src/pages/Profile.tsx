import { useState } from "react";
import { Eye, EyeOff, Link2Off, MessageSquarePlus, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge, Button, Segmented, Select, Toggle } from "../components/ui";
import { useProfile } from "../context/ProfileContext";
import { useToast } from "../context/ToastContext";
import { buildSystemPrompt, EXPLAIN_STYLES } from "../lib/ai";
import { contextItems, conversations, newConversation, settings, uid } from "../lib/store";
import { FRAMEWORKS, GOALS, LANGUAGES, LEVELS, STYLES } from "../lib/profile";
import type { LevelId } from "../lib/profile";
import type { Page } from "../lib/nav";
import { cn } from "../utils/cn";

export function Profile({ onNavigate }: { onNavigate: (p: Page, arg?: string) => void }) {
  const { profile, setField, resetOnboarding } = useProfile();
  const items = contextItems.use();
  const s = settings.use();
  const convs = conversations.use();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);

  const preview = buildSystemPrompt({ mode: "ask", profile, useContext: true });

  const addItem = () => {
    if (!label.trim() || !value.trim()) return;
    contextItems.set((p) => [...p, { id: uid(), label: label.trim(), value: value.trim(), enabled: true, createdAt: Date.now() }]);
    setLabel("");
    setValue("");
  };

  const clearHistory = () => {
    const snap = conversations.get();
    conversations.set(() => []);
    toast({ title: `Cleared ${snap.length} conversations`, action: { label: "Undo", onClick: () => conversations.set(() => snap) } });
  };

  const toggleGoal = (g: string) => setField("goals", profile.goals.includes(g) ? profile.goals.filter((x) => x !== g) : [...profile.goals, g]);
  const toggleStyle = (id: string) => setField("style", profile.style.includes(id) ? profile.style.filter((x) => x !== id) : [...profile.style, id]);

  return (
    <div className="mx-auto w-full max-w-[920px] px-5 pb-20 pt-9 md:px-8">
      <header className="animate-fade-up mb-7">
        <h1 className="font-display text-[38px] leading-[1.08] text-primary">Learning profile</h1>
        <p className="mt-2 max-w-xl text-[14.5px] leading-6 text-secondary">
          Everything Lumen knows about you, in one place. Correct it, remove it, or switch it off.
        </p>
      </header>

      {/* personalisation master switch */}
      <section className="animate-fade-up mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-primary">Use my learning context</p>
          <p className="mt-0.5 text-[12.5px] leading-5 text-muted">
            Applies to <strong className="font-medium text-secondary">new</strong> conversations. Each conversation can still be switched individually from its header. What you say inside a conversation is only used in that conversation.
          </p>
        </div>
        <Toggle checked={s.personalisation} onChange={(v) => settings.set((p) => ({ ...p, personalisation: v }))} label="Use my learning context" />
        <Button size="sm" onClick={() => { const c = newConversation("ask", { useContext: false, title: "Private conversation" }); onNavigate("chat", c.id); }}>
          <MessageSquarePlus className="size-3.5" />Start without context
        </Button>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="About you" hint="From onboarding · editable">
          <Field label="Name"><input value={profile.name} onChange={(e) => setField("name", e.target.value)} className={input} aria-label="Name" /></Field>
          <Field label="Level">
            <Segmented size="sm" value={profile.level} onChange={(v) => setField("level", v as LevelId)} options={LEVELS.map((l) => ({ value: l.id, label: l.label }))} />
          </Field>
          <Field label="Main language"><Select value={profile.language} onChange={(v) => setField("language", v)} options={LANGUAGES} /></Field>
          <Field label="Framework"><Select value={profile.framework} onChange={(v) => setField("framework", v)} options={FRAMEWORKS} /></Field>
          <Field label="Current focus"><input value={profile.focus} onChange={(e) => setField("focus", e.target.value)} placeholder="What you're studying now" className={input} aria-label="Current focus" /></Field>
        </Panel>

        <Panel title="Goals & explanation preferences">
          <p className="mb-1.5 text-[12px] text-muted">Goals</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {GOALS.map((g) => (
              <button key={g} onClick={() => toggleGoal(g)} className={cn("h-7 rounded-md border px-2 text-[12px]", profile.goals.includes(g) ? "border-accent bg-accent-soft text-accent" : "border-border text-secondary hover:border-strong")}>{g}</button>
            ))}
          </div>
          <p className="mb-1.5 text-[12px] text-muted">How Lumen teaches you</p>
          <div className="space-y-1.5">
            {STYLES.map((st) => (
              <label key={st.id} className="flex items-start gap-2.5 text-[12.5px]">
                <input type="checkbox" className="mt-0.5" checked={profile.style.includes(st.id)} onChange={() => toggleStyle(st.id)} />
                <span><span className="text-primary">{st.label}</span> <span className="text-muted">— {st.line}</span></span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] text-muted">Per-lesson styles: {EXPLAIN_STYLES.map((e) => e.label).join(", ")}.</p>
        </Panel>
      </div>

      <Panel title="Additional context" hint="Things you want Lumen to remember" className="mt-6">
        {items.length === 0 && <p className="mb-3 text-[12.5px] text-muted">None yet — e.g. "Exam: AP Computer Science in May" or "I learn best with visual examples".</p>}
        {items.length > 0 && (
          <div className="mb-3 overflow-hidden rounded-lg border border-border">
            {items.map((it, i) => (
              <div key={it.id} className={cn("flex items-center gap-3 px-3 py-2", i && "border-t border-border", !it.enabled && "opacity-55")}>
                <span className="w-32 flex-none truncate text-[12px] font-medium text-secondary">{it.label}</span>
                <input value={it.value} onChange={(e) => contextItems.set((p) => p.map((x) => (x.id === it.id ? { ...x, value: e.target.value } : x)))} aria-label={`Edit ${it.label}`} className="min-w-0 flex-1 bg-transparent text-[13px] text-primary outline-none" />
                <button aria-label={it.enabled ? "Disable" : "Enable"} title={it.enabled ? "Used by Lumen — click to disable" : "Disabled"} onClick={() => contextItems.set((p) => p.map((x) => (x.id === it.id ? { ...x, enabled: !x.enabled } : x)))} className="text-muted hover:text-primary">
                  {it.enabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </button>
                <button aria-label="Remove" onClick={() => contextItems.set((p) => p.filter((x) => x.id !== it.id))} className="text-muted hover:text-danger"><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" aria-label="Context label" className={cn(input, "w-36")} />
          <input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder="What Lumen should know" aria-label="Context value" className={cn(input, "min-w-[200px] flex-1")} />
          <Button size="md" onClick={addItem} disabled={!label.trim() || !value.trim()}><Plus className="size-3.5" />Add</Button>
        </div>
      </Panel>

      <Panel title="Connected CodeQuest data" className="mt-6">
        <div className="flex items-start gap-2.5 text-[12.5px] leading-5 text-muted">
          <Link2Off className="mt-0.5 size-3.5 flex-none" />
          <span>Courses, completed lessons, practice history and competition records are <strong className="font-medium text-secondary">not connected</strong> here. Lumen does not see or assume any of them. Only the information on this page is used.</span>
        </div>
      </Panel>

      <Panel title="What Lumen receives" hint="Exact instructions sent with each message" className="mt-6">
        <button onClick={() => setShowPrompt((v) => !v)} className="text-[12.5px] font-medium text-accent">{showPrompt ? "Hide" : "Show"} the full instructions</button>
        {showPrompt && <pre className="code-chrome mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg border border-code-line bg-code-bg p-3.5 font-mono text-[11.5px] leading-[18px] text-code-muted">{preview}</pre>}
      </Panel>

      <Panel title="Data" className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{convs.length} conversations stored on this device</Badge>
          <Button size="sm" variant="danger" onClick={clearHistory} disabled={!convs.length}><Trash2 className="size-3" />Clear conversation history</Button>
          <Button size="sm" variant="ghost" onClick={resetOnboarding}><RotateCcw className="size-3" />Redo onboarding</Button>
        </div>
      </Panel>
    </div>
  );
}

const input = "h-8 rounded-md border border-strong bg-surface px-2.5 text-[13px] text-primary outline-none focus:border-accent";

function Panel({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("animate-fade-up rounded-xl border border-border bg-surface p-5", className)}>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[14px] font-semibold text-primary">{title}</h2>
        {hint && <span className="text-[11.5px] text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <span className="text-[12.5px] text-secondary">{label}</span>
      {children}
    </div>
  );
}
