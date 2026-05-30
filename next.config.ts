import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["local.lms.me"],
  // @react-pdf/renderer must stay un-bundled so its Node font/stream stack and
  // reconciler work inside the App Router runtime (React 19 / Next 16).
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
