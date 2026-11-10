import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  FileText,
  RotateCcw,
  X,
} from "lucide-react";
import { Button, Slider } from "../components/ui";
import { LumenMark } from "../components/LumenMark";
import { useProfile } from "../context/ProfileContext";
import {
  EDITOR_THEMES,
  EMPTY_PROFILE,
  FRAMEWORKS,
  GOALS,
  LANGUAGES,
  LENGTHS,
  LEVELS,
  PACINGS,
  ROLES,
  STYLES,
  TIMES,
  buildTutorPrompt,
  firstName,
} from "../lib/profile";
import type { LevelId, Profile } from "../lib/profile";
import { cn } from "../utils/cn";

const STEPS = [
  {
    kicker: "Step 01",
    title: "Who am I teaching?",
    sub: "Your name and where you're coming from. This shapes how Lumen talks to you.",
  },
  {
    kicker: "Step 02",
    title: "Where are you now?",
    sub: "Be honest rather than modest — Lumen calibrates depth and vocabulary to this.",
  },
  {
    kicker: "Step 03",
    title: "What are you after?",
    sub: "Pick everything that applies, then tell Lumen the one thing that matters most.",
  },
  {
    kicker: "Step 04",
    title: "How should it teach you?",
    sub: "These become standing instructions. You can change any of them later in Settings.",
  },
  {
    kicker: "Step 05",
    title: "What are you writing?",
    sub: "Every example, snippet and starter file will default to this stack.",
  },
  {
    kicker: "Step 06",
    title: "When will you show up?",
    sub: "Consistency beats intensity. Lumen will pace lessons around your real schedule.",
  },
];

