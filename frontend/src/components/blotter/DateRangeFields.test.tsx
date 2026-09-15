import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { from_datetime_local_value } from '@/lib/format/clock';
import { date_range_message_delay_ms, type DateRange } from '@/lib/query/dateRange';
import { DateRangeFields } from './DateRangeFields';

const nine = '2026-08-18T09:00:05.000Z';
const noon = '2026-08-18T12:00:05.000Z';

beforeEach(() => {
  vi.useFakeTimers();
});

// Vitest globals are off here, so Testing Library cannot register its own cleanup between tests.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * Renders the two fields over a range, as the rail does.
 *
 * @param range - The range in the URL.
 * @returns The change spy, a rerender with a new range, unmount, and both inputs.
 */
function render_fields(range: DateRange) {
  const on_change = vi.fn();
  const view = render(<DateRangeFields id_prefix="test_" range={range} onChange={on_change} />);
  return {
    on_change,
    rerender: (next: DateRange) => view.rerender(<DateRangeFields id_prefix="test_" range={next} onChange={on_change} />),
    unmount: view.unmount,
    from: screen.getByLabelText<HTMLInputElement>('Trade date from (UTC)'),
    to: screen.getByLabelText<HTMLInputElement>('Trade date to (UTC)'),
  };
}

/**
 * Lets the fake clock run on, as it does while a trader pauses.
 *
 * @param ms - How long to wait.
 */
function wait(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('DateRangeFields', () => {
  it('shows the range from the URL, each end limiting the other', () => {
    const { from, to } = render_fields({ date_from: nine, date_to: noon });

    expect(from_datetime_local_value(from.value)).toBe(nine);
    expect(from_datetime_local_value(to.value)).toBe(noon);
    expect(from).toHaveAttribute('max', '2026-08-18T12:00:05');
    expect(to).toHaveAttribute('min', '2026-08-18T09:00:05');
  });

  it('keeps a To earlier than From in its input, says why under it once typing pauses, and writes nothing', () => {
    const { from, to, on_change } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(to, { target: { value: '2026-08-18T08:00:05' } });
    wait(date_range_message_delay_ms);

    expect(from_datetime_local_value(to.value)).toBe('2026-08-18T08:00:05.000Z');
    expect(to).toHaveAttribute('aria-invalid', 'true');
    expect(from).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('To must be on or after From')).toHaveAttribute('id', 'test_date_to_message');
    expect(on_change).not.toHaveBeenCalled();
  });

  it('words the problem for From when From is the end that was moved past To', () => {
    const { from, on_change } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(from, { target: { value: '2026-08-18T13:00:05' } });
    wait(date_range_message_delay_ms);

    expect(from).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('From must be on or before To')).toHaveAttribute('id', 'test_date_from_message');
    expect(on_change).not.toHaveBeenCalled();
  });

  it('says nothing while a year is retyped digit by digit, and writes only the finished range', () => {
    const { to, on_change } = render_fields({ date_from: nine, date_to: noon });

    for (const value of ['0002-08-18T12:00:05', '0020-08-18T12:00:05', '0202-08-18T12:00:05']) {
      fireEvent.change(to, { target: { value } });
      wait(300);

      expect(to).not.toHaveAttribute('aria-invalid');
      expect(screen.queryByText('To must be on or after From')).toBeNull();
    }
    expect(on_change).not.toHaveBeenCalled();

    fireEvent.change(to, { target: { value: '2026-08-18T12:00:05' } });
    wait(date_range_message_delay_ms);

    expect(screen.queryByText('To must be on or after From')).toBeNull();
    expect(on_change).toHaveBeenCalledTimes(1);
    expect(on_change).toHaveBeenCalledWith({ date_from: nine, date_to: noon });
  });

  it('explains a reversed range once the box has held it for a second', () => {
    const { to } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(to, { target: { value: '2026-08-18T08:00:05' } });
    wait(date_range_message_delay_ms - 1);

    expect(to).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('To must be on or after From')).toBeNull();

    wait(1);

    expect(to).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('To must be on or after From')).toBeInTheDocument();
  });

  it('explains a reversed range at once when focus leaves the box', () => {
    const { to } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(to, { target: { value: '2026-08-18T08:00:05' } });
    fireEvent.blur(to);

    expect(to).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('To must be on or after From')).toBeInTheDocument();
  });

  it('keeps a shown explanation through edits that leave the range reversed, without waiting again', () => {
    const { to, on_change } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(to, { target: { value: '2026-08-18T08:00:05' } });
    wait(date_range_message_delay_ms);

    for (const value of ['2026-08-18T07:00:05', '2026-08-18T06:00:05', '2026-08-18T08:59:05']) {
      fireEvent.change(to, { target: { value } });

      expect(to).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText('To must be on or after From')).toBeInTheDocument();

      wait(300);
    }
    expect(on_change).not.toHaveBeenCalled();
  });

  it('clears a shown explanation the moment the pair is valid, and waits again before explaining the next reversal', () => {
    const { to, on_change } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(to, { target: { value: '2026-08-18T08:00:05' } });
    wait(date_range_message_delay_ms);
    fireEvent.change(to, { target: { value: '2026-08-18T07:00:05' } });
    fireEvent.change(to, { target: { value: '2026-08-18T10:00:05' } });

    expect(to).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('To must be on or after From')).toBeNull();
    expect(on_change).toHaveBeenCalledTimes(1);
    expect(on_change).toHaveBeenCalledWith({ date_from: nine, date_to: '2026-08-18T10:00:05.000Z' });

    fireEvent.change(to, { target: { value: '2026-08-18T08:30:05' } });

    expect(to).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('To must be on or after From')).toBeNull();
  });

  it('clears a shown explanation the moment either end is cleared, and writes the open range', () => {
    const { from, to, on_change } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(to, { target: { value: '2026-08-18T08:00:05' } });
    wait(date_range_message_delay_ms);
    fireEvent.change(from, { target: { value: '' } });

    expect(to).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('To must be on or after From')).toBeNull();
    expect(on_change).toHaveBeenCalledWith({ date_from: undefined, date_to: '2026-08-18T08:00:05.000Z' });
  });

  it('clears the explanation the moment an edit to the other end makes the pair valid, and writes both ends', () => {
    const { from, to, on_change } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(to, { target: { value: '2026-08-18T08:00:05' } });
    wait(date_range_message_delay_ms);
    fireEvent.change(from, { target: { value: '2026-08-18T07:00:05' } });

    expect(to).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('To must be on or after From')).toBeNull();
    expect(on_change).toHaveBeenCalledTimes(1);
    expect(on_change).toHaveBeenCalledWith({
      date_from: '2026-08-18T07:00:05.000Z',
      date_to: '2026-08-18T08:00:05.000Z',
    });
  });

  it('accepts a To equal to From', () => {
    const { to, on_change } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(to, { target: { value: '2026-08-18T09:00:05' } });

    expect(on_change).toHaveBeenCalledWith({ date_from: nine, date_to: nine });
  });

  it('follows the URL when the range changes from elsewhere, dropping a rejected draft', () => {
    const { to, rerender } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(to, { target: { value: '2026-08-18T08:00:05' } });
    wait(date_range_message_delay_ms);
    rerender({ date_from: nine });

    expect(to.value).toBe('');
    expect(to).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('To must be on or after From')).toBeNull();
  });

  it('leaves no explanation waiting once the fields unmount', () => {
    const { to, unmount } = render_fields({ date_from: nine, date_to: noon });

    fireEvent.change(to, { target: { value: '2026-08-18T08:00:05' } });
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
