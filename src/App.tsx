import { useCallback, useEffect, useState } from "react";
import { Moon, PanelLeft, Search, Sun, UserRound } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { CommandPalette } from "./components/CommandPalette";
import { HelpMenu } from "./components/HelpMenu";
import { ModelBadge } from "./components/Composer";
import { TourProvider, useTour } from "./components/Tour";
import { IconButton } from "./components/ui";
import { ProfileProvider, useProfile } from "./context/ProfileContext";
import { JourneyProvider, useJourney } from "./context/JourneyContext";
import type { Milestone } from "./context/JourneyContext";
import { ToastProvider, useToast } from "./context/ToastContext";
import { Home } from "./pages/Home";
import { Learn } from "./pages/Learn";
import { Create } from "./pages/Create";
import { Library } from "./pages/Library";
import { Settings } from "./pages/Settings";
import { Chat } from "./pages/Chat";
import { Code } from "./pages/Code";
import { Visualise } from "./pages/Visualise";
import { Project } from "./pages/Project";
import { Profile } from "./pages/Profile";
import { Onboarding } from "./pages/Onboarding";
import { AiWorkspace } from "./pages/AiWorkspace";
import { useAppearance } from "./hooks/useAppearance";
import type { Appearance } from "./hooks/useAppearance";
import { useTutor } from "./hooks/useTutor";
import { PAGE_TITLES } from "./lib/nav";
import type { Page } from "./lib/nav";
import { conversations, newConversation, newProject, patchProject, projects } from "./lib/store";
import type { Attachment, Mode } from "./lib/store";
import { modeMeta } from "./lib/modes";
import { cn } from "./utils/cn";

const FULL_BLEED: Page[] = ["chat", "code", "visualise"];
const PAGE_MILESTONE: Partial<Record<Page, Milestone>> = {
  learn: "visited_learn", create: "visited_create", visualise: "visited_create",
  code: "visited_code", library: "visited_library", project: "visited_build",
};
const SIDEBAR_KEY = "lumen-sidebar-collapsed";

export default function App() {
  return (
    <ProfileProvider>
      <JourneyProvider>
        <ToastProvider>
          <Root />
        </ToastProvider>
      </JourneyProvider>
    </ProfileProvider>
  );
}

function Root() {
  const appearance = useAppearance();
  const { onboarded } = useProfile();
  const [page, setPage] = useState<Page>("ai");
  const [arg, setArg] = useState<string | undefined>();
  const { mark } = useJourney();

  const navigate = useCallback((p: Page, a?: string) => {
    if (p === "chat" && !a) a = newConversation("ask").id; // "New conversation"
    setPage(p);
    setArg(a);
    const m = PAGE_MILESTONE[p];
    if (m) mark(m);
  }, [mark]);

  if (!onboarded && page !== "ai") return <Onboarding />;
  return (
    <TourProvider onNavigate={navigate}>
      {page === "ai" ? (
        <AiWorkspace convId={arg} onNavigate={navigate} />
      ) : (
        <Shell appearance={appearance} page={page} arg={arg} navigate={navigate} clearArg={() => setArg(undefined)} />
      )}
    </TourProvider>
  );
}

