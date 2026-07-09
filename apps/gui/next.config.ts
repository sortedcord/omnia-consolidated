import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@omnia/core",
    "@omnia/llm",
    "@omnia/intent",
    "@omnia/architect",
    "@omnia/actor",
    "@omnia/memory",
    "@omnia/spatial",
    "@omnia/scenario",
  ],
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: ["192.168.0.18", "localhost", "127.0.0.1"],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "192.168.0.18:3000",
        "192.168.0.18:3001",
        "192.168.0.18:3002",
        "localhost:3000",
        "localhost:3001",
        "localhost:3002",
      ],
    },
  },
};

export default nextConfig;
