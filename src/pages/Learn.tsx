import { useState } from "react";
import { ArrowRight, BookOpen, Link2Off, ListChecks, Play } from "lucide-react";
import { Badge, Button, Segmented } from "../components/ui";
import { useProfile } from "../context/ProfileContext";
import { conversations, newConversation, relTime } from "../lib/store";
import { EXPLAIN_STYLES } from "../lib/ai";
import { LEVELS } from "../lib/profile";
import type { Page } from "../lib/nav";
import { cn } from "../utils/cn";

const PRACTICE_TYPES = [
  { id: "mcq", label: "Multiple choice" },
  { id: "short", label: "Short answer" },
  { id: "coding", label: "Coding challenge" },
  { id: "debug", label: "Debugging" },
  { id: "predict", label: "Predict the output" },
  { id: "project", label: "Mini project" },
];

export function Learn({ onNavigate, onStartLesson }: { onNavigate: (p: Page, arg?: string) => void; onStartLesson: (convId: string, prompt: string) => void }) {
  const { profile } = useProfile();
  const convs = conversations.use();
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("beginner");
  const [ptype, setPtype] = useState("coding");
  const [ptopic, setPtopic] = useState("");
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");

  const lessons = convs.filter((c) => c.mode === "learn" && !c.archived && c.messages.length).sort((a, b) => b.updatedAt - a.updatedAt);
  const level = LEVELS.find((l) => l.id === profile.level)?.label;

  const startLesson = (t = topic) => {
    if (!t.trim()) return;
    const c = newConversation("learn", { title: `Lesson · ${t.trim().slice(0, 40)}`, explainStyle: style });
    onStartLesson(c.id, `I'd like a lesson on: ${t.trim()}. Start by finding out what I already know.`);
  };

  const startPractice = () => {
    const subject = ptopic.trim() || profile.language;
    const label = PRACTICE_TYPES.find((p) => p.id === ptype)!.label;
    const c = newConversation("learn", { title: `Practice · ${label} · ${subject.slice(0, 30)}`, explainStyle: "steps" });
    onStartLesson(
      c.id,
      `Generate one ${difficulty.toLowerCase()} ${label.toLowerCase()} exercise on ${subject}. Include: clear instructions, the difficulty, and how it will be evaluated. Offer hints only when I ask, progressively. Don't show the solution until I've attempted it, then evaluate my attempt.`
    );
  };

  return (
    <div className="mx-auto w-full max-w-[960px] px-5 pb-20 pt-9 md:px-8">
      <header className="animate-fade-up mb-8">
        <h1 className="font-display text-[38px] leading-[1.08] text-primary">Learn with Lumen</h1>
        <p className="mt-2 max-w-xl text-[14.5px] leading-6 text-secondary">
          A private lesson that adapts as you go — Lumen teaches, guides you with hints, sets practice and checks your understanding.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {level && <Badge tone="accent">{level}</Badge>}
          <Badge>{profile.language}</Badge>
          <button onClick={() => onNavigate("profile")} className="ml-1 text-[12px] text-muted hover:text-primary">Edit learning profile →</button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* lesson starter */}
          <section className="animate-fade-up rounded-xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen className="size-4 text-accent" />
              <h2 className="text-[14px] font-semibold text-primary">Start a lesson</h2>
            </div>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startLesson()}
              placeholder="e.g. recursion, SQL joins, how the event loop works"
              aria-label="Lesson topic"
              className="h-10 w-full rounded-md border border-strong bg-surface px-3 text-[14px] text-primary outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--ring)]"
            />
            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">Explanation style</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup">
              {EXPLAIN_STYLES.map((s) => (
                <button key={s.id} role="radio" aria-checked={style === s.id} onClick={() => setStyle(s.id)} className={cn("h-8 rounded-md border px-3 text-[12.5px] font-medium transition-colors", style === s.id ? "border-accent bg-accent-soft text-accent" : "border-border text-secondary hover:border-strong hover:text-primary")}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="primary" size="lg" disabled={!topic.trim()} onClick={() => startLesson()}>
                <Play className="size-3.5" /> Begin lesson
              </Button>
              {[`${profile.language} functions`, "Big-O notation", "How HTTP works"].map((t) => (
                <button key={t} onClick={() => startLesson(t)} className="h-8 rounded-md px-2.5 text-[12.5px] text-muted hover:bg-surface-2 hover:text-primary">{t}</button>
              ))}
            </div>
          </section>

          {/* practice generator */}
          <section className="animate-fade-up rounded-xl border border-border bg-surface p-5">
            <div className="mb-1 flex items-center gap-2">
              <ListChecks className="size-4 text-accent" />
              <h2 className="text-[14px] font-semibold text-primary">Practice</h2>
            </div>
            <p className="mb-3 text-[12.5px] text-muted">Lumen practice is for learning only — it never counts toward CodeQuest competition scores or rankings.</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {PRACTICE_TYPES.map((p) => (
                <button key={p.id} onClick={() => setPtype(p.id)} className={cn("h-8 rounded-md border px-2.5 text-[12.5px] transition-colors", ptype === p.id ? "border-accent bg-accent-soft text-accent" : "border-border text-secondary hover:border-strong")}>{p.label}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input value={ptopic} onChange={(e) => setPtopic(e.target.value)} placeholder={`Topic (default: ${profile.language})`} aria-label="Practice topic" className="h-9 min-w-[200px] flex-1 rounded-md border border-strong bg-surface px-3 text-[13px] text-primary outline-none focus:border-accent" />
              <Segmented value={difficulty} onChange={setDifficulty} options={(["Easy", "Medium", "Hard"] as const).map((d) => ({ value: d, label: d }))} />
              <Button variant="secondary" onClick={startPractice}>Generate</Button>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="animate-fade-up">
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">Your lessons</p>
            {lessons.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3.5 py-4 text-[12.5px] text-muted">No lessons yet. Your guided lessons will appear here.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-surface">
                {lessons.slice(0, 8).map((c, i) => (
                  <button key={c.id} onClick={() => onNavigate("chat", c.id)} className={cn("group flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-2", i && "border-t border-border")}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-primary">{c.title}</span>
                      <span className="text-[11px] text-muted">{c.messages.length} messages · {relTime(c.updatedAt)}</span>
                    </span>
                    <ArrowRight className="size-3.5 text-muted opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="animate-fade-up rounded-lg border border-border bg-surface p-3.5">
            <div className="mb-1.5 flex items-center gap-2">
              <Link2Off className="size-3.5 text-muted" />
              <p className="text-[12.5px] font-medium text-primary">CodeQuest courses</p>
            </div>
            <p className="text-[12px] leading-[18px] text-muted">
              Course integration isn't connected in this environment, so Lumen can't see your assigned lessons or progress. When connected, it explains your current lesson without unlocking restricted content.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
