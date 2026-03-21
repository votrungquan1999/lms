import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["local.lms.me"],
  reactCompiler: true,
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
