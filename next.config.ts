import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["local.lms.me"],
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
