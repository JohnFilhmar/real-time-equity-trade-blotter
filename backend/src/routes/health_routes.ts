import { Router } from 'express';
import type { HealthProbe } from '../interfaces/health_probe.js';

/**
 * Builds the liveness and readiness routes.
 *
 * The two are deliberately separate. `/health` answers "is the process up", which is what a
 * restart policy needs. `/ready` answers "can it serve traffic", which requires the database, and
 * is what an orchestrator should gate dependents on. Collapsing them into one endpoint that
 * ignores the database is how a container reports healthy while every request fails.
 *
 * @param probe - Dependency check used by the readiness route.
 * @returns A router exposing `GET /health` and `GET /ready`.
 */
export function create_health_router(probe: HealthProbe): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime_seconds: Math.round(process.uptime()),
    });
  });

  router.get('/ready', async (_req, res) => {
    try {
      await probe.check_connection();
      res.json({ status: 'ready', database: 'up' });
    } catch {
      res.status(503).json({ status: 'not_ready', database: 'down' });
    }
  });

  return router;
}
