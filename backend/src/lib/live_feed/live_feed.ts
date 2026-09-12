import { faker } from '@faker-js/faker';
import type { TradeRepository } from '../../interfaces/trade_repository.js';
import type { TradeActor, TradeService } from '../../services/trade_service.js';
import { AppError } from '../errors/app_error.js';
import { logger } from '../logging/logger.js';
import { generate_live_amendment, generate_live_trade } from '../seed/generate_trades.js';

/** How the feed paces itself. */
export interface LiveFeedOptions {
  /** Shortest gap between two actions, in milliseconds. */
  min_interval_ms: number;

  /** Longest gap between two actions, in milliseconds. */
  max_interval_ms: number;
}

/** A running simulation of desk activity. */
export interface LiveFeed {
  /** Schedules the first action. Calling this twice is a no-op. */
  start(): void;

  /** Cancels the pending action. The feed can be started again afterwards. */
  stop(): void;
}

/** What the feed does on a given tick, and how often it does it. */
const feed_actions = [
  { weight: 70, value: 'create' },
  { weight: 20, value: 'amend' },
  { weight: 10, value: 'cancel' },
] as const;

/**
 * Simulates a trading desk so the blotter has something to show without a human clicking.
 *
 * Three properties matter here. It writes through the trade service rather than the repository, so
 * a simulated trade takes the same validation, the same status transitions and the same broadcast
 * as one a user books, and the two paths cannot drift apart. It amends and cancels as well as
 * creates, so all three socket events fire and the grid is seen updating rows in place rather than
 * only growing. And its interval is jittered, because a metronome reads as synthetic on screen.
 *
 * A conflict is expected rather than exceptional: the feed can pick a trade a user is amending at
 * the same moment. Those are swallowed. Anything else is logged and the loop continues, because a
 * demo feed must never take the API down with it.
 *
 * @param service - The business layer the feed writes through.
 * @param repository - Used only to choose an existing trade to act on.
 * @param options - Pacing.
 * @returns A feed that is not yet running.
 */
export function create_live_feed(
  service: TradeService,
  repository: TradeRepository,
  options: LiveFeedOptions,
): LiveFeed {
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  /**
   * Builds the actor the feed writes as.
   *
   * ADMIN because the feed acts on trades belonging to every desk, so it needs the permission that
   * covers somebody else's trade. It is not an account and cannot sign in: the elevation exists
   * only inside this process, and `source` is what tells the audit trail these were simulated.
   *
   * @param trader_code - The desk code to attribute this action to.
   * @returns The actor.
   */
  function actor_for(trader_code: string): TradeActor {
    return { trader_code, role: 'ADMIN', source: 'LIVE_FEED' };
  }

  /**
   * Books a brand new trade.
   */
  async function do_create(): Promise<void> {
    const generated = generate_live_trade();
    await service.create(generated.payload, actor_for(generated.trader));
  }

  /**
   * Amends a randomly chosen active trade, falling back to a create when the blotter holds none.
   */
  async function do_amend(): Promise<void> {
    const target = await repository.find_random_active();

    if (target === null) {
      await do_create();
      return;
    }

    await service.amend(
      target.tradeId,
      { version: target.version, ...generate_live_amendment(target.price) },
      actor_for(target.trader),
    );
  }

  /**
   * Cancels a randomly chosen active trade, falling back to a create when there is none.
   */
  async function do_cancel(): Promise<void> {
    const target = await repository.find_random_active();

    if (target === null) {
      await do_create();
      return;
    }

    await service.cancel(target.tradeId, target.version, actor_for(target.trader));
  }

  /**
   * Runs one action, absorbing the conflicts that come from racing a real user.
   */
  async function tick(): Promise<void> {
    const action = faker.helpers.weightedArrayElement(feed_actions);

    try {
      if (action === 'create') {
        await do_create();
      } else if (action === 'amend') {
        await do_amend();
      } else {
        await do_cancel();
      }
    } catch (error) {
      if (error instanceof AppError && (error.status === 409 || error.status === 404)) {
        return;
      }
      logger.warn({ err: error }, 'live_feed_action_failed');
    }
  }

  /**
   * Queues the next action at a random point inside the configured window.
   */
  function schedule(): void {
    if (!running) {
      return;
    }

    const delay = faker.number.int({
      min: options.min_interval_ms,
      max: options.max_interval_ms,
    });

    timer = setTimeout(() => {
      void tick().finally(schedule);
    }, delay);

    // Never let a pending tick hold the process open while it is shutting down.
    timer.unref();
  }

  return {
    start(): void {
      if (running) {
        return;
      }
      running = true;
      schedule();
    },

    stop(): void {
      running = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
