import { Code2, GraduationCap, Hammer, MessageCircleQuestion, Workflow } from "lucide-react";
import type { Mode } from "./store";

/** Five ways of working with one tutor. Same context, same history. */
export const MODES: {
  id: Mode;
  title: string;
  short: string;
  desc: string;
  icon: typeof Code2;
  placeholder: string;
}[] = [
  { id: "ask", title: "Ask Lumen", short: "Ask", desc: "Clear answers to technical questions", icon: MessageCircleQuestion, placeholder: "Ask about a concept, algorithm or error…" },
  { id: "learn", title: "Learn with Lumen", short: "Learn", desc: "A guided lesson that checks your understanding", icon: GraduationCap, placeholder: "What would you like to learn? e.g. recursion" },
  { id: "code", title: "Code with Lumen", short: "Code", desc: "Write, run and debug in a real editor", icon: Code2, placeholder: "Describe what you're coding or paste an error…" },
  { id: "visualise", title: "Visualise with Lumen", short: "Visualise", desc: "Turn ideas into editable diagrams", icon: Workflow, placeholder: "What should Lumen diagram? e.g. how DNS works" },
  { id: "build", title: "Build with Lumen", short: "Build", desc: "Take a project from idea to working code", icon: Hammer, placeholder: "Describe the project you want to build…" },
];

export const modeMeta = (m: Mode) => MODES.find((x) => x.id === m)!;
