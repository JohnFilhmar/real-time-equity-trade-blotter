import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import {
  amend_trade_schema,
  cancel_trade_schema,
  create_trade_schema,
  trade_event_query_schema,
  trade_id_pattern,
  trade_query_schema,
} from '@blotter/shared';
import { write_rate_limit } from '../middleware/rate_limit.js';
import { require_claims, require_permission } from '../middleware/require_auth.js';
import type { TradeActor, TradeService } from '../services/trade_service/index.js';

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
 * Turns the verified token claims into the actor the service works with.
 *
 * The desk code comes from the token rather than from the body, which is what stops a caller
 * booking or amending under somebody else's code.
 *
 * @param req - The request, behind the authentication guard.
 * @returns The actor.
 */
function actor_of(req: Request): TradeActor {
  const claims = require_claims(req);

  return {
    trader_code: claims.trader_code,
    role: claims.role,
    source: 'API',
  };
}

/**
 * Builds the trade routes.
 *
 * Handlers stay thin on purpose: parse the input with the shared schema, call the service, answer.
 * No business rule lives here, and no handler touches Prisma. Express 5 forwards a rejected
 * promise to the error middleware on its own, so none of them need a try/catch.
 *
 * Every route names the permission it needs rather than the role that happens to have it. The
 * checks that depend on the row rather than the request, such as whether this trader may amend
 * this particular trade, live in the service, because middleware cannot see the row.
 *
 * Reads are already covered by the global `read_rate_limit`; the mutating routes add
 * `write_rate_limit` on top because each one writes to the database and fans out to every
 * connected client.
 *
 * @param service - The business layer.
 * @returns A router to mount under `/api/v1/trades`.
 */
export function create_trade_router(service: TradeService): Router {
  const router = Router();

  router.get('/', require_permission('trade.read'), async (req, res) => {
    const query = trade_query_schema.parse(req.query);
    res.json(await service.list(query));
  });

  // Declared ahead of the parameter routes, or Express would read "events" as a trade id and
  // answer 422.
  router.get('/events', require_permission('trade.read'), async (req, res) => {
    const query = trade_event_query_schema.parse(req.query);
    res.json(await service.list_all_events(query));
  });

  router.get('/:trade_id', require_permission('trade.read'), async (req, res) => {
    const { trade_id } = trade_params_schema.parse(req.params);
    res.json(await service.get(trade_id));
  });

  router.get('/:trade_id/events', require_permission('trade.read'), async (req, res) => {
    const { trade_id } = trade_params_schema.parse(req.params);
    res.json(await service.list_events(trade_id));
  });

  router.post('/', write_rate_limit, require_permission('trade.create'), async (req, res) => {
    const input = create_trade_schema.parse(req.body);
    res.status(201).json(await service.create(input, actor_of(req)));
  });

  router.patch(
    '/:trade_id',
    write_rate_limit,
    require_permission('trade.amend'),
    async (req, res) => {
      const { trade_id } = trade_params_schema.parse(req.params);
      const input = amend_trade_schema.parse(req.body);
      res.json(await service.amend(trade_id, input, actor_of(req)));
    },
  );

  router.post(
    '/:trade_id/cancel',
    write_rate_limit,
    require_permission('trade.cancel'),
    async (req, res) => {
      const { trade_id } = trade_params_schema.parse(req.params);
      const { version } = cancel_trade_schema.parse(req.body ?? {});
      res.json(await service.cancel(trade_id, version, actor_of(req)));
    },
  );

  return router;
}
