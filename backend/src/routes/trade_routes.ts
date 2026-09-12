import { Router } from 'express';
import { z } from 'zod';
import {
  amend_trade_schema,
  cancel_trade_schema,
  create_trade_schema,
  trade_id_pattern,
  trade_query_schema,
} from '@blotter/shared';
import { write_rate_limit } from '../middleware/rate_limit.js';
import type { TradeService } from '../services/trade_service.js';

/**
 * The path parameter every single-trade route takes.
 *
 * Validated rather than passed straight through, so a malformed identifier is a 422 naming the
 * problem instead of a 404 that reads like the trade was deleted.
 */
const trade_params_schema = z.object({
  trade_id: z.string().regex(trade_id_pattern, 'trade id must look like TRD-100001'),
});

/**
 * Builds the trade routes.
 *
 * Handlers stay thin on purpose: parse the input with the shared schema, call the service, answer.
 * No business rule lives here, and no handler touches Prisma. Express 5 forwards a rejected
 * promise to the error middleware on its own, so none of them need a try/catch.
 *
 * Reads are already covered by the global `read_rate_limit`; the mutating routes add
 * `write_rate_limit` on top because each one writes to the database and fans out to every
 * connected client.
 *
 * @param service - The business layer.
 * @returns A router to mount under `/api/trades`.
 */
export function create_trade_router(service: TradeService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = trade_query_schema.parse(req.query);
    res.json(await service.list(query));
  });

  router.get('/:trade_id', async (req, res) => {
    const { trade_id } = trade_params_schema.parse(req.params);
    res.json(await service.get(trade_id));
  });

  router.get('/:trade_id/amendments', async (req, res) => {
    const { trade_id } = trade_params_schema.parse(req.params);
    res.json(await service.list_amendments(trade_id));
  });

  router.post('/', write_rate_limit, async (req, res) => {
    const input = create_trade_schema.parse(req.body);
    res.status(201).json(await service.create(input));
  });

  router.patch('/:trade_id', write_rate_limit, async (req, res) => {
    const { trade_id } = trade_params_schema.parse(req.params);
    const input = amend_trade_schema.parse(req.body);
    res.json(await service.amend(trade_id, input));
  });

  router.post('/:trade_id/cancel', write_rate_limit, async (req, res) => {
    const { trade_id } = trade_params_schema.parse(req.params);
    const { version } = cancel_trade_schema.parse(req.body ?? {});
    res.json(await service.cancel(trade_id, version));
  });

  return router;
}
