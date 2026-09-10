import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The app lives in an npm workspace, so tracing has to start at the repository root or the
  // standalone bundle omits @blotter/shared.
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
};

export default nextConfig;
