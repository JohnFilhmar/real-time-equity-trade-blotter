import path from "node:path";
import type { NextConfig } from "next";
import { api_rewrites } from "./src/lib/api/proxyRoutes";

const nextConfig: NextConfig = {
  output: "standalone",
  // The app lives in an npm workspace, so tracing has to start at the repository root or the
  // standalone bundle omits @blotter/shared.
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  // The browser talks only to this origin; the services are reached over the internal network and
  // have no published port. The addresses are read when the rewrites are compiled, at build time,
  // and default to one local edge proxy that routes both the API and the hub.
  async rewrites() {
    const api_url = process.env.API_INTERNAL_URL ?? "http://localhost";
    return api_rewrites(api_url, process.env.REALTIME_INTERNAL_URL ?? api_url);
  },
};

export default nextConfig;
