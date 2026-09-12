import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { problem_schema } from '@blotter/shared';
import { create_app } from '../app.js';
import type { HealthProbe } from '../interfaces/health_probe.js';
import {
  create_in_memory_login_attempts,
  create_in_memory_refresh_store,
} from '../lib/auth/in_memory_auth_stores.js';
import { create_in_memory_trade_repository } from '../repositories/in_memory_trade_repository.js';
import { create_in_memory_user_repository } from '../repositories/in_memory_user_repository.js';
import { create_auth_service } from '../services/auth_service.js';
import { create_trade_service } from '../services/trade_service.js';

const cors_origins = ['http://localhost:3000'];

/**
 * Builds an app around one health probe.
 *
 * The trade and auth services are real implementations over in-memory storage, because these
 * routes do not touch either and swapping in a double would prove less while reading as more.
 *
 * @param health_probe - The probe under test.
 * @returns The app.
 */
function app_with(health_probe: HealthProbe): Express {
  return create_app({
    health_probe,
    trade_service: create_trade_service(create_in_memory_trade_repository(), {
      trade_created: () => undefined,
      trade_amended: () => undefined,
      trade_cancelled: () => undefined,
    }),
    auth_service: create_auth_service(
      create_in_memory_user_repository(),
      create_in_memory_refresh_store(),
      create_in_memory_login_attempts(),
    ),
    cors_origins,
  });
}

const reachable: HealthProbe = {
  check_connection: async () => undefined,
};

const unreachable: HealthProbe = {
  check_connection: async () => {
    throw new Error('connect ECONNREFUSED 10.0.0.4:5432, password=hunter2');
  },
};

describe('health routes', () => {
  it('reports liveness without touching the database', async () => {
    const response = await request(app_with(unreachable)).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('reports ready when the database answers', async () => {
    const response = await request(app_with(reachable)).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready', database: 'up' });
  });

  it('reports 503 when the database is unreachable', async () => {
    const response = await request(app_with(unreachable)).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'not_ready', database: 'down' });
  });

  it('does not leak the connection error into the readiness response', async () => {
    const response = await request(app_with(unreachable)).get('/ready');

    expect(JSON.stringify(response.body)).not.toContain('hunter2');
    expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
  });

  it('answers a probe without a token, because a probe has no credentials', async () => {
    const app = app_with(reachable);

    expect((await request(app).get('/health')).status).toBe(200);
    expect((await request(app).get('/ready')).status).toBe(200);
  });

  it('will not confirm whether a path under the API prefix exists', async () => {
    // The guard is mounted across the prefix and runs before the 404, so an anonymous caller gets
    // 401 for a real path and 401 for an imaginary one. Enumerating the API needs a token first.
    const app = app_with(reachable);

    expect((await request(app).get('/api/v1/health')).status).toBe(401);
    expect((await request(app).get('/api/v1/not-a-real-route')).status).toBe(401);
  });
});

describe('metrics route', () => {
  it('exposes the Prometheus text format', async () => {
    const response = await request(app_with(reachable)).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('blotter_socket_clients_connected');
    expect(response.text).toContain('blotter_broadcast_lag_seconds');
  });
});

describe('unmatched routes', () => {
  it('answers a problem document rather than a bare 404', async () => {
    const response = await request(app_with(reachable)).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(() => problem_schema.parse(response.body)).not.toThrow();
    expect(response.body.code).toBe('not_found');
    expect(response.body.detail).toContain('/does-not-exist');
    expect(response.body.instance).toBe('/does-not-exist');
  });
});
