import { role_has, type Currency, type Trade } from '@blotter/shared';
import { notional_limits } from '../../config/env.js';
import type { TradeRepository } from '../../interfaces/trade_repository.js';
import type { TradeActor } from '../../interfaces/trade_service.js';
import { AppError } from '../../lib/errors/app_error.js';

/**
 * How a limit message speaks of each quote currency: the symbol it shows, how many quote units make
 * one shown unit, and the names the limit covers.
 */
const limit_wording: Readonly<Record<Currency, { symbol: string; divisor: number; names: string }>> = {
  USD: { symbol: '$', divisor: 1, names: 'US names' },
  GBX: { symbol: '£', divisor: 100, names: 'London names' },
};

/**
 * Words a breach of the desk limit the way a trader reads it, in whole dollars or pounds with
 * thousands separators.
 *
 * GBX amounts are pence, so both figures are divided by 100 and shown as pounds. The limit rounds
 * down, the worth rounds up, and the worth never shows below one unit over the limit, so a trade
 * over the limit cannot read as equal to it. The worth is rounded to the cent or penny before it is
 * rounded up. Binary arithmetic can leave a whole worth a hair above itself, so 5,242,900 x 10.05
 * comes out as 52,691,145.00000001, and a plain round-up would add a unit.
 *
 * @param notional - Quantity times price in the quote currency, already known to be over `limit`.
 * @param limit - The desk limit in the quote currency.
 * @param currency - The quote currency.
 * @returns The sentence for the problem detail.
 */
function describe_limit_breach(notional: number, limit: number, currency: Currency): string {
  const { symbol, divisor, names } = limit_wording[currency];
  const shown_limit = Math.floor(limit / divisor);
  const worth_to_the_cent = Math.round((notional / divisor) * 100) / 100;
  const shown_worth = Math.max(Math.ceil(worth_to_the_cent), shown_limit + 1);
  const whole = (units: number): string => `${symbol}${units.toLocaleString('en-GB')}`;

  return `This trade is worth ${whole(shown_worth)}, over the ${whole(shown_limit)} limit for ${names}.`;
}

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
 * @throws {AppError} 422 when the notional is over the limit. The detail gives the trade's worth and
 * the limit in dollars or pounds, and the message under quantity asks for a lower quantity or price.
 */
export function enforce_notional_limit(quantity: number, price: number, currency: Currency): void {
  const notional = quantity * price;
  const limit = notional_limits[currency];

  if (notional > limit) {
    throw AppError.validation_failed(describe_limit_breach(notional, limit, currency), [
      { field: 'quantity', message: 'This trade is over the desk limit. Lower the quantity or price.' },
    ]);
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
