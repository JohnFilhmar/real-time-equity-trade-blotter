import { trade_query_schema } from '@blotter/shared';
import type { z } from 'zod';

/**
 * The part of the blotter query the user controls: filters and sort, without the page window.
 *
 * Derived from the canonical query schema so a filter added to the API reaches the interface
 * without a second declaration. Lives in the URL, so a filtered view is linkable and survives a
 * reload.
 */
export const trade_list_query_schema = trade_query_schema.omit({ limit: true, cursor: true });

/** Filters and sort for the blotter list. */
export type TradeListQuery = z.infer<typeof trade_list_query_schema>;

/** The default view: everything, newest first. */
export const default_trade_list_query: TradeListQuery = trade_list_query_schema.parse({});

/** The filter keys the rail and the chips work with, in display order. */
export const filter_keys = [
  'symbol',
  'side',
  'status',
  'trader',
  'book',
  'counterparty',
  'date_from',
  'date_to',
] as const;

/** One of the filterable keys. */
export type FilterKey = (typeof filter_keys)[number];

/**
 * Reads the list query out of URL search parameters.
 *
 * Unknown keys are ignored and a malformed value drops back to the default for that key rather
 * than failing the whole page, so a hand-edited link still opens the blotter.
 *
 * @param params - The page's search parameters.
 * @returns The parsed query.
 */
export function parse_search_params(params: URLSearchParams): TradeListQuery {
  const candidate: Record<string, string> = {};

  for (const key of [...filter_keys, 'sort_by', 'sort_dir'] as const) {
    const value = params.get(key);
    if (value !== null && value.length > 0) {
      candidate[key] = value;
    }
  }

  const parsed = trade_list_query_schema.safeParse(candidate);

  if (parsed.success) {
    return parsed.data;
  }

  // Drop only the offending keys, keep the rest.
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string') {
      delete candidate[key];
    }
  }

  return trade_list_query_schema.parse(candidate);
}

/**
 * Writes a list query as URL search parameters, omitting defaults so the URL stays short.
 *
 * @param query - The query to encode.
 * @returns Parameters ready for the address bar or a request.
 */
export function to_search_params(query: TradeListQuery): URLSearchParams {
  const params = new URLSearchParams();

  for (const key of filter_keys) {
    const value = query[key];
    if (value !== undefined && value.length > 0) {
      params.set(key, value);
    }
  }

  if (query.sort_by !== default_trade_list_query.sort_by) {
    params.set('sort_by', query.sort_by);
  }

  if (query.sort_dir !== default_trade_list_query.sort_dir) {
    params.set('sort_dir', query.sort_dir);
  }

  return params;
}

/**
 * Counts the filters that are set, ignoring sort.
 *
 * @param query - The query.
 * @returns How many of the filter keys carry a value.
 */
export function active_filter_count(query: TradeListQuery): number {
  return filter_keys.filter((key) => query[key] !== undefined && query[key].length > 0).length;
}
