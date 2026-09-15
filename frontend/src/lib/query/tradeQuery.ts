import { trade_query_schema } from '@blotter/shared';
import { z } from 'zod';

/**
 * The canonical query's fields without the page window, which is what the URL holds.
 *
 * Built from the shared schema's own field definitions rather than restating them. zod cannot
 * `.omit()` from a schema that carries a cross-field check, so the fields are taken from `.shape`.
 */
const list_fields_schema = z.object(trade_query_schema.shape).omit({ limit: true, cursor: true });

/**
 * The part of the blotter query the user controls: filters and sort, without the page window.
 *
 * Parsed by the canonical query schema first, so a From later than To is refused here exactly as the
 * API refuses it, then narrowed to the list fields. A filter added to the API reaches the interface
 * without a second declaration. Lives in the URL, so a filtered view is linkable and survives a
 * reload.
 */
export const trade_list_query_schema = trade_query_schema.transform((query) => list_fields_schema.parse(query));

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
 * Reads the list query out of URL search parameters, dropping bad keys pass by pass until the rest parse.
 *
 * Unknown keys are ignored and a malformed value drops back to the default for that key rather
 * than failing the whole page, so a hand-edited link still opens the blotter. A From later than To
 * drops the From. zod runs the range check only once every field parses, so dropping one bad key
 * can uncover the reversed range on the next pass.
 *
 * @param params - The page's search parameters.
 * @returns The parsed query. Falls back to the default view if a failure names no key it can drop.
 */
export function parse_search_params(params: URLSearchParams): TradeListQuery {
  const candidate: Record<string, string> = {};

  for (const key of [...filter_keys, 'sort_by', 'sort_dir'] as const) {
    const value = params.get(key);
    if (value !== null && value.length > 0) {
      candidate[key] = value;
    }
  }

  let parsed = trade_list_query_schema.safeParse(candidate);

  while (!parsed.success) {
    let dropped = false;
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && key in candidate) {
        delete candidate[key];
        dropped = true;
      }
    }
    if (!dropped) {
      return default_trade_list_query;
    }
    parsed = trade_list_query_schema.safeParse(candidate);
  }

  return parsed.data;
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
