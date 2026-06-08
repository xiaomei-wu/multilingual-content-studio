import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the Turbopack workspace root to this project. pnpm's symlinked
  // node_modules can confuse Next's auto-detection of the root, which made
  // `next dev` crash on recompile. Pinning it makes dev/build deterministic.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
