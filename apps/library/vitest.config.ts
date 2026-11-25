import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The privacy test builds a small Pagefind index and reads the raw data's hidden spans.
    testTimeout: 120_000,
  },
});
