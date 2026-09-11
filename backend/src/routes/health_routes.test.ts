import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { create_app } from '../app.js';
import type { HealthProbe } from '../interfaces/health_probe.js';
import { create_in_memory_trade_repository } from '../repositories/in_memory_trade_repository.js';
import { create_trade_service } from '../services/trade_service.js';

const cors_origins = ['http://localhost:3000'];

/** The health routes do not touch trades, so any working service will do. */
const trade_service = create_trade_service(create_in_memory_trade_repository(), {
  trade_created: () => undefined,
  trade_amended: () => undefined,
  trade_cancelled: () => undefined,
});

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
    const response = await request(
      create_app({ health_probe: unreachable, trade_service, cors_origins }),
    ).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('reports ready when the database answers', async () => {
    const response = await request(
      create_app({ health_probe: reachable, trade_service, cors_origins }),
    ).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready', database: 'up' });
  });

  it('reports 503 when the database is unreachable', async () => {
    const response = await request(
      create_app({ health_probe: unreachable, trade_service, cors_origins }),
    ).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'not_ready', database: 'down' });
  });

  it('does not leak the connection error into the readiness response', async () => {
    const response = await request(
      create_app({ health_probe: unreachable, trade_service, cors_origins }),
    ).get('/ready');

    expect(JSON.stringify(response.body)).not.toContain('hunter2');
    expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
  });
});

describe('unmatched routes', () => {
  it('returns the standard error shape rather than a bare 404', async () => {
    const response = await request(
      create_app({ health_probe: reachable, trade_service, cors_origins }),
    ).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
    expect(response.body.error.message).toContain('/does-not-exist');
  });
});
