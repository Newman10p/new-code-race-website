import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Demo replies stream for ~4s; the default 5s cap made the streaming test
    // fail on slower machines even though its own waits allow 12s.
    testTimeout: 20_000,
  },
});
