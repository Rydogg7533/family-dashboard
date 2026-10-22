import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tabs preload their pages (see Nav). A preloaded page is reused for 2 minutes; the refresh button and any save clear it at once.
  experimental: { staleTimes: { dynamic: 30, static: 120 } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