export function Onboarding() {
  const { profile, completeOnboarding } = useProfile();
  // Returning users keep their previous answers so retaking is a quick edit, not a redo.
  const [draft, setDraft] = useState<Profile>(profile);
  const [step, setStep] = useState(profile.completedAt ? 6 : 0);
  const [copied, setCopied] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const briefRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const toggle = (k: "goals" | "style", id: string) =>
    setDraft((d) => ({
      ...d,
      [k]: d[k].includes(id) ? d[k].filter((x) => x !== id) : [...d[k], id],
    }));

  const brief = useMemo(() => buildTutorPrompt(draft), [draft]);
  const lines = brief.split("\n");

  useEffect(() => {
    const el = briefRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length, step]);

  const canContinue = (() => {
    switch (step) {
      case 0:
        return draft.name.trim().length > 1 && Boolean(draft.role);
      case 1:
        return true;
      case 2:
        return draft.goals.length > 0;
      case 3:
        return draft.style.length > 0;
      case 4:
        return Boolean(draft.language);
      case 5:
        return true;
      default:
        return true;
    }
  })();

  const next = () => {
    if (!canContinue) return;
    if (step < STEPS.length) setStep((s) => s + 1);
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const finish = () => {
    completeOnboarding(draft);
  };

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  const done = step === STEPS.length;
  const meta = done ? null : STEPS[step];
  const progress = ((done ? STEPS.length : step) / STEPS.length) * 100;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-app">
      {/* ambient layers */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-border" />
      
      <div className="pointer-events-none absolute inset-y-0 left-[58%] hidden w-px bg-gradient-to-b from-transparent via-border to-transparent lg:block" />

      {/* top bar */}
      <div className="relative z-10 flex h-14 flex-none items-center gap-3 border-b border-border px-5 md:px-8">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent-soft text-accent ring-1 ring-accent-line">
          <LumenMark className="size-[17px]" />
        </span>
        <span className="font-display text-[18px] text-primary">
          Lumen
        </span>
        <span className="hidden text-[12px] text-muted sm:inline">Calibrating your tutor</span>
        <div className="flex-1" />
        <span className="hidden font-mono text-[11px] text-muted md:inline">
          {done ? "Brief ready" : `${STEPS.length - step} left`}
        </span>
        <button
          onClick={() =>
            completeOnboarding(
              draft.name.trim()
                ? draft
                : draft
            )
          }
          title="Skip — you can fill in your learning profile later"
          className="text-[12.5px] text-muted transition-colors hover:text-primary"
        >
          Skip for now
        </button>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1">
        {/* ---------- left: the questions ---------- */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto w-full max-w-[620px] flex-1 px-5 pb-6 pt-8 md:px-8 md:pt-14">
            {/* step rail */}
            <div className="mb-8 flex gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => i < step && setStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                  className="group relative h-1 flex-1 overflow-hidden rounded-full bg-surface-3"
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full transition-all duration-500",
                      i < step || (done && true) ? "w-full bg-accent" : "w-0 bg-accent",
                      i === step && !done && "w-full bg-accent/45"
                    )}
                  />
                </button>
              ))}
            </div>

            {!done && meta && (
              <div key={step} className="animate-fade-up">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
                  {meta.kicker}
                </p>
                <h1 className="font-display text-[32px] leading-[1.12] text-primary md:text-[42px]">
                  {meta.title}
                </h1>
                <p className="mt-2.5 text-[14px] leading-6 text-secondary">{meta.sub}</p>
              </div>
            )}

            {done && (
              <div className="animate-fade-up">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-accent-2">
                  Complete
                </p>
                <h1 className="font-display text-[32px] leading-[1.12] text-primary md:text-[42px]">
                  Here's what Lumen now knows about you.
                </h1>
                <p className="mt-2.5 text-[14px] leading-6 text-secondary">
                  This brief is attached to every session — conversations, lessons, canvases and
                  code reviews. Edit it any time in Settings.
                </p>
              </div>
            )}

            <div className="mt-8">
              {step === 0 && (
                <StepIdentity draft={draft} set={set} />
              )}
              {step === 1 && <StepLevel draft={draft} set={set} />}
              {step === 2 && <StepGoals draft={draft} set={set} toggle={toggle} />}
              {step === 3 && <StepStyle draft={draft} set={set} toggle={toggle} />}
              {step === 4 && <StepStack draft={draft} set={set} />}
              {step === 5 && <StepTime draft={draft} set={set} />}
              {step === 6 && (
                <StepReview
                  brief={brief}
                  name={firstName(draft)}
                  copied={copied}
                  onCopy={copyBrief}
                  onRestart={() => {
                    setStep(0);
                    setDraft({ ...EMPTY_PROFILE });
                  }}
                />
              )}
            </div>
          </div>

          {/* footer nav */}
          <div className="sticky bottom-0 flex-none border-t border-border bg-app/85 px-5 py-3 backdrop-blur md:px-8">
            <div className="mx-auto flex w-full max-w-[620px] items-center gap-3">
              <Button variant="ghost" onClick={back} disabled={step === 0}>
                <ArrowLeft className="size-3.5" />
                Back
              </Button>
              <span className="hidden flex-1 items-center gap-2 text-[12px] text-muted sm:flex">
                {done ? (
                  <>
                    <Check className="size-3.5 text-accent-2" />
                    All six steps answered
                  </>
                ) : (
                  <>
                    <kbd>↵</kbd> to continue
                    {!canContinue && (
                      <span className="text-warn">
                        {step === 0 ? "— add your name and role" : step === 2 ? "— pick a goal" : step === 3 ? "— pick a style" : ""}
                      </span>
                    )}
                  </>
                )}
              </span>
              <div className="flex-1 sm:flex-none" />
              <button
                onClick={() => setBriefOpen(true)}
                className="flex items-center gap-1.5 text-[12.5px] font-medium text-secondary transition-colors hover:text-primary lg:hidden"
              >
                <FileText className="size-3.5" />
                Brief
                <ChevronDown className="size-3" />
              </button>
              {done ? (
                <Button variant="primary" size="lg" onClick={finish}>
                  Enter Lumen
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button variant="primary" size="lg" onClick={next} disabled={!canContinue}>
                  Continue
                  <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
            <div className="mx-auto mt-2.5 h-px w-full max-w-[620px] overflow-hidden rounded-full bg-transparent">
              <div
                className="h-px bg-accent transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* ---------- right: live context brief ---------- */}
        <aside
          className={cn(
            "fixed inset-x-0 bottom-0 top-14 z-20 flex w-full flex-col border-t border-border bg-surface transition-transform duration-300 lg:static lg:z-auto lg:w-[420px] lg:flex-none lg:border-l lg:border-t-0 lg:translate-y-0 xl:w-[460px]",
            briefOpen ? "translate-y-0" : "translate-y-full lg:translate-y-0"
          )}
        >
          <div className="flex flex-none items-center gap-2 border-b border-border px-4 py-3">
            <FileText className="size-3.5 text-muted" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Context brief · live
            </p>
            <span className="ml-auto flex items-center gap-1.5">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-2 opacity-70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-accent-2" />
              </span>
              <span className="font-mono text-[10.5px] text-muted">
                {lines.filter(Boolean).length} lines
              </span>
            </span>
            <button
              onClick={() => setBriefOpen(false)}
              className="rounded-md p-1 text-muted hover:text-primary lg:hidden"
              aria-label="Close brief"
            >
              <X className="size-4" />
            </button>
          </div>

          <div
            ref={briefRef}
            className="code-chrome min-h-0 flex-1 overflow-y-auto bg-code-bg px-4 py-4 font-mono text-[11.5px] leading-[19px]"
          >
            {lines.map((l, i) => (
              <div
                key={`${step}-${i}`}
                className={cn(
                  "animate-thought-line whitespace-pre-wrap",
                  /^[A-Z][A-Z ]+$/.test(l.trim()) && l.trim() !== ""
                    ? "mt-3 font-semibold tracking-[0.08em] text-tok-kw first:mt-0"
                    : l.startsWith("You are Lumen") || l.startsWith("This brief")
                      ? "text-code-muted"
                      : "text-code"
                )}
                style={{ animationDelay: `${Math.min(i * 8, 320)}ms` }}
              >
                {l || "\u00A0"}
              </div>
            ))}
            {!done && (
              <div className="mt-4 flex items-center gap-2 text-code-muted">
                <span className="stream-cursor" />
                <span className="text-[11px]">waiting for your answers…</span>
              </div>
            )}
          </div>

          <div className="flex flex-none items-center gap-2 border-t border-border bg-surface px-4 py-3">
            <Button size="sm" onClick={copyBrief}>
              {copied ? <Check className="size-3.5 text-accent-2" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy brief"}
            </Button>
            <p className="text-[11px] leading-4 text-muted">
              Attached automatically to every Lumen session.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------------- pieces ---------------- */

function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="mb-5">
      <label className="mb-2 flex items-baseline gap-2 text-[12.5px] font-medium text-primary">
        {label}
        {required && <span className="text-[11px] text-warn">required</span>}
        {hint && <span className="ml-auto text-[11.5px] font-normal text-muted">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  maxLength?: number;
}) {
  return (
    <input
      value={value}
      autoFocus={autoFocus}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-11 w-full rounded-lg border border-strong bg-surface px-3.5 text-[14px] text-primary outline-none transition-all placeholder:text-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10"
    />
  );
}

function OptionCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "ring-focus group relative flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors duration-100",
        active
          ? "border-accent bg-accent-soft"
          : "border-border bg-surface hover:border-strong hover:bg-surface-2"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 flex-none items-center justify-center rounded-full border transition-colors",
          active ? "border-accent bg-accent text-white" : "border-strong text-transparent"
        )}
      >
        <Check className="size-2.5" strokeWidth={3} />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[13.5px] font-medium", active ? "text-primary" : "text-primary")}>
          {title}
        </span>
        {desc && <span className="mt-0.5 block text-[12px] leading-5 text-secondary">{desc}</span>}
      </span>
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "ring-focus inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors duration-100 active:translate-y-px",
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-border bg-surface text-secondary hover:border-strong hover:text-primary"
      )}
    >
      {active && <Check className="size-3" strokeWidth={3} />}
      {children}
    </button>
  );
}

