import { useState } from "react";
import { ArrowRight, Clock, Hammer, Plug } from "lucide-react";
import { Composer } from "../components/Composer";
import { HexBackground } from "../components/HexBackground";
import { useProfile } from "../context/ProfileContext";
import { useConnection } from "../hooks/useTutor";
import { conversations, projects, relTime } from "../lib/store";
import type { Attachment, Mode } from "../lib/store";
import { MODES, modeMeta } from "../lib/modes";
import { firstName } from "../lib/profile";
import { greeting } from "../lib/nav";
import type { Page } from "../lib/nav";
import { cn } from "../utils/cn";

export function Home({
  onNavigate,
  onStart,
}: {
  onNavigate: (p: Page, arg?: string) => void;
  onStart: (mode: Mode, text: string, atts?: Attachment[]) => void;
}) {
  const { profile } = useProfile();
  const convs = conversations.use();
  const projs = projects.use();
  const conn = useConnection();
  const [mode, setMode] = useState<Mode>("ask");
  const me = firstName(profile);

  const recentConv = convs.filter((c) => !c.archived && c.messages.length).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const recentProject = projs.filter((p) => p.status === "active").sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const lang = profile.language;

  /* Suggestions come only from data that actually exists, plus clearly generic starters. */
  const suggestions: { label: string; mode: Mode; text: string; from?: string }[] = [];
  if (recentConv) suggestions.push({ label: `Continue “${recentConv.title}”`, mode: recentConv.mode, text: "", from: "Recent conversation" });
  if (profile.focus.trim()) suggestions.push({ label: `Next step on: ${profile.focus.trim()}`, mode: "learn", text: `Help me take the next step on: ${profile.focus.trim()}`, from: "Your learning goal" });
  if (recentProject) suggestions.push({ label: `Help me improve ${recentProject.name}`, mode: "build", text: `Review my project "${recentProject.name}" and suggest the most useful next improvement.`, from: "Your project" });
  suggestions.push(
    { label: `Teach me ${lang} functions step by step`, mode: "learn", text: `Teach me ${lang} functions step by step.` },
    { label: "Explain recursion with an example", mode: "ask", text: "Explain recursion using a simple example." },
    { label: "Visualise how binary search works", mode: "visualise", text: "Visualise how binary search works, step by step." },
    { label: "Generate a practice exercise", mode: "learn", text: `Generate one ${lang} practice exercise at my level. Don't show the solution until I attempt it.` }
  );

  const pick = (s: (typeof suggestions)[number]) => {
    if (!s.text && recentConv) return onNavigate("chat", recentConv.id);
    onStart(s.mode, s.text);
  };

  return (
    <div className="relative min-h-full">
      <HexBackground className="pointer-events-none absolute inset-0 h-full w-full [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div className="relative mx-auto w-full max-w-[860px] px-5 pb-20 pt-10 md:px-8 md:pt-16">
        <header className="animate-fade-up mb-7">
          <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
            {greeting()}{me !== "there" ? `, ${me}` : ""}
          </p>
          <h1 className="font-display text-[38px] leading-[1.06] text-primary md:text-[52px]">What are we learning today?</h1>
          <p className="mt-3 max-w-lg text-[15px] leading-[24px] text-secondary">
            Explore a concept, solve a problem, write code or build something new.
          </p>
          {(recentConv || recentProject) && (
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
              <Clock className="size-3.5" />
              {recentConv && (
                <button onClick={() => onNavigate("chat", recentConv.id)} className="hover:text-primary">
                  Last: <span className="text-secondary">{recentConv.title}</span> · {relTime(recentConv.updatedAt)}
                </button>
              )}
              {recentProject && (
                <button onClick={() => onNavigate("project", recentProject.id)} className="inline-flex items-center gap-1 hover:text-primary">
                  <Hammer className="size-3" /> <span className="text-secondary">{recentProject.name}</span>
                </button>
              )}
            </p>
          )}
        </header>

        {conn.status !== "ok" && conn.status !== "checking" && (
          <div className="animate-fade-up mb-4 flex items-start gap-3 rounded-lg border border-warn/35 bg-warn/[0.07] px-3.5 py-3">
            <Plug className="mt-0.5 size-4 flex-none text-warn" />
            <div className="min-w-0 flex-1 text-[13px] leading-5 text-secondary">
              <strong className="font-medium text-primary">Lumen isn't connected to an AI backend.</strong>{" "}
              {conn.status === "error" ? conn.error + "." : "Conversations won't get responses until one is configured."} The code editor, runner, diagrams and library all work without it.
            </div>
            <button onClick={() => onNavigate("settings")} className="flex-none text-[12.5px] font-medium text-accent hover:text-accent-hover">Configure</button>
          </div>
        )}

        {/* mode selector — compact, one row */}
        <div data-tour="tools" role="radiogroup" aria-label="Learning mode" className="animate-fade-up mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5" style={{ animationDelay: "0.04s" }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "ring-focus group flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-all duration-150",
                mode === m.id ? "border-accent bg-accent-soft" : "border-border bg-surface/80 hover:-translate-y-px hover:border-strong hover:bg-surface"
              )}
            >
              <m.icon className={cn("size-4 transition-colors", mode === m.id ? "text-accent" : "text-muted group-hover:text-secondary")} />
              <span className="text-[13px] font-medium text-primary">{m.short}</span>
              <span className="line-clamp-2 text-[11.5px] leading-4 text-muted">{m.desc}</span>
            </button>
          ))}
        </div>

        <div className="animate-fade-up mb-6" style={{ animationDelay: "0.07s" }}>
          <Composer
            size="lg"
            autoFocus
            placeholder={modeMeta(mode).placeholder}
            onSend={(text, atts) => onStart(mode, text, atts)}
          />
        </div>

        <section className="animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">Suggestions</p>
          <div className="overflow-hidden rounded-lg border border-border bg-surface/80 backdrop-blur-sm">
            {suggestions.slice(0, 6).map((s, i) => {
              const M = modeMeta(s.mode);
              return (
                <button key={i} onClick={() => pick(s)} className={cn("group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2", i && "border-t border-border")}>
                  <M.icon className="size-3.5 flex-none text-muted group-hover:text-accent" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-primary">{s.label}</span>
                  {s.from && <span className="hidden flex-none text-[11px] text-muted sm:inline">{s.from}</span>}
                  <ArrowRight className="size-3.5 flex-none text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
