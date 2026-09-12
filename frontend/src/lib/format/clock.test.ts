import { describe, expect, it } from 'vitest';
import {
  format_clock,
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
  it('reads the input as UTC and writes it back the same way', () => {
    const iso = '2026-08-18T09:15:00.000Z';
    const value = to_datetime_local_value(new Date(iso));
    expect(value).toBe('2026-08-18T09:15');
    expect(from_datetime_local_value(value)).toBe(iso);
  });

  it('treats an empty input as no filter', () => {
    expect(from_datetime_local_value('')).toBeUndefined();
  });
});
