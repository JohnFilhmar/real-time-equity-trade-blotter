import type { TradeSide } from '@blotter/shared';

/**
 * Net quantity, in shares, at which the lean reaches about three quarters of its strength.
 *
 * 100,000 shares is roughly twenty average tickets, so a symbol has to drift well away from flat
 * before the desk works it back hard, and a handful of trades never swings it.
 */
export const lean_scale_shares = 100_000;

/** The furthest the chance of a side moves from even. Below 0.5, so no side is ever ruled out. */
const max_lean = 0.4;

/**
 * Picks the side of a new ticket, leaning against the desk's current position in that symbol.
 *
 * A desk working client flow from both sides and hedging its risk stays close to flat. A coin flip
 * per ticket walks the book away from zero without limit, which is how a demo blotter ends up
 * hundreds of millions short. The chance of a sell rises smoothly with a long position and falls
 * with a short one, and at the extremes it stops at nine in ten, so the feed never looks scripted.
 *
 * @param net_quantity - The desk's net shares in the symbol: positive when long, negative when short.
 * @param roll - A uniform draw between 0 and 1.
 * @returns `SELL` when the roll falls under the chance of a sell, otherwise `BUY`.
 */
export function lean_side(net_quantity: number, roll: number): TradeSide {
  const chance_of_sell = 0.5 + max_lean * Math.tanh(net_quantity / lean_scale_shares);
  return roll < chance_of_sell ? 'SELL' : 'BUY';
}
