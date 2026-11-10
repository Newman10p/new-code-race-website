import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "dark" | "light" | "system";
export type Density = "compact" | "default" | "comfortable";
export type FontSize = "sm" | "md" | "lg";
export type Motion = "full" | "reduced" | "none";

export const ACCENTS: { id: string; label: string; light: string; dark: string }[] = [
  { id: "blue", label: "CodeQuest Blue", light: "#287fef", dark: "#4d9cff" },
  { id: "teal", label: "Teal", light: "#1f8f7a", dark: "#6fd1b8" },
  { id: "amber", label: "Amber", light: "#b7791f", dark: "#e8a55a" },
  { id: "rose", label: "Rose", light: "#b8475f", dark: "#f29bb0" },
  { id: "violet", label: "Violet", light: "#6a4fd1", dark: "#b5a2ff" },
  { id: "ink", label: "Ink", light: "#141413", dark: "#faf9f5" },
];

const KEY = "lumen-appearance";

interface State {
  mode: ThemeMode;
  accent: string;
  density: Density;
  fontSize: FontSize;
  motion: Motion;
}

const DEFAULTS: State = {
  mode: "dark",
  accent: "blue",
  density: "default",
  fontSize: "md",
  motion: "full",
};

function read(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* noop */
  }
  return DEFAULTS;
}

function mix(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darken(hex: string, amt = 0.18) {
  const h = hex.replace("#", "");
  const c = [0, 2, 4].map((i) => Math.max(0, Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - amt))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function lighten(hex: string, amt = 0.12) {
  const h = hex.replace("#", "");
  const c = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16);
    return Math.min(255, Math.round(v + (255 - v) * amt));
  });
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function resolveIsDark(mode: ThemeMode) {
  return (
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  );
}

export function applyAppearance(s: State) {
  const root = document.documentElement;
  const isDark = resolveIsDark(s.mode);
  root.classList.toggle("light", !isDark);
  root.classList.remove("dark");
  root.style.colorScheme = isDark ? "dark" : "light";

  const accent = ACCENTS.find((a) => a.id === s.accent) ?? ACCENTS[0];
  const c = isDark ? accent.dark : accent.light;
  root.style.setProperty("--accent", c);
  root.style.setProperty("--accent-hover", isDark ? lighten(c) : darken(c));
  root.style.setProperty("--accent-soft", mix(c, isDark ? 0.13 : 0.09));
  root.style.setProperty("--accent-line", mix(c, isDark ? 0.38 : 0.32));
  root.style.setProperty("--ring", mix(c, isDark ? 0.22 : 0.18));
  root.style.setProperty("--on-accent", accent.id === "ink" ? (isDark ? "#141413" : "#faf9f5") : isDark ? "#06101f" : "#ffffff");

  root.dataset.density = s.density;
  root.dataset.fontsize = s.fontSize;
  root.dataset.motion = s.motion;
}

export function useAppearance() {
  const [state, setState] = useState<State>(read);

  useEffect(() => {
    applyAppearance(state);
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* noop */
    }
  }, [state]);

  useEffect(() => {
    if (state.mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => applyAppearance(state);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [state]);

  const set = useCallback(<K extends keyof State>(key: K, value: State[K]) => {
    setState((p) => ({ ...p, [key]: value }));
  }, []);

  const toggleMode = useCallback(() => {
    setState((p) => ({ ...p, mode: resolveIsDark(p.mode) ? "light" : "dark" }));
  }, []);

  const isLight = typeof window === "undefined" ? true : !resolveIsDark(state.mode);

  return { ...state, set, toggleMode, isLight };
}

export type Appearance = ReturnType<typeof useAppearance>;
