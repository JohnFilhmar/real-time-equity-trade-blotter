import { Router } from 'express';
import { require_permission } from '../middleware/require_auth.js';
import type { TradeService } from '../services/trade_service.js';

/**
 * Builds the position routes.
 *
 * One read, and nothing else: a position is derived from the trades, so there is nothing to
 * create, amend or cancel here. The handler stays thin like every other route: call the service,
 * answer. The read is covered by the global `read_rate_limit` and the `require_auth` guard the app
 * mounts ahead of every versioned route.
 *
 * @param service - The business layer.
 * @returns A router to mount under `/api/v1/positions`.
 */
export function create_position_router(service: TradeService): Router {
  const router = Router();

  router.get('/', require_permission('trade.read'), async (_req, res) => {
    res.json(await service.list_positions());
  });

  return router;
}
