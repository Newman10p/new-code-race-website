import {
  Bug,
  Code2,
  GraduationCap,
  Layers,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Trophy,
  Wand2,
  Wrench,
  BrainCircuit,
  BookOpen,
  Hammer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Mode } from "./store";

/* =========================================================================
 * CodeQuest AI — tool + language metadata.
 * Pure data: no store imports (the store uses these types), so it is safe to
 * consume from anywhere. Every tool maps onto the platform's existing tutor
 * engine via `mode`, adding a focused instruction on top.
 * ========================================================================= */

export type ToolId = "auto" | "explain" | "code" | "debug" | "review" | "learn" | "challenge";
export type AiLanguage = "python" | "javascript" | "cpp";

export interface ToolMeta {
  id: ToolId;
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
  placeholder: string;
  mode: Mode;
  /** Tailwind text colour for the tool's marker. */
  tint: string;
  instruction: string;
}

export const AI_TOOLS: ToolMeta[] = [
  {
    id: "auto",
    label: "Auto",
    short: "Auto",
    description: "Routes each message to the right assistant.",
    icon: Sparkles,
    placeholder: "Ask CodeQuest AI anything — or paste code and an error…",
    mode: "ask",
    tint: "text-[#a78bfa]",
    instruction: "",
  },
  {
    id: "explain",
    label: "Explain",
    short: "Explain",
    description: "Break down concepts, code and systems.",
    icon: BookOpen,
    placeholder: "What should I explain? Paste code or name a concept…",
    mode: "ask",
    tint: "text-[#67e8f9]",
    instruction: "TOOL: Explain. Build understanding from the ground up with a short analogy, a worked example and one practical application. Highlight the key idea in bold.",
  },
  {
    id: "code",
    label: "Code",
    short: "Code",
    description: "Write, refactor and complete code.",
    icon: Code2,
    placeholder: "Describe what you want to build or change…",
    mode: "code",
    tint: "text-[#7cb0ff]",
    instruction: "TOOL: Code. Produce complete, runnable code with a short explanation of the decisions. Mark anything that still needs the user's input.",
  },
  {
    id: "debug",
    label: "Debug",
    short: "Debug",
    description: "Trace errors and fix the root cause.",
    icon: Bug,
    placeholder: "Paste the error and the relevant code…",
    mode: "code",
    tint: "text-[#fca5a5]",
    instruction: "TOOL: Debug. Structure the reply as: error summary, the relevant code, why it happens, the correction, then verification steps. Never claim to have executed code.",
  },
  {
    id: "review",
    label: "Review",
    short: "Review",
    description: "Audit quality, bugs and security.",
    icon: ShieldCheck,
    placeholder: "Share code or describe the project you want reviewed…",
    mode: "code",
    tint: "text-[#6ee7b7]",
    instruction: "TOOL: Review. Assess correctness, potential bugs, readability, performance and security. Be specific and prioritise the issues that matter most.",
  },
  {
    id: "learn",
    label: "Learn",
    short: "Learn",
    description: "Guided lessons with knowledge checks.",
    icon: GraduationCap,
    placeholder: "What would you like to learn? e.g. recursion in Python",
    mode: "learn",
    tint: "text-[#c4b5fd]",
    instruction: "TOOL: Learn. Teach in a short interactive sequence: objectives, explanation, example, one knowledge check. Do not reveal the answer to the check.",
  },
  {
    id: "challenge",
    label: "Challenge",
    short: "Challenge",
    description: "Work through a challenge with hints.",
    icon: Trophy,
    placeholder: "Describe the challenge, or paste its statement…",
    mode: "ask",
    tint: "text-[#fcd34d]",
    instruction: "TOOL: Challenge. Guide without spoiling: restate the problem, clarify constraints, give a plan and escalating hints. Offer a full solution only when the user asks for it.",
  },
];

export const toolMeta = (id: ToolId | undefined): ToolMeta => AI_TOOLS.find((t) => t.id === id) ?? AI_TOOLS[0];

/* ---------------- languages ---------------- */

export interface LanguageMeta {
  id: AiLanguage;
  label: string;
  fence: string;
  ext: string;
}

export const AI_LANGUAGES: LanguageMeta[] = [
  { id: "python", label: "Python", fence: "python", ext: "py" },
  { id: "javascript", label: "JavaScript", fence: "javascript", ext: "js" },
  { id: "cpp", label: "C++", fence: "cpp", ext: "cpp" },
];

export const languageMeta = (id: AiLanguage | undefined): LanguageMeta => AI_LANGUAGES.find((l) => l.id === id) ?? AI_LANGUAGES[0];

/** Map a saved learning-profile language onto a workspace language. */
export function languageFromProfile(language: string | undefined): AiLanguage {
  const l = (language ?? "").toLowerCase();
  if (l.includes("python")) return "python";
  if (l.includes("c++") || l === "cpp" || l.includes("c#")) return "cpp";
  return "javascript";
}

