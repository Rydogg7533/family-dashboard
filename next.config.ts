import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tabs preload their pages (see Nav). A preloaded page is reused for 2 minutes; the refresh button and any save clear it at once.
  // /setup/schema.sql reads the migration files at run time, so they must ship with the deployment.
  outputFileTracingIncludes: { "/setup/schema.sql": ["./supabase/migrations/**/*.sql"] },
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
