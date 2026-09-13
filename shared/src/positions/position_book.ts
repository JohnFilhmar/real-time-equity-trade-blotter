import type { Currency } from '../reference/instruments.js';
import { find_instrument } from '../reference/instruments.js';
import type { Position } from '../schemas/position.js';
import type { Trade } from '../schemas/trade.js';

/**
 * A flat position in one instrument, before any trade is applied.
 *
 * @param symbol - The instrument.
 * @param currency - Its quote currency.
 * @returns A position with every figure at zero.
 */
export function empty_position(symbol: string, currency: Currency): Position {
  return {
    symbol,
    currency,
    netQuantity: 0,
    buyQuantity: 0,
    sellQuantity: 0,
    grossNotional: 0,
    tradeCount: 0,
    averagePrice: 0,
    realisedPnl: 0,
  };
}

/**
 * Applies one active trade to a position under average cost.
 *
 * Three cases. A trade on a flat book opens it at the trade price. A trade on the same side as
 * the book moves the average toward its price, weighted by size. A trade against the book closes
 * up to the open size at the book's average, realising the difference, and if it overshoots the
 * remainder opens the other way at the trade price.
 *
 * Trades must be applied in execution order, which is why callers use {@link build_positions}
 * rather than calling this from a broadcast handler.
 *
 * @param position - The book before the trade.
 * @param trade - An `ACTIVE` trade in the same instrument.
 * @returns The book after the trade. The input is not mutated.
 */
export function apply_trade(position: Position, trade: Trade): Position {
  const signed = trade.side === 'BUY' ? trade.quantity : -trade.quantity;
  let net = position.netQuantity;
  let average = position.averagePrice;
  let realised = position.realisedPnl;

  if (net === 0) {
    average = trade.price;
    net = signed;
  } else if (Math.sign(net) === Math.sign(signed)) {
    const open = Math.abs(net);
    average = (open * average + trade.quantity * trade.price) / (open + trade.quantity);
    net += signed;
  } else {
    const closing = Math.min(trade.quantity, Math.abs(net));
    realised += (trade.price - average) * closing * Math.sign(net);
    const before = net;
    net += signed;
    if (net === 0) {
      average = 0;
    } else if (Math.sign(net) !== Math.sign(before)) {
      average = trade.price;
    }
  }

  return {
    ...position,
    netQuantity: net,
    buyQuantity: position.buyQuantity + (trade.side === 'BUY' ? trade.quantity : 0),
    sellQuantity: position.sellQuantity + (trade.side === 'SELL' ? trade.quantity : 0),
    grossNotional: position.grossNotional + trade.quantity * trade.price,
    tradeCount: position.tradeCount + 1,
    averagePrice: average,
    realisedPnl: realised,
  };
}

/**
 * Orders trades the way the walk needs them: by execution time, then by id for a stable tiebreak.
 *
 * @param a - First trade.
 * @param b - Second trade.
 * @returns Negative when `a` executed first.
 */
function by_execution(a: Trade, b: Trade): number {
  const time = Date.parse(a.tradeTimestamp) - Date.parse(b.tradeTimestamp);
  return time !== 0 ? time : a.id.localeCompare(b.id, 'en');
}

/**
 * Builds the position in every instrument from a set of trades.
 *
 * Cancelled trades are ignored, which is what makes cancel a status rather than a delete: the
 * audit trail keeps the row and the book forgets it. Symbols come back sorted.
 *
 * @param trades - Trades in any order; only `ACTIVE` ones count.
 * @returns One position per symbol that has at least one active trade.
 */
export function build_positions(trades: readonly Trade[]): Position[] {
  const books = new Map<string, Position>();

  for (const trade of [...trades].filter((row) => row.status === 'ACTIVE').sort(by_execution)) {
    const current = books.get(trade.symbol) ?? empty_position(trade.symbol, trade.currency);
    books.set(trade.symbol, apply_trade(current, trade));
  }

  return [...books.values()].sort((a, b) => a.symbol.localeCompare(b.symbol, 'en'));
}

/**
 * Marks a position to market.
 *
 * @param position - The book.
 * @param mark - The current mark in the quote currency, or `undefined` when none has arrived.
 * @returns Unrealised P&L in the quote currency, or `null` without a mark.
 */
export function unrealised_pnl(position: Position, mark: number | undefined): number | null {
  if (mark === undefined) {
    return null;
  }
  return position.netQuantity === 0 ? 0 : (mark - position.averagePrice) * position.netQuantity;
}

/**
 * The quote currency for a symbol, for callers that hold a symbol but no trade.
 *
 * @param symbol - The instrument.
 * @returns Its currency, defaulting to USD for a symbol outside the universe, which cannot occur
 * for a trade the API accepted.
 */
export function currency_of(symbol: string): Currency {
  return find_instrument(symbol)?.currency ?? 'USD';
}