/* ---------------- sidebar destinations ---------------- */

export interface WorkspaceNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  tool: ToolId;
  /** Prompt offered when this destination opens with no conversation. */
  intro: string;
}

export const WORKSPACE_NAV: WorkspaceNavItem[] = [
  { id: "workspace", label: "AI Workspace", icon: Layers, tool: "auto", intro: "What are we working on?" },
  { id: "code", label: "Code Assistant", icon: Code2, tool: "code", intro: "Describe the code you want to build." },
  { id: "challenge", label: "Challenge Solver", icon: Trophy, tool: "challenge", intro: "Paste a challenge statement, or describe the problem you're solving." },
  { id: "learn", label: "Learning Assistant", icon: GraduationCap, tool: "learn", intro: "What would you like to learn?" },
  { id: "review", label: "Code Review", icon: ShieldCheck, tool: "review", intro: "Share the code or project you want reviewed." },
  { id: "debug", label: "Debugging Assistant", icon: Bug, tool: "debug", intro: "Paste the error and the code that produced it." },
];

/* ---------------- welcome prompt cards ---------------- */

export interface PromptCard {
  id: string;
  title: string;
  prompt: string;
  tool: ToolId;
  language?: AiLanguage;
  icon: LucideIcon;
  blurb: string;
}

export const PROMPT_CARDS: PromptCard[] = [
  {
    id: "learn",
    title: "Learn Programming",
    prompt: "Teach me Python from beginner to advanced.",
    tool: "learn",
    language: "python",
    icon: GraduationCap,
    blurb: "A structured path, one concept at a time.",
  },
  {
    id: "debug",
    title: "Debug My Code",
    prompt: "Help me identify and fix errors in my code.",
    tool: "debug",
    icon: Bug,
    blurb: "Find the root cause, not just the symptom.",
  },
  {
    id: "challenge",
    title: "Solve a Challenge",
    prompt: "Guide me through solving a programming challenge.",
    tool: "challenge",
    icon: Trophy,
    blurb: "Hints and structure before the solution.",
  },
  {
    id: "review",
    title: "Review My Project",
    prompt: "Analyze my code and suggest improvements.",
    tool: "review",
    icon: ShieldCheck,
    blurb: "Quality, performance and security.",
  },
  {
    id: "explain",
    title: "Explain a Concept",
    prompt: "Explain how APIs work using simple examples.",
    tool: "explain",
    icon: BookOpen,
    blurb: "From analogy to working example.",
  },
  {
    id: "build",
    title: "Build Something",
    prompt: "Help me build a working web application.",
    tool: "code",
    icon: Hammer,
    blurb: "From an idea to running code.",
  },
];

/* ---------------- right-panel quick tools ---------------- */

export interface QuickTool {
  id: string;
  label: string;
  icon: LucideIcon;
  prompt: (language: string) => string;
}

export const QUICK_TOOLS: QuickTool[] = [
  { id: "explain", label: "Explain Code", icon: Lightbulb, prompt: (l) => `Explain this ${l} code line by line and why it works. I'll paste it below:\n\n` },
  { id: "debug", label: "Debug Code", icon: Bug, prompt: (l) => `Find the bug in this ${l} code and explain the root cause. I'll paste it below:\n\n` },
  { id: "optimize", label: "Optimize Code", icon: Wrench, prompt: (l) => `Optimize this ${l} code for clarity and performance without changing its behaviour. I'll paste it below:\n\n` },
  { id: "generate", label: "Generate Code", icon: Wand2, prompt: (l) => `Generate ${l} code for the following task. Ask me about any missing requirement first:\n\n` },
  { id: "review", label: "Review Code", icon: ShieldCheck, prompt: (l) => `Review this ${l} code for correctness, readability, performance and security:\n\n` },
  { id: "tests", label: "Generate Tests", icon: TestTube2, prompt: (l) => `Write ${l} tests for this code, covering normal, boundary and error cases:\n\n` },
];

/* ---------------- misc ---------------- */

export const TOOL_TAG: Record<ToolId, { label: string; className: string }> = {
  auto: { label: "Answer", className: "border-[#8b5cf6]/35 bg-[#8b5cf6]/10 text-[#c4b5fd]" },
  explain: { label: "Explanation", className: "border-[#22d3ee]/30 bg-[#22d3ee]/10 text-[#67e8f9]" },
  code: { label: "Code", className: "border-[#4f8cff]/35 bg-[#4f8cff]/10 text-[#93bbff]" },
  debug: { label: "Debug analysis", className: "border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fda4af]" },
  review: { label: "Code review", className: "border-[#34d399]/30 bg-[#34d399]/10 text-[#6ee7b7]" },
  learn: { label: "Lesson", className: "border-[#a78bfa]/35 bg-[#a78bfa]/10 text-[#c4b5fd]" },
  challenge: { label: "Challenge guide", className: "border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fcd34d]" },
};

export const TOOL_ROTATION = [BrainCircuit, RefreshCw, Sparkles];
