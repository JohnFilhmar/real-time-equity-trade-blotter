import { from_datetime_local_value, to_datetime_local_value } from '@/lib/format/clock';
import { trade_list_query_schema, type FilterKey } from './tradeQuery';

/** One end of the blotter's trade-date range. */
export type DateRangeEnd = Extract<FilterKey, 'date_from' | 'date_to'>;

/** What the From and To inputs hold, in `datetime-local` form. An empty string leaves that end open. */
export type DateRangeDraft = Record<DateRangeEnd, string>;

/** A range as the URL and the API carry it: ISO timestamps, with an open end left out. */
export type DateRange = Partial<Record<DateRangeEnd, string>>;

/** The outcome of an edit: the range to write, or which input explains why it cannot be written. */
export type DateRangeCheck =
  | { valid: true; range: Record<DateRangeEnd, string | undefined> }
  | { valid: false; field: DateRangeEnd; message: string };

/**
 * Shown under To when an edit puts To before From. The From wording is the API's own, read from the
 * shared query schema, so the rail and a refused request never word the rule differently.
 */
const to_before_from_message = 'To must be on or after From';

/**
 * How long a reversed range must stand unchanged before its message shows, in milliseconds. Long
 * enough that retyping a year digit by digit says nothing, short enough that a real mistake is
 * explained moments after typing stops. Focus leaving the input shows the message at once.
 */
export const date_range_message_delay_ms = 1_000;

/**
 * Checks the range after one of its ends was edited, with the schema the API parses it with.
 *
 * @param draft - Both inputs' values after the edit.
 * @param edited - The end that was just changed. A problem is reported against it.
 * @returns The range as ISO timestamps when From is on or before To or either end is open;
 * otherwise the edited end and the message to show under it.
 */
export function check_date_range(draft: DateRangeDraft, edited: DateRangeEnd): DateRangeCheck {
  const range = {
    date_from: from_datetime_local_value(draft.date_from),
    date_to: from_datetime_local_value(draft.date_to),
  };
  const reversed = trade_list_query_schema
    .safeParse(range)
    .error?.issues.find((issue) => issue.code === 'custom' && issue.path[0] === 'date_from');

  if (reversed === undefined) {
    return { valid: true, range };
  }

  return {
    valid: false,
    field: edited,
    message: edited === 'date_from' ? reversed.message : to_before_from_message,
  };
}

/**
 * Brings an input's value to the seconds form the inputs step in.
 *
 * @param value - A `datetime-local` value, with or without seconds, or empty.
 * @returns The value to the second, or `undefined` when empty or unreadable.
 */
function to_bound(value: string): string | undefined {
  const iso = from_datetime_local_value(value);
  return iso === undefined ? undefined : to_datetime_local_value(new Date(iso));
}

/**
 * The limits the two inputs carry, so the picker greys out an end that would pass the other.
 *
 * @param draft - Both inputs' values.
 * @returns From's `max` and To's `min` as `datetime-local` values to the second, each `undefined`
 * while the other end is open.
 */
export function date_range_bounds(draft: DateRangeDraft): { from_max: string | undefined; to_min: string | undefined } {
  return { from_max: to_bound(draft.date_to), to_min: to_bound(draft.date_from) };
}

/**
 * The inputs' values for a range read from the URL.
 *
 * An input that already shows the same instant keeps its own text, so a range written from the
 * inputs and read back from the URL never rewrites the field someone is typing in.
 *
 * @param range - The range from the URL.
 * @param current - What the inputs hold now. Omit on first render.
 * @returns Both values to the second, with an open end as an empty string.
 */
export function date_range_draft(range: DateRange, current?: DateRangeDraft): DateRangeDraft {
  const value_for = (end: DateRangeEnd): string => {
    const iso = range[end];
    if (current !== undefined && from_datetime_local_value(current[end]) === iso) {
      return current[end];
    }
    return iso === undefined ? '' : to_datetime_local_value(new Date(iso));
  };

  return { date_from: value_for('date_from'), date_to: value_for('date_to') };
}