function Shell({ appearance, page, arg, navigate, clearArg }: { appearance: Appearance; page: Page; arg?: string; navigate: (p: Page, a?: string) => void; clearArg: () => void }) {
  const { has, mark } = useJourney();
  const { start: startTour } = useTour();
  const { toast } = useToast();
  const { send } = useTutor();
  const convs = conversations.use();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0"); } catch { /* non-critical */ }
  }, [collapsed]);

  // Offer the walkthrough once after onboarding.
  useEffect(() => {
    if (has("tour_done") || has("tour_skipped")) return;
    const t = setTimeout(() => toast({ title: "Take the 60-second walkthrough?", detail: "Restart it any time from Help & support.", action: { label: "Start", onClick: startTour }, durationMs: 12000 }), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); mark("used_palette"); }
      if (mod && e.key.toLowerCase() === "n") { e.preventDefault(); navigate("chat"); }
      if (mod && e.key === "\\") { e.preventDefault(); setCollapsed((v) => !v); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [navigate, mark]);

  /** One tutor, five entry points. Everything shares the same engine and history. */
  const start = useCallback((mode: Mode, text: string, atts?: Attachment[]) => {
    mark("first_message");
    if (mode === "visualise") return navigate("visualise", text);
    if (mode === "code") {
      const proj = projects.get().find((p) => p.status === "active") ?? newProject({ name: "Scratchpad", type: "javascript", description: "Your personal coding sandbox" });
      const c = newConversation("code", { projectId: proj.id });
      patchProject(proj.id, (p) => ({ conversationIds: [...p.conversationIds, c.id] }));
      send(c.id, text, atts);
      return navigate("chat", c.id);
    }
    if (mode === "build") {
      const proj = newProject({ name: text.replace(/^(i want to |build |make |create )+/i, "").slice(0, 48) || "New project", type: /python|script|data/i.test(text) ? "python" : "web", description: text.slice(0, 200), requirements: "" });
      const c = newConversation("build", { title: `${proj.name} · build`, projectId: proj.id });
      patchProject(proj.id, { conversationIds: [c.id] });
      send(c.id, `${text}\n\nBefore planning, ask me the clarifying questions you need.`, atts);
      return navigate("project", proj.id);
    }
    const c = newConversation(mode);
    send(c.id, text, atts);
    navigate("chat", c.id);
  }, [navigate, send, mark]);

  const conv = page === "chat" ? convs.find((c) => c.id === arg) : undefined;
  const title = conv ? conv.title : page === "project" ? projects.get().find((p) => p.id === arg)?.name ?? "Project" : PAGE_TITLES[page];
  const modeForBar: Mode | null = conv?.mode ?? (page === "code" ? "code" : page === "visualise" ? "visualise" : page === "project" ? "build" : page === "learn" ? "learn" : null);

  return (
    <div className="flex h-full overflow-hidden bg-app text-primary">
      <Sidebar
        page={page} arg={arg} onNavigate={navigate} collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)}
        onSearch={() => { setPaletteOpen(true); mark("used_palette"); }}
        onNewChat={() => navigate("chat")} onHelp={startTour}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-none items-center gap-2 border-b border-border bg-app px-3 md:px-4" style={{ height: 52 }}>
          <button onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-primary md:hidden" aria-label="Open navigation"><PanelLeft className="size-[18px]" /></button>
          <h1 className="min-w-0 truncate font-display text-[17px] text-primary">{title}</h1>
          {modeForBar && (() => { const M = modeMeta(modeForBar); return (
            <span className="hidden flex-none items-center gap-1.5 rounded-md border border-border px-1.5 py-0.5 text-[11.5px] text-secondary sm:inline-flex"><M.icon className="size-3 text-accent" />{M.short}</span>
          ); })()}
          <div className="flex-1" />
          <div className="hidden md:block"><ModelBadge /></div>
          <button data-tour="search" onClick={() => { setPaletteOpen(true); mark("used_palette"); }} className="hidden h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[12px] text-muted hover:border-strong hover:text-secondary sm:flex">
            <Search className="size-3.5" />Search<kbd>⌘K</kbd>
          </button>
          <IconButton label={appearance.isLight ? "Switch to dark theme" : "Switch to light theme"} onClick={appearance.toggleMode}>{appearance.isLight ? <Moon className="size-4" /> : <Sun className="size-4" />}</IconButton>
          <IconButton data-tour="profile" label="Learning profile" onClick={() => navigate("profile")}><UserRound className="size-4" /></IconButton>
          <HelpMenu />
        </header>

        <div className={cn("relative min-h-0 flex-1", FULL_BLEED.includes(page) ? "flex flex-col" : "overflow-y-auto")}>
          {page === "home" && <Home onNavigate={navigate} onStart={start} />}
          {page === "learn" && <Learn onNavigate={navigate} onStartLesson={(id, prompt) => { send(id, prompt); navigate("chat", id); }} />}
          {page === "create" && <Create onNavigate={navigate} />}
          {page === "library" && <Library onNavigate={navigate} />}
          {page === "settings" && <Settings appearance={appearance} />}
          {page === "profile" && <Profile onNavigate={navigate} />}
          {page === "code" && <Code projectId={arg} onNavigate={navigate} />}
          {page === "visualise" && <Visualise initialPrompt={arg} onConsumed={clearArg} />}
          {page === "project" && <Project id={arg} onNavigate={navigate} />}
          {page === "chat" && arg && <Chat key={arg} convId={arg} onConsumed={() => {}} onNavigate={navigate} />}
        </div>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={navigate} onStartTour={startTour} onToggleTheme={appearance.toggleMode} />
    </div>
  );
}
