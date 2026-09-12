import { role_has, type Currency, type Trade } from '@blotter/shared';
import { notional_limits } from '../../config/env.js';
import type { TradeRepository } from '../../interfaces/trade_repository.js';
import type { TradeActor } from '../../interfaces/trade_service.js';
import { AppError } from '../../lib/errors/app_error.js';

/**
 * Rejects a ticket whose notional breaches the desk limit for its currency.
 *
 * The pre-trade control the brief never asks for and a trading firm would expect: it is the check
 * that stops a quantity typed into the price field from booking. Limits are per currency because
 * the blotter quotes in both USD and GBX and one ceiling cannot mean the same thing in both.
 *
 * @param quantity - Share count.
 * @param price - Price in the instrument's own currency.
 * @param currency - The instrument's quote currency.
 * @throws {AppError} 422 when the notional is over the limit.
 */
export function enforce_notional_limit(quantity: number, price: number, currency: Currency): void {
  const notional = quantity * price;
  const limit = notional_limits[currency];

  if (notional > limit) {
    throw AppError.validation_failed(
      `Notional ${notional.toFixed(2)} ${currency} exceeds the ${limit.toFixed(2)} ${currency} desk limit`,
      [{ field: 'quantity', message: 'quantity times price exceeds the desk notional limit' }],
    );
  }
}

/**
 * Refuses to let one trader act on another's trade without the permission for it.
 *
 * This is the check the route middleware cannot make, because it depends on the row rather than on
 * the request: a trader holds `trade.amend`, but only an administrator holds `trade.amend.any`.
 * Doing it here rather than in the handler means the live feed is subject to the same rule.
 *
 * @param trade - The trade being acted on.
 * @param actor - Who is acting.
 * @param elevated - The permission that allows acting on someone else's trade.
 * @param verb - The action, for the message.
 * @throws {AppError} 403 when the trade belongs to someone else and the actor lacks the permission.
 */
export function enforce_ownership(
  trade: Trade,
  actor: TradeActor,
  elevated: 'trade.amend.any' | 'trade.cancel.any',
  verb: string,
): void {
  if (trade.trader === actor.trader_code || role_has(actor.role, elevated)) {
    return;
  }

  throw AppError.forbidden(`Only ${trade.trader} or an administrator can ${verb} this trade`);
}

/**
 * Explains why a conditional write matched no row.
 *
 * The repository answers `null` for three different situations, and only the service knows which
 * status code each deserves, so the disambiguating read lives here.
 *
 * @param repository - Used to re-read the trade.
 * @param trade_id - The trade the write targeted.
 * @param action - The verb to use in the message, for example `amended`.
 * @returns Never returns.
 * @throws {AppError} 404 when the trade does not exist, 409 otherwise.
 */
export async function explain_failed_write(
  repository: TradeRepository,
  trade_id: string,
  action: string,
): Promise<never> {
  const current = await repository.find_by_trade_id(trade_id);

  if (current === null) {
    throw AppError.not_found('trade', trade_id);
  }

  if (current.status === 'CANCELLED') {
    throw AppError.conflict(`Trade ${trade_id} is cancelled and can no longer be ${action}`);
  }

  throw AppError.conflict(
    `Trade ${trade_id} has changed since you loaded it. It is now at version ${current.version.toString()}. Reload and try again.`,
  );
}
