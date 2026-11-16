import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

const sourcemapIgnore: string[] = [];

const nextConfig: NextConfig = {
  transpilePackages: ["@padelaso/domain", "@padelaso/data"],
  htmlLimitedBots: /.*/,
  reactCompiler: true,
  compiler: {
    async runAfterProductionCompile({ distDir }) {
      // Turbopack hashes polyfill filenames, bypassing Sentry's polyfills-* ignore.
      // These generated bundles have no source maps and contain no application code.
      const manifest = JSON.parse(await readFile(path.join(distDir, "build-manifest.json"), "utf8"));
      sourcemapIgnore.push(
        ...manifest.polyfillFiles.map((file: string) => path.join(distDir, file)),
      );
    },
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [
      {
        // The consent page grants account access, so it must never be framed.
        source: "/oauth/consent",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: {
    ignore: sourcemapIgnore,
    disable: !(
      process.env.SENTRY_AUTH_TOKEN &&
      process.env.SENTRY_ORG &&
      process.env.SENTRY_PROJECT
    ),
  },
});
