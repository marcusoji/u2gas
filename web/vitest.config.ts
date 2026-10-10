import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The session-store module only touches Web APIs (sessionStorage, Date),
    // so Node is enough and no jsdom wrapper is needed.
    environment: "node",
  },
});
