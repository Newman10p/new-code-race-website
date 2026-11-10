import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Journey = what the user has actually done. Features reveal themselves in
 * response to milestones, so the first session is quiet and later ones are dense.
 */
export type Milestone =
  | "first_message"
  | "second_message"
  | "visited_learn"
  | "visited_create"
  | "visited_code"
  | "visited_library"
  | "visited_build"
  | "visited_idea"
  | "viewed_brief"
  | "selected_node"
  | "ran_code"
  | "selected_line"
  | "completed_step"
  | "used_palette"
  | "tour_done"
  | "tour_skipped";

const KEY = "lumen-journey";

interface State {
  milestones: Milestone[];
  dismissedHints: string[];
  unlockedAll: boolean;
}

const EMPTY: State = { milestones: [], dismissedHints: [], unlockedAll: false };

function read(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    /* noop */
  }
  return EMPTY;
}

interface Ctx {
  milestones: Set<Milestone>;
  has: (m: Milestone) => boolean;
  mark: (m: Milestone) => void;
  /** 0 = fresh, 1 = spoken once, 2 = exploring, 3 = established */
  level: 0 | 1 | 2 | 3;
  unlockedAll: boolean;
  unlockAll: () => void;
  reset: () => void;
  hintDismissed: (id: string) => boolean;
  dismissHint: (id: string) => void;
  /** Gate: should feature `id` be visible yet? */
  reveal: (id: RevealKey) => boolean;
}

export type RevealKey =
  | "home.projects"
  | "home.workspace"
  | "home.rail"
  | "home.tools.all"
  | "sidebar.projects"
  | "sidebar.pinned"
  | "sidebar.recent"
  | "composer.advanced"
  | "chat.followups"
  | "create.detail"
  | "create.inspector.actions"
  | "code.tests"
  | "code.hints";

const JourneyContext = createContext<Ctx | null>(null);

export function JourneyProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* noop */
    }
  }, [state]);

  const milestones = useMemo(() => new Set(state.milestones), [state.milestones]);
  const has = useCallback((m: Milestone) => milestones.has(m), [milestones]);

  const mark = useCallback((m: Milestone) => {
    setState((p) => (p.milestones.includes(m) ? p : { ...p, milestones: [...p.milestones, m] }));
  }, []);

  const unlockAll = useCallback(() => setState((p) => ({ ...p, unlockedAll: true })), []);
  const reset = useCallback(() => setState(EMPTY), []);

  const hintDismissed = useCallback(
    (id: string) => state.dismissedHints.includes(id),
    [state.dismissedHints]
  );
  const dismissHint = useCallback((id: string) => {
    setState((p) =>
      p.dismissedHints.includes(id) ? p : { ...p, dismissedHints: [...p.dismissedHints, id] }
    );
  }, []);

  const visited = (
    ["visited_learn", "visited_create", "visited_code", "visited_library", "visited_build", "visited_idea"] as Milestone[]
  ).filter((m) => milestones.has(m)).length;

  const level: 0 | 1 | 2 | 3 = state.unlockedAll
    ? 3
    : !milestones.has("first_message") && visited === 0
      ? 0
      : milestones.has("second_message") || visited >= 2
        ? visited >= 3 || milestones.size >= 6
          ? 3
          : 2
        : 1;

  const reveal = useCallback(
    (id: RevealKey) => {
      if (state.unlockedAll) return true;
      switch (id) {
        case "home.projects":
          return level >= 1;
        case "home.workspace":
          return level >= 2;
        case "home.rail":
          return level >= 1;
        case "home.tools.all":
          return level >= 1;
        case "sidebar.recent":
          return milestones.has("first_message");
        case "sidebar.projects":
          return level >= 2;
        case "sidebar.pinned":
          return level >= 3;
        case "composer.advanced":
          return milestones.has("first_message");
        case "chat.followups":
          return true;
        case "create.detail":
          return milestones.has("selected_node");
        case "create.inspector.actions":
          return true;
        case "code.tests":
          return milestones.has("ran_code");
        case "code.hints":
          return milestones.has("selected_line") || milestones.has("ran_code");
        default:
          return true;
      }
    },
    [level, milestones, state.unlockedAll]
  );

  const value = useMemo<Ctx>(
    () => ({
      milestones,
      has,
      mark,
      level,
      unlockedAll: state.unlockedAll,
      unlockAll,
      reset,
      hintDismissed,
      dismissHint,
      reveal,
    }),
    [milestones, has, mark, level, state.unlockedAll, unlockAll, reset, hintDismissed, dismissHint, reveal]
  );

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

export function useJourney() {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error("useJourney must be used inside JourneyProvider");
  return ctx;
}
