import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The node on servicesuite-in (bridge/interchange-node) runs the standalone
  // server; Vercel builds without it. The tracing root is this app, not the
  // monorepo or a parent checkout that happens to hold its own lockfile.
  // (`next build` always runs from this folder, so the cwd is the app.)
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const, outputFileTracingRoot: process.cwd() } : {}),

  // pdfjs-dist MUST stay out of the bundle. It resolves its worker with a
  // runtime dynamic import; if the bundler rewrites that, pdfjs falls back to a
  // "fake worker" and throws `Setting up fake worker failed`, which surfaces to
  // an officer as "could not read this PDF" — sending them to argue with a
  // customer whose statement was fine.
  // Same argument for the serverless renderer: @sparticuz/chromium-min resolves
  // its Brotli pack and its /tmp paths at runtime, and puppeteer-core loads its
  // transport the same way. Bundling either one rewrites those lookups and the
  // launch fails with a path that does not exist on the container.
  serverExternalPackages: ["pdfjs-dist", "@sparticuz/chromium-min", "puppeteer-core"],

  // WHO MAY FRAME THIS. A lender's own app shows the Interchange in a frame
  // (connected-suite app/interchange), so its staff never leave the installed
  // app; anyone else framing it would be a clickjacking surface for a page that
  // buys bureau reports. So: the estate's own hosts, and nothing else — until
  // 23 Oct 2026 nothing was said at all and any site could frame it.
  async headers() {
    const dev = process.env.NODE_ENV !== "production" ? " http://localhost:*" : "";
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: `frame-ancestors 'self' https://*.servicesuitecloud.com${dev}` }],
      },
    ];
  },

  // Keeping it out of the bundle does not guarantee it is UPLOADED. The file
  // tracer has to be told, or the deploy ships a route that imports a package
  // that is not there.
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/pdfjs-dist/legacy/build/**",
      "./node_modules/@sparticuz/chromium-min/build/**",
    ],
  },
};

export default nextConfig;
