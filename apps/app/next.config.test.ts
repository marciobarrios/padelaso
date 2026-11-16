// @vitest-environment node
import { readFile } from "node:fs/promises";
import { withSentryConfig } from "@sentry/nextjs/config";
import { expect, it, vi } from "vitest";
import config from "./next.config";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
vi.mock("@sentry/nextjs/config", () => ({
  withSentryConfig: vi.fn((nextConfig) => nextConfig),
}));

it("excludes hashed polyfills from Sentry uploads while retaining application chunks", async () => {
  vi.mocked(readFile).mockResolvedValue(JSON.stringify({
    polyfillFiles: ["static/immutable/chunks/new-polyfill-hash.js"],
    rootMainFiles: ["static/immutable/chunks/application.js"],
  }));

  await config.compiler!.runAfterProductionCompile!({
    distDir: "/build/.next",
    projectDir: "/build",
  });

  const options = vi.mocked(withSentryConfig).mock.calls[0][1];
  expect(options?.sourcemaps?.ignore).toEqual([
    "/build/.next/static/immutable/chunks/new-polyfill-hash.js",
  ]);
});
