import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import type { HealthProbe } from './interfaces/health_probe.js';
import type { TradeService } from './services/trade_service.js';
import { create_health_router } from './routes/health_routes.js';
import { create_metrics_router } from './routes/metrics_routes.js';
import { create_trade_router } from './routes/trade_routes.js';
import { error_handler, not_found_handler } from './middleware/error_handler.js';
import { read_rate_limit } from './middleware/rate_limit.js';
import { request_logger } from './lib/logging/logger.js';

/** Collaborators and configuration the app needs, passed in so tests can supply their own. */
export interface AppDependencies {
  health_probe: HealthProbe;
  trade_service: TradeService;
  cors_origins: readonly string[];
}

/** The versioned prefix every blotter resource lives under. */
export const api_prefix = '/api/v1';

/**
 * Assembles the Express application.
 *
 * Order is load-bearing: the request logger first so every later line carries a correlation id,
 * then hardening and parsing, then routes, then the 404, then the error handler last. A route
 * mounted after `not_found_handler` would never be reached, which is the trap the original
 * scaffold left behind.
 *
 * Health and metrics sit outside the versioned prefix deliberately. They are operational surfaces
 * for a probe and a scraper, not part of the contract a blotter client depends on, and versioning
 * them would tie an orchestrator's configuration to an API lifecycle it has nothing to do with.
 *
 * @param dependencies - Collaborators the routes need.
 * @returns A configured app, not yet listening.
 */
export function create_app(dependencies: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(request_logger);
  app.use(helmet());
  app.use(
    cors({
      origin: [...dependencies.cors_origins],
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(read_rate_limit);

  app.use(create_health_router(dependencies.health_probe));
  app.use(create_metrics_router());
  app.use(`${api_prefix}/trades`, create_trade_router(dependencies.trade_service));

  app.use(not_found_handler);
  app.use(error_handler);

  return app;
}
