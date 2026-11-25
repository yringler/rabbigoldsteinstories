import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The privacy gate test scans the whole generated dataset (~100 MB of JSON).
    testTimeout: 120_000,
  },
});
