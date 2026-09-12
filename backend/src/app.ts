import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookie_parser from 'cookie-parser';
import type { HealthProbe } from './interfaces/health_probe.js';
import type { AuthService } from './services/auth_service.js';
import type { TradeService } from './services/trade_service.js';
import { create_auth_router, create_public_auth_router } from './routes/auth_routes.js';
import { create_health_router } from './routes/health_routes.js';
import { create_metrics_router } from './routes/metrics_routes.js';
import { create_position_router } from './routes/position_routes.js';
import { create_trade_router } from './routes/trade_routes.js';
import { error_handler, not_found_handler } from './middleware/error_handler.js';
import { read_rate_limit } from './middleware/rate_limit.js';
import { require_auth } from './middleware/require_auth.js';
import { request_logger } from './lib/logging/logger.js';

/** Collaborators and configuration the app needs, passed in so tests can supply their own. */
export interface AppDependencies {
  health_probe: HealthProbe;
  trade_service: TradeService;
  auth_service: AuthService;
  cors_origins: readonly string[];
}

/** The versioned prefix every blotter resource lives under. */
export const api_prefix = '/api/v1';

/**
 * Assembles the Express application.
 *
 * The order of these lines is the security model, so it is worth reading as one.
 *
 * The request logger goes first, so every later line carries a correlation id. Then hardening and
 * parsing. Then the operational endpoints, which sit outside the versioned prefix because they are
 * for a probe and a scraper rather than for a blotter client.
 *
 * Then the two credential routes, then `require_auth` across the whole prefix. That ordering is
 * what makes authentication the default rather than an opt-in: anything mounted after that line is
 * protected without anyone remembering to protect it, and the only public routes are the two that
 * are visibly above it. An allowlist of guarded routes is the arrangement someone eventually
 * forgets to extend.
 *
 * The read limiter sits after the guard so it can key by user rather than by address, and the 404
 * and error handlers sit last so an unmatched path is an error like any other.
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
  app.use(cookie_parser());

  app.use(create_health_router(dependencies.health_probe));
  app.use(create_metrics_router());

  // Public by position, not by annotation. Everything below require_auth needs a token.
  app.use(api_prefix, create_public_auth_router(dependencies.auth_service));

  app.use(api_prefix, require_auth);
  app.use(api_prefix, read_rate_limit);

  app.use(api_prefix, create_auth_router(dependencies.auth_service));
  app.use(`${api_prefix}/trades`, create_trade_router(dependencies.trade_service));
  app.use(`${api_prefix}/positions`, create_position_router(dependencies.trade_service));

  app.use(not_found_handler);
  app.use(error_handler);

  return app;
}
