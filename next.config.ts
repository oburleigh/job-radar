import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    useTypeScriptCli: true,
  },
};

export default nextConfig;
