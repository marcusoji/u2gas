import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // WebCrypto lives on globalThis in Node 18+, which is what the Worker
    // runtime provides too, so these run without a Workers emulator.
    environment: "node",
  },
});
