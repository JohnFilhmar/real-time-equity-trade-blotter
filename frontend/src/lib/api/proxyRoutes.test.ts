import { describe, expect, it } from 'vitest';
import { api_rewrites } from './proxyRoutes';

describe('api_rewrites', () => {
  const rewrites = api_rewrites('http://gateway:8080', 'http://realtime:8080');

  it('forwards the versioned API to the gateway with its full path', () => {
    expect(rewrites).toContainEqual({ source: '/api/:path*', destination: 'http://gateway:8080/api/:path*' });
  });

  it("forwards the live link's hub to the realtime service", () => {
    expect(rewrites).toContainEqual({ source: '/hubs/:path*', destination: 'http://realtime:8080/hubs/:path*' });
  });

  it('sends the hub to the same address when one edge proxy routes both', () => {
    expect(api_rewrites('http://localhost')).toContainEqual({ source: '/hubs/:path*', destination: 'http://localhost/hubs/:path*' });
  });

  it("forwards the gateway's readiness and liveness probes", () => {
    expect(rewrites).toContainEqual({ source: '/ready', destination: 'http://gateway:8080/ready' });
    expect(rewrites).toContainEqual({ source: '/health', destination: 'http://gateway:8080/health' });
  });

  it('never forwards the metrics endpoint', () => {
    expect(rewrites.some((rewrite) => rewrite.source.startsWith('/metrics'))).toBe(false);
  });

  it('tolerates a trailing slash on either internal address', () => {
    const slashed = api_rewrites('http://gateway:8080/', 'http://realtime:8080/');
    expect(slashed).toContainEqual({ source: '/ready', destination: 'http://gateway:8080/ready' });
    expect(slashed).toContainEqual({ source: '/hubs/:path*', destination: 'http://realtime:8080/hubs/:path*' });
  });

  it('refuses an address that is not absolute http, so a bad build fails instead of proxying nowhere', () => {
    expect(() => api_rewrites('gateway:8080')).toThrow('API_INTERNAL_URL');
    expect(() => api_rewrites('')).toThrow();
    expect(() => api_rewrites('ftp://gateway:8080')).toThrow();
    expect(() => api_rewrites('http://gateway:8080', 'realtime:8080')).toThrow('REALTIME_INTERNAL_URL');
  });
});
