import { describe, expect, it } from 'vitest';
import {
  format_clock,
  format_clock_or_date,
  format_date_time,
  from_datetime_local_value,
  to_datetime_local_value,
} from './clock';

describe('format_clock', () => {
  it('shows the UTC wall clock', () => {
    expect(format_clock('2026-08-18T09:15:23.456Z')).toBe('09:15:23');
  });

  it('falls back to a placeholder for garbage', () => {
    expect(format_clock('not a date')).toBe('–');
  });
});

describe('format_date_time', () => {
  it('drops milliseconds and keeps the zone marker', () => {
    expect(format_date_time('2026-08-18T09:15:23.456Z')).toBe('2026-08-18 09:15:23Z');
  });
});

describe('datetime-local round trip', () => {
  it('reads the input as UTC and writes it back to the second', () => {
    const iso = '2026-08-18T09:15:23.000Z';
    const value = to_datetime_local_value(new Date(iso));
    expect(value).toBe('2026-08-18T09:15:23');
    expect(from_datetime_local_value(value)).toBe(iso);
  });

  it('accepts a value without seconds, as browsers emit at the top of a minute', () => {
    expect(from_datetime_local_value('2026-08-18T09:15')).toBe('2026-08-18T09:15:00.000Z');
  });

  it('treats an empty input as no filter', () => {
    expect(from_datetime_local_value('')).toBeUndefined();
  });
});

describe('format_clock_or_date', () => {
  const now = new Date('2026-09-13T15:20:00.000Z');

  it('shows only the time for a timestamp from today', () => {
    expect(format_clock_or_date('2026-09-13T09:15:23.456Z', now)).toBe('09:15:23');
  });

  it('prefixes the day and month for a timestamp from another day', () => {
    expect(format_clock_or_date('2026-08-18T09:15:23.456Z', now)).toBe('18 Aug 09:15:23');
  });

  it("compares calendar days in UTC, not in the viewer's zone", () => {
    expect(format_clock_or_date('2026-09-12T23:59:59.000Z', now)).toBe('12 Sep 23:59:59');
  });

  it('falls back to a placeholder for garbage', () => {
    expect(format_clock_or_date('not a date', now)).toBe('–');
  });
});
