/**
 * Currencies the blotter quotes in.
 *
 * `GBX` is pence sterling, not pounds. It is a real ISO-adjacent code used by the London Stock
 * Exchange and it is the reason this list exists: a grid showing HSBA.L at 982 beside AAPL at
 * 227.45 is only coherent if the price column knows which scale it is looking at.
 */
export const currency_values = ['USD', 'GBX'] as const;

/** A currency the blotter quotes in. */
export type Currency = (typeof currency_values)[number];

/** One tradable name, with everything the blotter needs to know about it. */
export interface Instrument {
  /** Ticker as it appears on the blotter. */
  symbol: string;

  /** The currency this name is quoted in. */
  currency: Currency;

  /** The desk book this name is normally traded on. */
  book: string;

  /** Price level the generated data drifts around, in the instrument's own quote currency. */
  base_price: number;
}

/**
 * The tradable universe.
 *
 * One list, read by the seed generator, the live feed, the symbol allowlist and the client, so a
 * name cannot exist in one of those and not the others. Adding a name here is the only thing
 * needed to make it bookable.
 *
 * The London names are quoted in GBX because that is what the London Stock Exchange does. Pricing
 * them in pounds, as an earlier version of the seed did, produces a blotter where a reader who
 * knows the market sees VOD.L at 0.78 and stops reading.
 *
 * Price levels for AAPL, MSFT and TSLA are the brief's own sample figures.
 */
export const instruments: readonly Instrument[] = [
  { symbol: 'AAPL', currency: 'USD', book: 'EQUITIES_US', base_price: 227.45 },
  { symbol: 'MSFT', currency: 'USD', book: 'EQUITIES_US', base_price: 534.22 },
  { symbol: 'TSLA', currency: 'USD', book: 'TECH_GROWTH', base_price: 341.75 },
  { symbol: 'NVDA', currency: 'USD', book: 'TECH_GROWTH', base_price: 178.9 },
  { symbol: 'AMZN', currency: 'USD', book: 'EQUITIES_US', base_price: 231.6 },
  { symbol: 'META', currency: 'USD', book: 'TECH_GROWTH', base_price: 612.35 },
  { symbol: 'GOOGL', currency: 'USD', book: 'EQUITIES_US', base_price: 201.15 },
  { symbol: 'JPM', currency: 'USD', book: 'FINANCIALS', base_price: 268.4 },
  { symbol: 'HSBA.L', currency: 'GBX', book: 'EQUITIES_UK', base_price: 982 },
  { symbol: 'BP.L', currency: 'GBX', book: 'EQUITIES_UK', base_price: 436 },
  { symbol: 'VOD.L', currency: 'GBX', book: 'EQUITIES_UK', base_price: 78 },
  { symbol: 'SHEL.L', currency: 'GBX', book: 'EQUITIES_UK', base_price: 2814 },
];

/**
 * Every bookable symbol, as a tuple so it can become a Zod enum.
 *
 * Typed as a non-empty tuple because `z.enum` requires one, and because a universe with no names
 * in it is a configuration error rather than a state to tolerate.
 */
export const instrument_symbols: [string, ...string[]] = [
  instruments[0]?.symbol ?? 'AAPL',
  ...instruments.slice(1).map((instrument) => instrument.symbol),
];

/** Symbol to instrument, for the lookups the seed, the feed and the currency rule all need. */
const by_symbol = new Map(instruments.map((instrument) => [instrument.symbol, instrument]));

/**
 * Finds one instrument by ticker.
 *
 * @param symbol - The ticker to look up.
 * @returns The instrument, or `undefined` when the symbol is not in the universe.
 */
export function find_instrument(symbol: string): Instrument | undefined {
  return by_symbol.get(symbol);
}