function StepIdentity({
  draft,
  set,
}: {
  draft: Profile;
  set: <K extends keyof Profile>(k: K, v: Profile[K]) => void;
}) {
  return (
    <div className="animate-fade-up">
      <Field label="Your name" required hint="Used in the brief and your workspace">
        <TextInput
          value={draft.name}
          onChange={(v) => set("name", v)}
          placeholder="Your name"
          autoFocus
        />
      </Field>
      <Field label="What should Lumen call you?" hint="Defaults to your first name">
        <TextInput
          value={draft.nickname}
          onChange={(v) => set("nickname", v)}
          placeholder={draft.name ? firstName(draft) : "Alex"}
        />
      </Field>
      <Field label="Which best describes you?" required>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLES.map((r) => (
            <OptionCard
              key={r}
              title={r}
              active={draft.role === r}
              onClick={() => set("role", r)}
            />
          ))}
        </div>
      </Field>
    </div>
  );
}

function StepLevel({
  draft,
  set,
}: {
  draft: Profile;
  set: <K extends keyof Profile>(k: K, v: Profile[K]) => void;
}) {
  return (
    <div className="animate-fade-up">
      <Field label="Skill level" required>
        <div className="space-y-2">
          {LEVELS.map((l) => (
            <OptionCard
              key={l.id}
              title={l.label}
              desc={l.desc}
              active={draft.level === l.id}
              onClick={() => set("level", l.id as LevelId)}
            />
          ))}
        </div>
      </Field>
      <Field label="Years of experience" hint={`${draft.years} ${draft.years === 1 ? "year" : "years"}`}>
        <Slider value={draft.years} onChange={(v) => set("years", v)} min={0} max={15} labels={["0", "5", "10", "15+"]} />
      </Field>
    </div>
  );
}

