import { Router } from 'express';
import { registry } from '../lib/metrics/socket_metrics.js';

/**
 * Builds the metrics route.
 *
 * Mounted outside the versioned API prefix on purpose: `/metrics` is an operational endpoint for a
 * scraper, not part of the contract a blotter client depends on, so versioning it would tie a
 * monitoring convention to an API lifecycle it has nothing to do with.
 *
 * @returns A router exposing `GET /metrics` in the Prometheus text exposition format.
 */
export function create_metrics_router(): Router {
  const router = Router();

  router.get('/metrics', async (_req, res) => {
    res.type(registry.contentType);
    res.send(await registry.metrics());
  });

  return router;
}
