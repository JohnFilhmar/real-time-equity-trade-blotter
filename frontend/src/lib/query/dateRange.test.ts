import { describe, expect, it } from 'vitest';
import { check_date_range, date_range_bounds, date_range_draft } from './dateRange';

const nine = '2026-08-18T09:00:00';
const noon = '2026-08-18T12:00:00';

describe('check_date_range', () => {
  it('passes an ordered range on as timestamps', () => {
    expect(check_date_range({ date_from: nine, date_to: noon }, 'date_to')).toEqual({
      valid: true,
      range: { date_from: '2026-08-18T09:00:00.000Z', date_to: '2026-08-18T12:00:00.000Z' },
    });
  });

  it('accepts ends that are the same instant', () => {
    expect(check_date_range({ date_from: nine, date_to: nine }, 'date_from').valid).toBe(true);
  });

  it('leaves an empty end open', () => {
    expect(check_date_range({ date_from: '', date_to: noon }, 'date_from')).toEqual({
      valid: true,
      range: { date_from: undefined, date_to: '2026-08-18T12:00:00.000Z' },
    });
  });

  it('puts the reason under From when an edit to From passes To', () => {
    expect(check_date_range({ date_from: noon, date_to: nine }, 'date_from')).toEqual({
      valid: false,
      field: 'date_from',
      message: 'From must be on or before To',
    });
  });

  it('puts the reason under To when an edit to To falls before From', () => {
    expect(check_date_range({ date_from: noon, date_to: nine }, 'date_to')).toEqual({
      valid: false,
      field: 'date_to',
      message: 'To must be on or after From',
    });
  });

  it('compares to the second, the step the inputs use', () => {
    expect(check_date_range({ date_from: '2026-08-18T09:00:01', date_to: nine }, 'date_from').valid).toBe(false);
  });

  it('reads a value without seconds, as browsers write the top of a minute', () => {
    expect(check_date_range({ date_from: '2026-08-18T09:00', date_to: nine }, 'date_to').valid).toBe(true);
  });
});

describe('date_range_bounds', () => {
  it('caps From at To and starts To at From, to the second', () => {
    expect(date_range_bounds({ date_from: '2026-08-18T09:00', date_to: noon })).toEqual({
      from_max: noon,
      to_min: nine,
    });
  });

  it('sets no bound against an open end', () => {
    expect(date_range_bounds({ date_from: '', date_to: '' })).toEqual({ from_max: undefined, to_min: undefined });
  });
});

describe('date_range_draft', () => {
  it('shows the range from the URL to the second, and an unset end as empty', () => {
    expect(date_range_draft({ date_from: '2026-08-18T09:00:00.000Z' })).toEqual({ date_from: nine, date_to: '' });
  });

  it('keeps what an input already holds when it is the same instant', () => {
    expect(
      date_range_draft({ date_from: '2026-08-18T09:00:00.000Z' }, { date_from: '2026-08-18T09:00', date_to: noon }),
    ).toEqual({ date_from: '2026-08-18T09:00', date_to: '' });
  });
});
