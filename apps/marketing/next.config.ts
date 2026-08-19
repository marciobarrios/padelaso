import type { NextConfig } from "next";

const appOrigin = "https://app.padelaso.com";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async redirects() {
    return [
      { source: "/login", destination: `${appOrigin}/login`, permanent: false },
      {
        source: "/matches/:path*",
        destination: `${appOrigin}/matches/:path*`,
        permanent: false,
      },
      {
        source: "/players/:path*",
        destination: `${appOrigin}/players/:path*`,
        permanent: false,
      },
      {
        source: "/groups/:path*",
        destination: `${appOrigin}/groups/:path*`,
        permanent: false,
      },
      { source: "/stats", destination: `${appOrigin}/stats`, permanent: false },
      {
        source: "/auth/callback",
        destination: `${appOrigin}/auth/callback`,
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${appOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
