export type Page =
  | "home"
  | "learn"
  | "create"
  | "library"
  | "settings"
  | "profile"
  | "chat"
  | "code"
  | "visualise"
  | "project";

export const PAGE_TITLES: Record<Page, string> = {
  home: "Home",
  learn: "Learn",
  create: "Create",
  library: "Library",
  settings: "Preferences",
  profile: "Learning profile",
  chat: "Conversation",
  code: "Code with Lumen",
  visualise: "Visualise with Lumen",
  project: "Build with Lumen",
};

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};
