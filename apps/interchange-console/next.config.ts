import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist MUST stay out of the bundle. It resolves its worker with a
  // runtime dynamic import; if the bundler rewrites that, pdfjs falls back to a
  // "fake worker" and throws `Setting up fake worker failed`, which surfaces to
  // an officer as "could not read this PDF" — sending them to argue with a
  // customer whose statement was fine.
  serverExternalPackages: ["pdfjs-dist"],

  // Keeping it out of the bundle does not guarantee it is UPLOADED. The file
  // tracer has to be told, or the deploy ships a route that imports a package
  // that is not there.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/pdfjs-dist/legacy/build/**"],
  },
};

export default nextConfig;
