/** One Next.js rewrite: a public path on the web origin and where the server forwards it. */
export interface ProxyRewrite {
  source: string;
  destination: string;
}

/**
 * The paths the web server forwards to the API over the internal network, and nothing else.
 *
 * The browser only ever talks to the web origin, and the API has no published port. `/metrics` is
 * left out on purpose, so the operational counters stay inside the network. The socket rule
 * forwards to `/socket.io/` with its trailing slash, because that is the exact path the engine
 * listens on; the redirect that would strip it is switched off in `next.config.ts`.
 *
 * @param internal_url - The API's address on the internal network, `http://backend:5000` in compose.
 * A trailing slash is ignored.
 * @returns The rewrites, in match order.
 * @throws {Error} When the address is not an absolute http or https URL, so a misconfigured build
 * fails instead of producing a proxy that forwards nowhere.
 */
export function api_rewrites(internal_url: string): ProxyRewrite[] {
  let parsed: URL;
  try {
    parsed = new URL(internal_url);
  } catch {
    throw new Error('API_INTERNAL_URL must be an absolute http or https URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('API_INTERNAL_URL must be an absolute http or https URL');
  }

  const base = internal_url.replace(/\/+$/, '');
  return [
    { source: '/api/:path*', destination: `${base}/api/:path*` },
    { source: '/socket.io', destination: `${base}/socket.io/` },
    { source: '/ready', destination: `${base}/ready` },
    { source: '/health', destination: `${base}/health` },
  ];
}
