import { describe, expect, it } from 'vitest';
import { api_rewrites } from './proxy_routes';

describe('api_rewrites', () => {
  const rewrites = api_rewrites('http://backend:5000');

  it('forwards the versioned API with its full path', () => {
    expect(rewrites).toContainEqual({ source: '/api/:path*', destination: 'http://backend:5000/api/:path*' });
  });

  it('forwards the socket to the engine path the server listens on, trailing slash included', () => {
    expect(rewrites).toContainEqual({ source: '/socket.io', destination: 'http://backend:5000/socket.io/' });
  });

  it('forwards the readiness and liveness probes', () => {
    expect(rewrites).toContainEqual({ source: '/ready', destination: 'http://backend:5000/ready' });
    expect(rewrites).toContainEqual({ source: '/health', destination: 'http://backend:5000/health' });
  });

  it('never forwards the metrics endpoint', () => {
    expect(rewrites.some((rewrite) => rewrite.source.startsWith('/metrics'))).toBe(false);
  });

  it('tolerates a trailing slash on the internal address', () => {
    expect(api_rewrites('http://backend:5000/')).toContainEqual({ source: '/ready', destination: 'http://backend:5000/ready' });
  });

  it('refuses an address that is not absolute http, so a bad build fails instead of proxying nowhere', () => {
    expect(() => api_rewrites('backend:5000')).toThrow();
    expect(() => api_rewrites('')).toThrow();
    expect(() => api_rewrites('ftp://backend:5000')).toThrow();
  });
});
