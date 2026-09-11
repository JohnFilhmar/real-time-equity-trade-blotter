import { faker } from '@faker-js/faker';
import type { CreateTrade, TradeSide, TradeStatus } from '@blotter/shared';

/** An instrument in the seeded universe, with the price level it trades around. */
interface Instrument {
  symbol: string;
  base_price: number;
  book: string;
}

/**
 * The seeded instrument universe.
 *
 * Price levels for AAPL, MSFT and TSLA are the brief's own sample figures. The rest sit at
 * plausible levels for the same period. Books follow the listing venue rather than being drawn
 * independently, because a London equities desk booking a US tech name to `EQUITIES_UK` is the
 * kind of detail that reads as random data.
 */
const instruments: readonly Instrument[] = [
  { symbol: 'AAPL', base_price: 227.45, book: 'EQUITIES_US' },
  { symbol: 'MSFT', base_price: 534.22, book: 'EQUITIES_US' },
  { symbol: 'TSLA', base_price: 341.75, book: 'TECH_GROWTH' },
  { symbol: 'NVDA', base_price: 178.9, book: 'TECH_GROWTH' },
  { symbol: 'AMZN', base_price: 231.6, book: 'EQUITIES_US' },
  { symbol: 'META', base_price: 612.35, book: 'TECH_GROWTH' },
  { symbol: 'GOOGL', base_price: 201.15, book: 'EQUITIES_US' },
  { symbol: 'JPM', base_price: 268.4, book: 'FINANCIALS' },
  { symbol: 'HSBA.L', base_price: 9.82, book: 'EQUITIES_UK' },
  { symbol: 'BP.L', base_price: 4.36, book: 'EQUITIES_UK' },
  { symbol: 'VOD.L', base_price: 0.78, book: 'EQUITIES_UK' },
  { symbol: 'SHEL.L', base_price: 28.14, book: 'EQUITIES_UK' },
];

/** Trader codes in the brief's initial-plus-surname form. */
const traders: readonly string[] = [
  'JSMITH',
  'ABROWN',
  'MJONES',
  'RPATEL',
  'KOSULLIVAN',
  'DWRIGHT',
  'LCHEN',
  'FMORENO',
];

/** Counterparties a broker would actually face. */
const counterparties: readonly string[] = [
  'Goldman Sachs',
  'JP Morgan',
  'Morgan Stanley',
  'Barclays',
  'Citigroup',
  'UBS',
  'Deutsche Bank',
  'BNP Paribas',
  'Nomura',
  'Jefferies',
];

/** A generated trade, before the database assigns identifiers and row timestamps. */
export interface GeneratedTrade {
  symbol: string;
  side: TradeSide;
  quantity: number;
  price: string;
  trader: string;
  book: string;
  counterparty: string;
  tradeTimestamp: Date;
  status: TradeStatus;
}

/**
 * Picks a timestamp inside a trading session, clustered at the open and the close.
 *
 * Uniform times across the day would spread trades evenly, which no real blotter shows: volume
 * concentrates at the auction periods.
 *
 * @param session_day - Midnight UTC of the session to place the trade in.
 * @returns An instant between 08:00 and 16:30 UTC on that day.
 */
function pick_session_time(session_day: Date): Date {
  const roll = faker.number.float({ min: 0, max: 1 });
  const minutes_from_open =
    roll < 0.35
      ? faker.number.int({ min: 0, max: 45 })
      : roll < 0.65
        ? faker.number.int({ min: 465, max: 510 })
        : faker.number.int({ min: 46, max: 464 });

  const timestamp = new Date(session_day);
  timestamp.setUTCHours(8, 0, 0, 0);
  timestamp.setUTCMinutes(timestamp.getUTCMinutes() + minutes_from_open);
  timestamp.setUTCSeconds(faker.number.int({ min: 0, max: 59 }));
  return timestamp;
}

/**
 * Generates a realistic randomised trade population.
 *
 * Realism is the point rather than randomness: prices drift around each instrument's own level,
 * quantities are round lots skewed toward smaller tickets, and roughly one trade in twenty is
 * already cancelled so the status filter has something to find.
 *
 * @param count - How many trades to generate. The brief asks for 100 to 1,000.
 * @param seed - Fixed so a given count always produces the same dataset.
 * @returns Trades ordered oldest first, ready for a bulk insert.
 */
