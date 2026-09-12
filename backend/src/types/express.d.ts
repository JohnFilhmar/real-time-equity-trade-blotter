import type { AccessClaims } from '../lib/auth/tokens.js';

declare global {
  namespace Express {
    interface Request {
      /**
       * The verified access token claims, set by `require_auth`.
       *
       * Optional because the middleware has not run on the public routes mounted ahead of it. Any
       * handler behind the guard can rely on it being present, and `require_claims` is the one
       * place that turns "should be there" into a checked value.
       */
      auth?: AccessClaims;
    }
  }
}

export {};
