import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async redirects() {
    return [
      { source: "/ideas", destination: "/projects", permanent: true },
      { source: "/progress", destination: "/projects", permanent: true },
    ];
  },
};

export default nextConfig;
