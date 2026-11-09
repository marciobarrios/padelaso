import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Route handlers against the running local Supabase stack (`supabase start`).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["./vitest.integration.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
