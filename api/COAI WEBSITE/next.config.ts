import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin tracing to this app when a parent directory has another lockfile (avoids wrong root on CI/Vercel).
  outputFileTracingRoot: __dirname,
  images: {
    formats: ["image/avif", "image/webp"]
  },
  async redirects() {
    return [
      { source: "/jax-coming-soon", destination: "/jax", permanent: true },
      { source: "/privacy-policy", destination: "/privacy", permanent: true },
      { source: "/terms-of-service", destination: "/terms", permanent: true },
      { source: "/case-studies", destination: "/portfolio", permanent: true },
      { source: "/dashboard", destination: "/", permanent: true },
      { source: "/register", destination: "/intake", permanent: true }
    ];
  }
};

export default nextConfig;
