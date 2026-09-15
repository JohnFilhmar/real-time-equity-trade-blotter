import { faker } from '@faker-js/faker';
import { instruments } from '@blotter/shared';
import type { TradeRepository } from '../../interfaces/trade_repository.js';
import type { TradeActor, TradeService } from '../../services/trade_service/index.js';
import { AppError } from '../errors/app_error.js';
import { logger } from '../logging/logger.js';
import { generate_live_amendment, generate_live_trade } from '../seed/generate_trades.js';
import { choose_action } from './choose_action.js';
import { choose_amend_scope, recent_amend_window } from './choose_amend_scope.js';
import { lean_side } from './lean_side.js';

/** How the feed paces itself and how large a book it keeps. */
export interface LiveFeedOptions {
  /** Shortest gap between two actions, in milliseconds. */
  min_interval_ms: number;

  /** Longest gap between two actions, in milliseconds. */
  max_interval_ms: number;

  /** The size the feed keeps its active book near. See `choose_action` for how. */
  max_active_trades: number;
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
 * It writes through the trade service rather than the repository, so a simulated trade takes the
 * same validation, the same status transitions and the same broadcast as one a user books, and the
 * two paths cannot drift apart. It amends and cancels as well as creates, so all three socket
 * events fire and the grid is seen updating rows in place rather than only growing. Its interval is
 * jittered, because a metronome reads as synthetic on screen.
 *
 * It also behaves like a desk that manages its risk. It draws far more bookings than cancels, so
 * left alone the active book would grow for as long as the stack runs; as the book nears
 * `max_active_trades`, more and more bookings become cancels, and a book at or over that size still
 * books one ticket in seven while it drains. Each new ticket's side leans against that symbol's
 * current net position, so the book stays near flat instead of wandering hundreds of millions long
 * or short. The limit is soft and covers active trades only: trades people book count toward it,
 * and cancelled trades and audit rows still accumulate.
 *
 * A conflict is expected rather than exceptional: the feed can pick a trade a user is amending at
 * the same moment. Those are swallowed. Anything else is logged and the loop continues, because a
 * demo feed must never take the API down with it.
 *
 * @param service - The business layer the feed writes through, and where it reads a symbol's position.
 * @param repository - Used to choose an existing trade to act on and to count the active book.
 * @param options - Pacing and the size of book to keep.
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
   * Books a brand new trade, on the side that works the symbol's position back toward flat.
   */
  async function do_create(): Promise<void> {
    const instrument = faker.helpers.arrayElement(instruments);
    const position = await service.position_for(instrument.symbol);
    const side = lean_side(position.netQuantity, faker.number.float({ min: 0, max: 1 }));
    const generated = generate_live_trade(instrument, side);
    await service.create(generated.payload, actor_for(generated.trader));
  }

  /**
   * Amends a randomly chosen active trade, falling back to a create when the blotter holds none.
   *
   * Half the time the target is one of the newest trades, the rows on a trader's first screen, so
   * an amendment is seen landing; otherwise it is any active trade in the book.
   */
  async function do_amend(): Promise<void> {
    const scope = choose_amend_scope(faker.number.float({ min: 0, max: 1 }));
    const target =
      scope === 'recent'
        ? await repository.find_random_recent_active(recent_amend_window)
        : await repository.find_random_active();

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
    const drawn = faker.helpers.weightedArrayElement(feed_actions);

    try {
      const active = drawn === 'create' ? await repository.count_active() : 0;
      const action = choose_action(drawn, active, options.max_active_trades, faker.number.float({ min: 0, max: 1 }));

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
