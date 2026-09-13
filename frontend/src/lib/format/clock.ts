/**
 * Formats an ISO timestamp as a UTC wall-clock time, `09:15:23`.
 *
 * A blotter reads execution time against the trading session, and the session runs on the venue's
 * clock rather than the viewer's, so the time is shown in UTC and labelled as such by the column
 * header.
 *
 * @param iso - An ISO 8601 timestamp.
 * @returns `HH:MM:SS` in UTC, or an em-dash placeholder when the value does not parse.
 */
export function format_clock(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? '–' : new Date(time).toISOString().slice(11, 19);
}

/**
 * Formats an ISO timestamp as a UTC date and time, `2026-08-18 09:15:23Z`.
 *
 * @param iso - An ISO 8601 timestamp.
 * @returns The date and time without milliseconds, or a placeholder when the value does not parse.
 */
export function format_date_time(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time)
    ? '–'
    : new Date(time).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Formats a UTC date as the `datetime-local` input value for the same instant, to the second.
 *
 * Seconds are kept because a trade's execution time is what the blotter sorts on: a ticket that
 * defaulted to the top of the minute would file a new trade below ones executed later in that
 * minute.
 *
 * @param date - The instant to show.
 * @returns `YYYY-MM-DDTHH:MM:SS` in UTC.
 */
export function to_datetime_local_value(date: Date): string {
  return date.toISOString().slice(0, 19);
}

/**
 * Reads a `datetime-local` input value as UTC.
 *
 * The control has no time zone, so the value is interpreted as UTC to match how every other time
 * on the blotter is shown. Browsers omit the seconds when they are zero, so both forms parse.
 *
 * @param value - The input's value, `YYYY-MM-DDTHH:MM` or `YYYY-MM-DDTHH:MM:SS`.
 * @returns An ISO timestamp, or `undefined` when the value is empty or malformed.
 */
export function from_datetime_local_value(value: string): string | undefined {
  if (value.length === 0) {
    return undefined;
  }

  const with_seconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  const time = Date.parse(`${with_seconds}Z`);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

const month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats an ISO timestamp as the UTC wall-clock time when it falls on today's UTC date, and as
 * `18 Aug 09:15:23` otherwise.
 *
 * The rows span several sessions: the seed carries earlier days while the feed books today, and
 * rows from different days sorted together would otherwise show identical-looking times. The full
 * date stays in the detail drawer, so the column adds only what tells the days apart.
 *
 * @param iso - An ISO 8601 timestamp.
 * @param now - The instant that defines today, compared on its UTC date. Defaults to the current time.
 * @returns `HH:MM:SS` for today, `D Mon HH:MM:SS` for any other day, or a placeholder when the
 * value does not parse.
 */
export function format_clock_or_date(iso: string, now: Date = new Date()): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return '–';
  }
  const at = new Date(time);
  const clock = at.toISOString().slice(11, 19);
  if (at.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) {
    return clock;
  }
  return `${at.getUTCDate().toString()} ${month_names[at.getUTCMonth()]} ${clock}`;
}