function StepGoals({
  draft,
  set,
  toggle,
}: {
  draft: Profile;
  set: <K extends keyof Profile>(k: K, v: Profile[K]) => void;
  toggle: (k: "goals" | "style", id: string) => void;
}) {
  return (
    <div className="animate-fade-up">
      <Field label="Goals" required hint={`${draft.goals.length} selected`}>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <Chip key={g} active={draft.goals.includes(g)} onClick={() => toggle("goals", g)}>
              {g}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="What are you actually trying to make or learn?" hint="One sentence is plenty">
        <textarea
          value={draft.focus}
          onChange={(e) => set("focus", e.target.value)}
          rows={3}
          maxLength={180}
          placeholder="I want to build a realtime coding competition platform and understand the backend well enough to run it myself."
          className="w-full resize-none rounded-lg border border-strong bg-surface px-3.5 py-3 text-[14px] leading-6 text-primary outline-none transition-all placeholder:text-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10"
        />
        <p className="mt-1 text-right font-mono text-[10.5px] text-muted">
          {draft.focus.length}/180
        </p>
      </Field>
    </div>
  );
}

function StepStyle({
  draft,
  set,
  toggle,
}: {
  draft: Profile;
  set: <K extends keyof Profile>(k: K, v: Profile[K]) => void;
  toggle: (k: "goals" | "style", id: string) => void;
}) {
  return (
    <div className="animate-fade-up">
      <Field label="Teaching style" required hint="Pick as many as you like">
        <div className="grid gap-2 sm:grid-cols-2">
          {STYLES.map((s) => (
            <OptionCard
              key={s.id}
              title={s.label}
              desc={s.line}
              active={draft.style.includes(s.id)}
              onClick={() => toggle("style", s.id)}
            />
          ))}
        </div>
      </Field>
      <Field label="Pacing">
        <div className="flex flex-wrap gap-2">
          {PACINGS.map((p) => (
            <Chip key={p} active={draft.pacing === p} onClick={() => set("pacing", p)}>
              {p}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Answer length">
        <div className="flex flex-wrap gap-2">
          {LENGTHS.map((l) => (
            <Chip key={l} active={draft.length === l} onClick={() => set("length", l)}>
              {l}
            </Chip>
          ))}
        </div>
      </Field>
    </div>
  );
}

function StepStack({
  draft,
  set,
}: {
  draft: Profile;
  set: <K extends keyof Profile>(k: K, v: Profile[K]) => void;
}) {
  return (
    <div className="animate-fade-up">
      <Field label="Preferred language" required hint="All examples will use this">
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <Chip key={l} active={draft.language === l} onClick={() => set("language", l)}>
              {l}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Framework">
        <div className="flex flex-wrap gap-2">
          {FRAMEWORKS.map((f) => (
            <Chip key={f} active={draft.framework === f} onClick={() => set("framework", f)}>
              {f}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Editor theme">
        <div className="flex flex-wrap gap-2">
          {EDITOR_THEMES.map((t) => (
            <Chip key={t} active={draft.editorTheme === t} onClick={() => set("editorTheme", t)}>
              {t}
            </Chip>
          ))}
        </div>
      </Field>
    </div>
  );
}

function StepTime({
  draft,
  set,
}: {
  draft: Profile;
  set: <K extends keyof Profile>(k: K, v: Profile[K]) => void;
}) {
  return (
    <div className="animate-fade-up">
      <Field label="Daily commitment" hint={`${draft.minutes} min / day`}>
        <Slider
          value={draft.minutes}
          onChange={(v) => set("minutes", v)}
          min={10}
          max={240}
          step={5}
          labels={["10m", "1h", "2h", "4h"]}
        />
      </Field>
      <Field label="When do you usually work?">
        <div className="flex flex-wrap gap-2">
          {TIMES.map((t) => (
            <Chip key={t} active={draft.when === t} onClick={() => set("when", t)}>
              {t}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Accountability">
        <OptionCard
          title="Nudge me when I go quiet"
          desc="Track my streak and surface the next step when I return after a break."
          active={draft.accountability}
          onClick={() => set("accountability", !draft.accountability)}
        />
        <div className="mt-2">
          <OptionCard
            title="Leave me alone"
            desc="No nudges. I'll pick things back up on my own schedule."
            active={!draft.accountability}
            onClick={() => set("accountability", !draft.accountability)}
          />
        </div>
      </Field>
    </div>
  );
}

function StepReview({
  brief,
  name,
  copied,
  onCopy,
  onRestart,
}: {
  brief: string;
  name: string;
  copied: boolean;
  onCopy: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="animate-fade-up space-y-3">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="font-display text-[19px] text-primary">
          Ready when you are, {name}.
        </p>
        <p className="mt-1.5 text-[13px] leading-6 text-secondary">
          Six answers, one brief. Lumen will greet you by name, pitch explanations to your level,
          write every example in your language, and pace lessons around the time you actually have.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { k: "Attached to", v: "Every conversation, lesson and canvas" },
          { k: "Visible", v: "Any time from the chat header" },
          { k: "Editable", v: "Settings → Account & Learning" },
          { k: "Regenerated", v: "Instantly when you change an answer" },
        ].map((r) => (
          <div key={r.k} className="rounded-lg border border-border bg-surface px-3.5 py-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{r.k}</p>
            <p className="mt-1 text-[12.5px] text-primary">{r.v}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={onCopy}>
          {copied ? <Check className="size-3.5 text-accent-2" /> : <Copy className="size-3.5" />}
          {copied ? "Brief copied" : "Copy full brief"}
        </Button>
        <Button variant="ghost" onClick={onRestart}>
          <RotateCcw className="size-3.5" />
          Start over
        </Button>
      </div>
      <p className="font-mono text-[10.5px] text-muted">{brief.length} characters</p>
    </div>
  );
}
