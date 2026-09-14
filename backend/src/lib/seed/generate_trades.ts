import { faker } from '@faker-js/faker';
import {
  instruments,
  trade_side_values,
  type AmendableTrade,
  type CreateTrade,
  type Currency,
  type Instrument,
  type TradeSide,
  type TradeStatus,
} from '@blotter/shared';

/**
 * Trader codes in the brief's initial-plus-surname form.
 *
 * Kept here rather than in the shared package: the client has no use for the list, and publishing
 * it would imply these are accounts rather than free-text desk codes.
 */
export const traders: readonly string[] = [
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

/** A trade the live feed wants booked, with the desk code to book it under. */
export interface GeneratedLiveTrade {
  payload: CreateTrade;
  trader: string;
}

/** A generated trade, before the database assigns identifiers and row timestamps. */
export interface GeneratedTrade {
  symbol: string;
  side: TradeSide;
  quantity: number;
  price: string;
  currency: Currency;
  trader: string;
  book: string;
  counterparty: string;
  tradeTimestamp: Date;
  status: TradeStatus;
}

/**
 * Lists the trading sessions before a given day, skipping weekends.
 *
 * The seed dates its trades in the sessions leading up to the day the stack first starts, so a
 * fresh blotter always opens on recent history and the live desk, booking on the day itself,
 * carries on from it. A weekend trade date is on the standard list of tells that a dataset was
 * generated rather than observed, so Saturday and Sunday are stepped over.
 *
 * Exchange holidays are not handled. That is a deliberate limit rather than an oversight: a real
 * calendar is per-venue and this universe spans two.
 *
 * @param day - Any instant on the day to count back from. That day itself is never included.
 * @param count - How many trading days to produce.
 * @returns `count` weekday sessions at midnight UTC, earliest first.
 */
export function sessions_before(day: Date, count: number): Date[] {
  const sessions: Date[] = [];
  const cursor = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));

  while (sessions.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const weekday = cursor.getUTCDay();

    if (weekday !== 0 && weekday !== 6) {
      sessions.unshift(new Date(cursor));
    }
  }

  return sessions;
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
 * Generates a realistic randomised trade population.
 *
 * Realism is the point rather than randomness: prices drift around each instrument's own level in
 * that instrument's own quote currency and are quoted to two decimal places as the screen shows
 * them, quantities are round lots skewed toward smaller tickets, sessions are weekdays only, and
 * roughly one trade in twenty is already cancelled so the status filter has something to find.
 *
 * @param count - How many trades to generate. The brief asks for 100 to 1,000.
 * @param seed - Fixed so a given count always produces the same trades.
 * @param today - The day the seed runs. Trades land in the five sessions before it.
 * @returns Trades ordered oldest first, ready for a bulk insert.
 */
export function generate_trades(count: number, seed = 20260818, today: Date = new Date()): GeneratedTrade[] {
  faker.seed(seed);

  const sessions = sessions_before(today, 5);

  const trades = Array.from({ length: count }, () => {
    const instrument = faker.helpers.arrayElement(instruments);
    const session = faker.helpers.arrayElement(sessions);

    const drift = faker.number.float({ min: -0.04, max: 0.04 });
    const price = instrument.base_price * (1 + drift);

    return {
      symbol: instrument.symbol,
      side: faker.helpers.arrayElement(trade_side_values),
      quantity: pick_quantity(),
      price: price.toFixed(2),
      currency: instrument.currency,
      trader: faker.helpers.arrayElement(traders),
      book: instrument.book,
      counterparty: faker.helpers.arrayElement(counterparties),
      tradeTimestamp: pick_session_time(session),
      status: faker.number.float({ min: 0, max: 1 }) < 0.05 ? 'CANCELLED' : 'ACTIVE',
    } satisfies GeneratedTrade;
  });

  return trades.sort((a, b) => a.tradeTimestamp.getTime() - b.tradeTimestamp.getTime());
}

/**
 * Generates one trade, timestamped now, in the shape the create endpoint accepts.
 *
 * This deliberately does not reseed faker. The startup seed wants a reproducible dataset so a
 * reviewer sees the same blotter twice, whereas a live feed that repeated itself every tick would
 * not look live. It draws from the same instrument universe as the seed, so the feed cannot
 * introduce a symbol the rest of the dataset has never heard of.
 *
 * Neither the currency nor the trader is on the payload: the server resolves the currency from the
 * instrument and takes the trader from whoever is booking, which is why the desk code comes back
 * alongside the payload rather than inside it.
 *
 * The price is quoted to two decimal places, which is how both USD and GBX names are quoted on
 * screen. A price like 443.497704 is one of the standard tells that a dataset was generated.
 *
 * @param instrument - What to trade. The live desk chooses it, so it can read that symbol's position first.
 * @param side - Which side to book. The live desk leans it against the symbol's net position.
 * @returns A create payload and the desk code to book it under.
 */
export function generate_live_trade(instrument: Instrument, side: TradeSide): GeneratedLiveTrade {
  const drift = faker.number.float({ min: -0.04, max: 0.04 });

  return {
    payload: {
      symbol: instrument.symbol,
      side,
      quantity: pick_quantity(),
      price: Number((instrument.base_price * (1 + drift)).toFixed(2)),
      book: instrument.book,
      counterparty: faker.helpers.arrayElement(counterparties),
      tradeTimestamp: new Date().toISOString(),
    },
    trader: faker.helpers.arrayElement(traders),
  };
}

/**
 * Produces the change an amendment should apply to an existing trade.
 *
 * Only quantity and price move, because those are the fields a desk actually corrects after
 * booking. Re-pointing a trade at a different symbol or counterparty would be a rebooking, not an
 * amendment, and the amendment schema refuses the first of those outright.
 *
 * @param current_price - The trade's present price, so the new one drifts from it rather than
 * jumping to an unrelated level.
 * @returns A partial amendment carrying quantity and a price quoted to two decimal places.
 */
export function generate_live_amendment(
  current_price: number,
): Pick<AmendableTrade, 'quantity' | 'price'> {
  const price_drift = faker.number.float({ min: -0.01, max: 0.01 });

  return {
    quantity: pick_quantity(),
    price: Number((current_price * (1 + price_drift)).toFixed(2)),
  };
}
