import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: { include: ["src/**/*.ts"], thresholds: { lines: 90 } },
  },
});
