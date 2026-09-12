import type { Currency, Position, Trade } from '@blotter/shared';

/**
 * The position an instrument holds before any trade is counted.
 *
 * @param symbol - The instrument.
 * @param currency - Its quote currency.
 * @returns A position with every figure at zero.
 */
function empty_position(symbol: string, currency: Currency): Position {
  return {
    symbol,
    currency,
    netQuantity: 0,
    buyQuantity: 0,
    sellQuantity: 0,
    grossNotional: 0,
    tradeCount: 0,
  };
}

/**
 * Folds one active trade into the running position for its instrument.
 *
 * @param position - The position so far.
 * @param trade - The trade to count.
 * @returns The position with the trade added.
 */
function add_to_position(position: Position, trade: Trade): Position {
  const bought = trade.side === 'BUY' ? trade.quantity : 0;
  const sold = trade.side === 'SELL' ? trade.quantity : 0;

  return {
    ...position,
    netQuantity: position.netQuantity + bought - sold,
    buyQuantity: position.buyQuantity + bought,
    sellQuantity: position.sellQuantity + sold,
    grossNotional: position.grossNotional + trade.quantity * trade.price,
    tradeCount: position.tradeCount + 1,
  };
}

/** The in-memory side of `TradeRepository.aggregate_positions`. */
export function aggregate_positions(trades: Map<string, Trade>): Position[] {
  const positions = new Map<string, Position>();

  for (const trade of trades.values()) {
    if (trade.status !== 'ACTIVE') {
      continue;
    }

    const key = `${trade.symbol}|${trade.currency}`;
    const so_far = positions.get(key) ?? empty_position(trade.symbol, trade.currency);
    positions.set(key, add_to_position(so_far, trade));
  }

  return [...positions.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
