import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // An e2e `next dev` sets its own dir — sharing `.next` with a running dev server fails on its lock.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactCompiler: true,
  allowedDevOrigins: ["local.lms.me"],
  // @react-pdf/renderer must stay un-bundled so its Node font/stream stack and
  // reconciler work inside the App Router runtime (React 19 / Next 16).
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    authInterrupts: true,
    // Default body limit (~1MB) is too tight for a long exam paper's
    // extracted text sent to parseQuestionsAction (D41).
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