export function generate_trades(count: number, seed = 20260818): GeneratedTrade[] {
  faker.seed(seed);

  const sessions = Array.from({ length: 5 }, (_, index) => {
    const day = new Date(Date.UTC(2026, 7, 18));
    day.setUTCDate(day.getUTCDate() + index);
    return day;
  });

  const trades = Array.from({ length: count }, () => {
    const instrument = faker.helpers.arrayElement(instruments);
    const session = faker.helpers.arrayElement(sessions);

    const drift = faker.number.float({ min: -0.04, max: 0.04 });
    const price = instrument.base_price * (1 + drift);

    const lots = faker.helpers.weightedArrayElement([
      { weight: 60, value: faker.number.int({ min: 1, max: 20 }) },
      { weight: 30, value: faker.number.int({ min: 21, max: 100 }) },
      { weight: 10, value: faker.number.int({ min: 101, max: 500 }) },
    ]);

    return {
      symbol: instrument.symbol,
      side: faker.helpers.arrayElement(['BUY', 'SELL']) as TradeSide,
      quantity: lots * 100,
      price: price.toFixed(6),
      trader: faker.helpers.arrayElement(traders),
      book: instrument.book,
      counterparty: faker.helpers.arrayElement(counterparties),
      tradeTimestamp: pick_session_time(session),
      status: (faker.number.float({ min: 0, max: 1 }) < 0.05
        ? 'CANCELLED'
        : 'ACTIVE') as TradeStatus,
    } satisfies GeneratedTrade;
  });

  return trades.sort((a, b) => a.tradeTimestamp.getTime() - b.tradeTimestamp.getTime());
}

/**
 * Picks a round-lot quantity skewed toward smaller tickets, the way a real blotter reads.
 *
 * @returns A share count that is always a multiple of 100.
 */
function pick_quantity(): number {
  const lots = faker.helpers.weightedArrayElement([
    { weight: 60, value: faker.number.int({ min: 1, max: 20 }) },
    { weight: 30, value: faker.number.int({ min: 21, max: 100 }) },
    { weight: 10, value: faker.number.int({ min: 101, max: 500 }) },
  ]);

  return lots * 100;
}

/**
 * Generates one trade, timestamped now, in the shape the create endpoint accepts.
 *
 * This deliberately does not reseed faker. The startup seed wants a reproducible dataset so a
 * reviewer sees the same blotter twice, whereas a live feed that repeated itself every tick would
 * not look live. It draws from the same instrument universe as the seed, so the feed cannot
 * introduce a symbol the rest of the dataset has never heard of.
 *
 * @returns A create payload ready to hand to the trade service.
 */
export function generate_live_trade(): CreateTrade {
  const instrument = faker.helpers.arrayElement(instruments);
  const drift = faker.number.float({ min: -0.04, max: 0.04 });

  return {
    symbol: instrument.symbol,
    side: faker.helpers.arrayElement(['BUY', 'SELL']) as TradeSide,
    quantity: pick_quantity(),
    price: Number((instrument.base_price * (1 + drift)).toFixed(6)),
    trader: faker.helpers.arrayElement(traders),
    book: instrument.book,
    counterparty: faker.helpers.arrayElement(counterparties),
    tradeTimestamp: new Date().toISOString(),
  };
}

/**
 * Produces the change an amendment should apply to an existing trade.
 *
 * Only quantity and price move, because those are the fields a desk actually corrects after
 * booking. Re-pointing a trade at a different symbol or counterparty would be a rebooking rather
 * than an amendment.
 *
 * @param current_price - The trade's present price, so the new one drifts from it rather than
 * jumping to an unrelated level.
 * @returns A partial create payload carrying quantity and price.
 */
export function generate_live_amendment(
  current_price: number,
): Pick<CreateTrade, 'quantity' | 'price'> {
  const price_drift = faker.number.float({ min: -0.01, max: 0.01 });

  return {
    quantity: pick_quantity(),
    price: Number((current_price * (1 + price_drift)).toFixed(6)),
  };
}
