import path from "node:path";
import type { NextConfig } from "next";
import { api_rewrites } from "./src/lib/api/proxyRoutes";

const nextConfig: NextConfig = {
  output: "standalone",
  // The app lives in an npm workspace, so tracing has to start at the repository root or the
  // standalone bundle omits @blotter/shared.
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  // The browser talks only to this server; the API is reached over the internal network and has no
  // published port. The address is read when the rewrites are compiled, which is at build time.
  async rewrites() {
    return api_rewrites(process.env.API_INTERNAL_URL ?? "http://localhost:5000");
  },
  // The socket's engine listens on /socket.io/ with its trailing slash. The default redirect that
  // strips trailing slashes would send the handshake to a path the engine does not answer.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
