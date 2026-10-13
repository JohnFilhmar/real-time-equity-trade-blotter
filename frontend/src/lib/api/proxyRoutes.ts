/** One Next.js rewrite: a public path on the web origin and where the server forwards it. */
export interface ProxyRewrite {
  source: string;
  destination: string;
}

/**
 * Checks one internal address and strips any trailing slash.
 *
 * @param url - The address.
 * @param name - The setting it came from, named in the error.
 * @returns The address without a trailing slash.
 * @throws {Error} When it is not an absolute http or https URL.
 */
function base_of(url: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${name} must be an absolute http or https URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must be an absolute http or https URL`);
  }

  return url.replace(/\/+$/, '');
}

/**
 * The paths the web server forwards over the internal network, and nothing else.
 *
 * The browser only ever talks to the web origin, and no service has a published port. The API's
 * paths and its probes go to the gateway; the live link's hub goes to the realtime service. In the
 * shipped stack the edge proxy routes these paths itself, so these rules serve a web server reached
 * directly, such as `next dev` pointed at a running stack. `/metrics` is left out on purpose, so
 * the operational counters stay inside the network.
 *
 * @param api_url - The gateway's address, `http://gateway:8080` in compose. A trailing slash is ignored.
 * @param realtime_url - The realtime service's address, `http://realtime:8080` in compose. Defaults
 * to the gateway's, for a single edge proxy that routes both.
 * @returns The rewrites, in match order.
 * @throws {Error} When either address is not an absolute http or https URL, so a misconfigured
 * build fails instead of producing a proxy that forwards nowhere.
 */
export function api_rewrites(api_url: string, realtime_url: string = api_url): ProxyRewrite[] {
  const api = base_of(api_url, 'API_INTERNAL_URL');
  const realtime = base_of(realtime_url, 'REALTIME_INTERNAL_URL');
  return [
    { source: '/api/:path*', destination: `${api}/api/:path*` },
    { source: '/hubs/:path*', destination: `${realtime}/hubs/:path*` },
    { source: '/ready', destination: `${api}/ready` },
    { source: '/health', destination: `${api}/health` },
  ];
}
