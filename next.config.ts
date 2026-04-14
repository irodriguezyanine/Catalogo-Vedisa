import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);

const nextConfig: NextConfig = {
  turbopack: {
    root: currentDir,
  },
};

export default nextConfig;
