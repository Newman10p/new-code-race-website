import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom lacks these APIs; the workspace uses them for responsive decisions.
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("min-width: 1280px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  localStorage.clear();
  localStorage.setItem(
    "lumen-profile",
    JSON.stringify({ name: "Ada Lovelace", nickname: "Ada", language: "Python", completedAt: Date.now() })
  );
  localStorage.setItem("lumen-appearance", JSON.stringify({ mode: "dark", accent: "blue", density: "default", fontSize: "md", motion: "full" }));
});

afterEach(() => cleanup());
