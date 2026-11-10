export type LevelId = "beginner" | "intermediate" | "advanced" | "expert";

export interface Profile {
  name: string;
  nickname: string;
  role: string;
  level: LevelId;
  years: number;
  goals: string[];
  focus: string;
  style: string[];
  pacing: string;
  length: string;
  language: string;
  framework: string;
  editorTheme: string;
  minutes: number;
  when: string;
  accountability: boolean;
  completedAt: number | null;
}

export const EMPTY_PROFILE: Profile = {
  name: "",
  nickname: "",
  role: "",
  level: "intermediate",
  years: 1,
  goals: [],
  focus: "",
  style: ["diagrams", "code-first"],
  pacing: "Balanced",
  length: "Balanced",
  language: "TypeScript",
  framework: "React",
  editorTheme: "Lumen Dark",
  minutes: 45,
  when: "Evenings",
  accountability: true,
  completedAt: null,
};

export const ROLES = [
  "Self-taught developer",
  "Working engineer",
  "Student",
  "Career switcher",
  "Designer who codes",
  "Data / ML practitioner",
  "Founder or PM",
];

export const LEVELS: { id: LevelId; label: string; desc: string }[] = [
  { id: "beginner", label: "Beginner", desc: "New to this — I need the why, not just the how." },
  { id: "intermediate", label: "Intermediate", desc: "I can build things, but I'm patchy on fundamentals." },
  { id: "advanced", label: "Advanced", desc: "Comfortable in production code; I want depth and trade-offs." },
  { id: "expert", label: "Expert", desc: "Skip the basics. Lead with edge cases and system design." },
];

export const GOALS = [
  "Learn the fundamentals",
  "Ship a real project",
  "Prepare for interviews",
  "Switch careers",
  "Go deep in one language",
  "Build a product",
  "Teach or mentor others",
];

export const STYLES: { id: string; label: string; line: string }[] = [
  { id: "analogies", label: "Use analogies", line: "Explain new ideas through things I already know." },
  { id: "diagrams", label: "Show diagrams", line: "Visualise processes and systems whenever it helps." },
  { id: "code-first", label: "Code-first", line: "Lead with a working example, then explain it." },
  { id: "step-code", label: "Break code into steps", line: "Break code down line by line and token by token." },
  { id: "exercises", label: "Practice exercises", line: "End lessons with short exercises I have to complete." },
  { id: "check-in", label: "Check in first", line: "Confirm I've understood before moving on to the next section." },
];

export const LANGUAGES = ["TypeScript", "JavaScript", "Python", "Go", "Rust", "SQL", "C#"];
export const FRAMEWORKS = ["React", "Next.js", "Vue", "Svelte", "Node / Express", "Django", "None yet"];
export const EDITOR_THEMES = ["Lumen Dark", "Lumen Light", "Midnight", "Paper"];
export const PACINGS = ["Slow and thorough", "Balanced", "Fast and direct"];
export const LENGTHS = ["Concise", "Balanced", "Detailed"];
export const TIMES = ["Mornings", "Lunch breaks", "Evenings", "Weekends"];

const LEVEL_RULES: Record<LevelId, string> = {
  beginner: "Assume I know very little. Define any jargon the first time you use it.",
  intermediate:
    "Don't over-explain syntax, but never skip the reasoning behind a design decision.",
  advanced: "Skip the basics. Lead with trade-offs, failure modes and alternatives.",
  expert: "Assume fluency. Go straight to edge cases, system design and the parts that are hard.",
};

const line = (s: string) => `- ${s}`;

export function firstName(p: Profile) {
  const n = (p.nickname || p.name).trim();
  return n ? n.split(/\s+/)[0] : "there";
}

export function initials(p: Profile) {
  const n = p.name.trim();
  if (!n) return "L";
  const parts = n.split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function styleLabels(p: Profile) {
  return STYLES.filter((s) => p.style.includes(s.id)).map((s) => s.label);
}

/** One-line human summary used in chips and the sidebar. */
export function profileSummary(p: Profile) {
  const bits = [
    LEVELS.find((l) => l.id === p.level)?.label,
    p.language,
    p.framework !== "None yet" ? p.framework : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

/**
 * The core deliverable of onboarding: every answer, converted into a single
 * plain-text context brief that gets handed to the tutor on every session.
 */
export function buildTutorPrompt(p: Profile): string {
  const name = p.name.trim() || "Unnamed learner";
  const address = p.nickname.trim() ? p.nickname.trim() : firstName(p);

  const out: string[] = [
    "You are Lumen — my AI tutor, visual explainer and build partner.",
    "This brief is generated from my onboarding answers. Use it to shape every response.",
    "",
    "WHO I AM",
    line(`Name: ${name}`),
    line(`Address me as: ${address}`),
    line(`Role: ${p.role || "Not specified"}`),
    line(
      `Level: ${LEVELS.find((l) => l.id === p.level)?.label} — roughly ${
        p.years
      } ${p.years === 1 ? "year" : "years"} of experience`
    ),
    "",
    "WHAT I'M WORKING TOWARD",
    ...(p.goals.length
      ? p.goals.map((g) => line(`Goal: ${g}`))
      : [line("Goal: not specified — ask me what I'm aiming for")]),
    line(`Main focus: ${p.focus.trim() || "Not specified"}`),
    "",
    "HOW TO TEACH ME",
    ...(styleLabels(p).length
      ? STYLES.filter((s) => p.style.includes(s.id)).map((s) => line(s.line))
      : [line("Default to clear explanations with one worked example.")]),
    line(`Pacing: ${p.pacing}`),
    line(`Answer length: ${p.length}`),
    "",
    "MY TOOLING",
    line(`Preferred language: ${p.language}`),
    line(`Framework: ${p.framework}`),
    line(`Editor theme: ${p.editorTheme}`),
    "",
    "MY TIME",
    line(`I can commit about ${p.minutes} minutes a day, usually in the ${p.when.toLowerCase()}.`),
    p.accountability
      ? line("Hold me accountable: nudge me if I go quiet and track my streak.")
      : line("Don't nag me — I'll come back when I'm ready."),
    "",
    "RULES TO FOLLOW",
    line(LEVEL_RULES[p.level]),
    line("End every answer with one concrete next step I can take immediately."),
    line("If my question is beyond my current level, say so and teach the prerequisite first."),
    line(
      `Write all examples in ${p.language}${
        p.framework !== "None yet" ? ` with ${p.framework}` : ""
      } unless I ask otherwise.`
    ),
  ];

  return out.join("\n");
}
