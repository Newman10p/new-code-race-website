import { ArrowUpRight, Info, Sparkles } from "lucide-react";
import { PROMPT_CARDS } from "../../lib/aiTools";
import type { PromptCard } from "../../lib/aiTools";
import { greeting } from "../../lib/nav";
import { AiOrb } from "./primitives";

export function AiWelcome({
  name,
  connected,
  modelLabel,
  onPrompt,
}: {
  name: string;
  connected: boolean;
  modelLabel: string;
  onPrompt: (card: PromptCard) => void;
}) {
  const firstName = name.trim().split(/\s+/)[0];

  return (
    <div className="relative mx-auto flex min-h-full w-full max-w-[920px] flex-col px-4 py-8 sm:px-6 md:py-12">
      <div className="pointer-events-none absolute -top-10 left-1/4 h-64 w-64 rounded-full bg-[#6d4aff]/10 blur-[90px]" />
      <div className="pointer-events-none absolute right-10 top-24 h-48 w-48 rounded-full bg-[#22d3ee]/[0.06] blur-[80px]" />

      <div className="cr-rise relative my-auto w-full">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-accent-line/60 bg-accent-soft px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#c4b5fd]">
                <Sparkles className="size-2.5" />
                CODE RACE AI
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
                <span className="size-1.5 rounded-full bg-accent-2 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                Workspace ready
              </span>
            </div>

            <h1 className="cr-display mt-4 text-[34px] leading-[1.04] text-primary sm:text-[42px] lg:text-[48px]">
              Your AI <span className="cr-text-gradient">pair programmer</span>.
            </h1>

            <p className="mt-3 max-w-[560px] text-[13.5px] leading-6 text-secondary sm:text-[14.5px]">
              {firstName ? `${greeting()}, ${firstName}. ` : ""}
              Explain a concept, trace a bug, review a project or work through a challenge — with your language,
              project and files in view.
            </p>
          </div>

          <div className="hidden flex-none pt-2 sm:block">
            <AiOrb size={112} className="lg:hidden" />
            <AiOrb size={128} className="hidden lg:block" />
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-2.5 flex items-center gap-2">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted/80">Suggested prompts</p>
            <span className="h-px flex-1 bg-border/70" />
            <span className="hidden text-[10px] text-muted/70 sm:block">Click a card to send it</span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PROMPT_CARDS.map((card, i) => (
              <button
                key={card.id}
                onClick={() => onPrompt(card)}
                style={{ animationDelay: `${i * 35}ms` }}
                className="cr-card group relative overflow-hidden rounded-xl border border-border bg-surface/50 p-3 text-left"
              >
                <div className="flex items-start gap-2">
                  <span className="flex size-7 flex-none items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.035] text-[#a78bfa]">
                    <card.icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 pt-1 text-[12px] font-semibold text-primary">{card.title}</span>
                  <ArrowUpRight className="size-3.5 flex-none text-muted/50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#a78bfa]" />
                </div>
                <p className="mt-2 line-clamp-2 text-[11px] leading-[17px] text-secondary">“{card.prompt}”</p>
                <p className="mt-1.5 line-clamp-1 text-[10px] text-muted/70">{card.blurb}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3.5 text-[10.5px] text-muted">
          {connected ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-accent-2" />
              Connected · <span className="max-w-[220px] truncate text-secondary">{modelLabel}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Info className="size-3 text-warn/80" />
              Demo workspace — replies are clearly labelled local samples.
            </span>
          )}
          <span className="ml-auto hidden items-center gap-2 sm:flex">
            <kbd className="rounded border border-border bg-surface-2 px-1 py-px font-sans text-[9px] text-muted">⌘K</kbd>
            <span>search</span>
            <span className="text-muted/50">·</span>
            <span>Shift + Enter for a new line</span>
          </span>
        </div>
      </div>
    </div>
  );
}
