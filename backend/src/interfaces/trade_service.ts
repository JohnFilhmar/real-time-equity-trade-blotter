import type {
  AmendTrade,
  CreateTrade,
  Position,
  Role,
  Trade,
  TradeEvent,
  TradeEventList,
  TradeEventQuery,
  TradeEventSource,
  TradeList,
  TradeQuery,
} from '@blotter/shared';

/**
 * Who is making a change, and through which path.
 *
 * Carried as a parameter rather than read from ambient state, so the service has no idea Express
 * exists and the simulated feed is an ordinary caller rather than a special case.
 */
export interface TradeActor {
  /** The desk code the change is attributed to, and the one ownership is judged against. */
  trader_code: string;

  /** The role, used for the permission checks that depend on whose trade it is. */
  role: Role;

  /** Which path the change arrived through. */
  source: TradeEventSource;
}

/**
 * The blotter's business rules: what a trade may become, who may change it, and who is told.
 *
 * Everything that writes a trade goes through here, the HTTP routes and the live feed alike, so
 * the status transitions, the concurrency check, the pre-trade limits, the ownership rules and the
 * broadcast exist in exactly one place.
 */
export interface TradeService {
  /**
   * Reads a filtered, sorted page of the blotter.
   *
   * @param query - Already parsed by `trade_query_schema`.
   * @returns The page, with the unpaged total and the cursor for the next one.
   */
  list(query: TradeQuery): Promise<TradeList>;

  /**
   * Reads one trade.
   *
   * @param trade_id - The business identifier, `TRD-100001`.
   * @returns The trade.
   * @throws {AppError} 404 when no such trade exists.
   */
  get(trade_id: string): Promise<Trade>;

  /**
   * Books a new trade and announces it.
   *
   * @param input - A validated create payload.
   * @param actor - Who is booking. The trade's trader comes from here, not from the payload.
   * @returns The stored trade.
   * @throws {AppError} 422 when the notional exceeds the desk limit for its currency.
   */
  create(input: CreateTrade, actor: TradeActor): Promise<Trade>;

  /**
   * Amends an active trade, provided the client's version is still current.
   *
   * @param trade_id - The trade to amend.
   * @param input - Validated changes, carrying the version the client last saw.
   * @param actor - Who is amending.
   * @returns The amended trade, one version higher.
   * @throws {AppError} 422 when no field was supplied or the resulting notional breaches the
   * limit, 403 when amending someone else's trade without the permission for it, 404 when the
   * trade is missing, 409 when it is cancelled or has already moved on.
   */
  amend(trade_id: string, input: AmendTrade, actor: TradeActor): Promise<Trade>;

  /**
   * Cancels an active trade.
   *
   * @param trade_id - The trade to cancel.
   * @param expected_version - Optional version guard from the client.
   * @param actor - Who is cancelling.
   * @returns The cancelled trade.
   * @throws {AppError} 403 when cancelling someone else's trade without the permission for it,
   * 404 when the trade is missing, 409 when it is already cancelled or has moved on.
   */
  cancel(
    trade_id: string,
    expected_version: number | undefined,
    actor: TradeActor,
  ): Promise<Trade>;

  /**
   * Reads the history of one trade, oldest first.
   *
   * @param trade_id - The trade whose history to read.
   * @returns The events, empty when the trade has never changed.
   * @throws {AppError} 404 when the trade itself does not exist, so an empty array always means
   * "never changed" rather than "no such trade".
   */
  list_events(trade_id: string): Promise<TradeEvent[]>;

  /**
   * Reads a page of every trade's history, newest first.
   *
   * @param query - Already parsed by `trade_event_query_schema`.
   * @returns The page, with the count of every event and the cursor for the next page.
   */
  list_all_events(query: TradeEventQuery): Promise<TradeEventList>;

  /**
   * Reads the net position in every instrument that has at least one active trade.
   *
   * @returns Positions sorted by symbol. Empty when the blotter holds no active trades.
   */
  list_positions(): Promise<Position[]>;
}
