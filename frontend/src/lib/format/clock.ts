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
 * Formats a UTC date as the `datetime-local` input value for the same instant.
 *
 * @param date - The instant to show.
 * @returns `YYYY-MM-DDTHH:MM` in UTC.
 */
export function to_datetime_local_value(date: Date): string {
  return date.toISOString().slice(0, 16);
}

/**
 * Reads a `datetime-local` input value as UTC.
 *
 * The control has no time zone, so the value is interpreted as UTC to match how every other time
 * on the blotter is shown.
 *
 * @param value - The input's value, `YYYY-MM-DDTHH:MM`.
 * @returns An ISO timestamp, or `undefined` when the value is empty or malformed.
 */
export function from_datetime_local_value(value: string): string | undefined {
  if (value.length === 0) {
    return undefined;
  }

  const time = Date.parse(`${value}:00.000Z`);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}
