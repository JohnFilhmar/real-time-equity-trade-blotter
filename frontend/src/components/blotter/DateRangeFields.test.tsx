import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { from_datetime_local_value } from '@/lib/format/clock';
import type { DateRange } from '@/lib/query/dateRange';
import { DateRangeFields } from './DateRangeFields';

const nine = '2026-08-18T09:00:05.000Z';
const noon = '2026-08-18T12:00:05.000Z';

// Vitest globals are off here, so Testing Library cannot register its own cleanup between tests.
afterEach(() => {
  cleanup();
});

/**
 * Renders the two fields over a range, as the rail does.
 *
 * @param range - The range in the URL.
 * @returns The change spy, a rerender with a new range, and both inputs.
 */
function render_fields(range: DateRange) {
  const on_change = vi.fn();
  const view = render(<DateRangeFields id_prefix="test_" range={range} onChange={on_change} />);
  return {
    on_change,
    rerender: (next: DateRange) => view.rerender(<DateRangeFields id_prefix="test_" range={next} onChange={on_change} />),
    from: screen.getByLabelText<HTMLInputElement>('Trade date from (UTC)'),
    to: screen.getByLabelText<HTMLInputElement>('Trade date to (UTC)'),
  };
}

describe('DateRangeFields', () => {
  it('shows the range from the URL, each end limiting the other', () => {
    const { from, to } = render_fields({ date_from: nine, date_to: noon });

    expect(from_datetime_local_value(from.value)).toBe(nine);
    expect(from_datetime_local_value(to.value)).toBe(noon);
    expect(from).toHaveAttribute('max', '2026-08-18T12:00:05');
    expect(to).toHaveAttribute('min', '2026-08-18T09:00:05');
  });

  it('keeps a To earlier than From in its input, says why under it, and writes nothing', () => {
    const { from, to, on_change } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(to, { target: { value: '2026-08-18T08:00:05' } });

    expect(from_datetime_local_value(to.value)).toBe('2026-08-18T08:00:05.000Z');
    expect(to).toHaveAttribute('aria-invalid', 'true');
    expect(from).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('To must be on or after From')).toHaveAttribute('id', 'test_date_to_message');
    expect(on_change).not.toHaveBeenCalled();
  });

  it('words the problem for From when From is the end that was moved past To', () => {
    const { from, on_change } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(from, { target: { value: '2026-08-18T13:00:05' } });

    expect(from).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('From must be on or before To')).toHaveAttribute('id', 'test_date_from_message');
    expect(on_change).not.toHaveBeenCalled();
  });

  it('writes both ends once an edit to the other end makes the pair valid', () => {
    const { from, to, on_change } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(to, { target: { value: '2026-08-18T08:00:05' } });
    fireEvent.change(from, { target: { value: '2026-08-18T07:00:05' } });

    expect(on_change).toHaveBeenCalledTimes(1);
    expect(on_change).toHaveBeenCalledWith({
      date_from: '2026-08-18T07:00:05.000Z',
      date_to: '2026-08-18T08:00:05.000Z',
    });
    expect(to).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('To must be on or after From')).toBeNull();
  });

  it('accepts a To equal to From', () => {
    const { to, on_change } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(to, { target: { value: '2026-08-18T09:00:05' } });

    expect(on_change).toHaveBeenCalledWith({ date_from: nine, date_to: nine });
  });

  it('follows the URL when the range changes from elsewhere, dropping a rejected draft', () => {
    const { to, rerender } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(to, { target: { value: '2026-08-18T08:00:05' } });
    rerender({ date_from: nine });

    expect(to.value).toBe('');
    expect(to).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('To must be on or after From')).toBeNull();
  });
});
