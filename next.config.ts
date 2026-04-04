import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  htmlLimitedBots: /.*/,
  reactCompiler: true,
};

export default nextConfig;
