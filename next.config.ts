import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Pin the app root so Next does not pick a parent folder when multiple lockfiles exist (fixes broken / blank dev loads). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
