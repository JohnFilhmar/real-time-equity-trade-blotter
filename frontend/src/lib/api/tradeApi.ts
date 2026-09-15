import { z } from 'zod';
import {
  trade_event_schema,
  trade_list_schema,
  trade_schema,
  type AmendTrade,
  type CancelTrade,
  type CreateTrade,
  type Trade,
  type TradeEvent,
  type TradeList,
} from '@blotter/shared';
import { to_search_params, type TradeListQuery } from '@/lib/query/tradeQuery';
import { api_json } from './http';

const prefix = '/api/v1/trades';

/** One page request: the list query plus where the page starts. */
export interface TradePageRequest {
  query: TradeListQuery;
  limit: number;
  cursor?: string | undefined;
}

/**
 * Reads one page of the blotter.
 *
 * @param token - The access token.
 * @param request - Filters, sort, page size and cursor.
 * @param signal - Aborts the request when the query is cancelled.
 * @returns The page envelope.
 */
export function list_trades(
  token: string,
  request: TradePageRequest,
  signal?: AbortSignal,
): Promise<TradeList> {
  const params = to_search_params(request.query);
  params.set('limit', request.limit.toString());

  if (request.cursor !== undefined) {
    params.set('cursor', request.cursor);
  }

  return api_json(`${prefix}?${params.toString()}`, trade_list_schema, {
    token,
    ...(signal === undefined ? {} : { signal }),
  });
}

/**
 * Reads one trade.
 *
 * @param token - The access token.
 * @param trade_id - The business identifier, `TRD-100001`.
 * @returns The trade.
 * @throws {ApiError} 404 when it does not exist.
 */
export function get_trade(token: string, trade_id: string): Promise<Trade> {
  return api_json(`${prefix}/${encodeURIComponent(trade_id)}`, trade_schema, { token });
}

/**
 * Reads a trade's history, oldest first.
 *
 * @param token - The access token.
 * @param trade_id - The business identifier.
 * @returns The events. Empty when the trade has never changed.
 */
export function list_trade_events(token: string, trade_id: string): Promise<TradeEvent[]> {
  return api_json(`${prefix}/${encodeURIComponent(trade_id)}/events`, z.array(trade_event_schema), {
    token,
  });
}

/**
 * Books a trade. The trader is taken from the token by the server.
 *
 * @param token - The access token.
 * @param input - The validated ticket.
 * @returns The stored trade.
 * @throws {ApiError} 422 with field errors when validation or the notional limit refuses it.
 */
export function create_trade(token: string, input: CreateTrade): Promise<Trade> {
  return api_json(prefix, trade_schema, { method: 'POST', body: input, token });
}

/**
 * Amends a trade, echoing back the version last seen.
 *
 * @param token - The access token.
 * @param trade_id - The business identifier.
 * @param input - The changed fields plus `version`.
 * @returns The amended trade, one version higher.
 * @throws {ApiError} 409 when the trade has moved on, 403 when it belongs to someone else.
 */
export function amend_trade(token: string, trade_id: string, input: AmendTrade): Promise<Trade> {
  return api_json(`${prefix}/${encodeURIComponent(trade_id)}`, trade_schema, {
    method: 'PATCH',
    body: input,
    token,
  });
}

/**
 * Cancels a trade.
 *
 * @param token - The access token.
 * @param trade_id - The business identifier.
 * @param input - The optional version guard.
 * @returns The cancelled trade.
 * @throws {ApiError} 409 when already cancelled or moved on, 403 when it belongs to someone else.
 */
export function cancel_trade(token: string, trade_id: string, input: CancelTrade): Promise<Trade> {
  return api_json(`${prefix}/${encodeURIComponent(trade_id)}/cancel`, trade_schema, {
    method: 'POST',
    body: input,
    token,
  });
}
