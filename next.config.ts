import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // better-sqlite3 is a native module — must stay external to the bundle and
  // be require()d at runtime from node_modules (see Dockerfile fixup stage).
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
