'use client';

import { useState, type ReactNode } from 'react';
import { Field, Input } from '@/components/ui/Field';
import {
  check_date_range,
  date_range_bounds,
  date_range_draft,
  type DateRange,
  type DateRangeDraft,
  type DateRangeEnd,
} from '@/lib/query/dateRange';

/** Props for {@link DateRangeFields}. */
export interface DateRangeFieldsProps {
  /** Prefix for the inputs' ids, unique per rail on the page. */
  id_prefix: string;
  /** The range in the URL. The inputs show it, and show it again whenever it changes from elsewhere. */
  range: DateRange;
  /** Receives a range that is safe to write: From on or before To, or an end left open. */
  onChange: (range: Record<DateRangeEnd, string | undefined>) => void;
}

/** A problem with the range, and the input it is shown under. */
interface RangeError {
  field: DateRangeEnd;
  message: string;
}

/**
 * The trade date From and To inputs.
 *
 * Each input keeps a draft. A From later than To stays in the input that was just edited, marked
 * invalid with the reason under it, and never reaches the URL, so the grid keeps the last valid
 * range. The picker greys out dates on the wrong side of the other end. When the range in the URL
 * changes from elsewhere, such as a removed chip, Clear or the back button, the drafts follow it.
 *
 * @param props - The id prefix, the range from the URL, and the writer for a valid range.
 * @returns The two fields.
 */
export function DateRangeFields({ id_prefix, range, onChange }: DateRangeFieldsProps): ReactNode {
  const [shown, setShown] = useState<DateRange>(range);
  const [draft, setDraft] = useState<DateRangeDraft>(() => date_range_draft(range));
  const [error, setError] = useState<RangeError | null>(null);

  if (shown.date_from !== range.date_from || shown.date_to !== range.date_to) {
    setShown(range);
    setDraft(date_range_draft(range, draft));
    setError(null);
  }

  const edit = (field: DateRangeEnd, value: string): void => {
    const next = { ...draft, [field]: value };
    const checked = check_date_range(next, field);
    setDraft(next);
    if (checked.valid) {
      setError(null);
      onChange(checked.range);
    } else {
      setError({ field: checked.field, message: checked.message });
    }
  };

  const { from_max, to_min } = date_range_bounds(draft);
  const from_id = `${id_prefix}date_from`;
  const to_id = `${id_prefix}date_to`;

  return (
    <>
      <Field id={from_id} label="Trade date from (UTC)" error={error?.field === 'date_from' ? error.message : undefined}>
        <Input
          id={from_id}
          type="datetime-local"
          step={1}
          max={from_max}
          value={draft.date_from}
          invalid={error?.field === 'date_from'}
          aria-describedby={`${from_id}_message`}
          onChange={(event) => edit('date_from', event.target.value)}
        />
      </Field>

      <Field id={to_id} label="Trade date to (UTC)" error={error?.field === 'date_to' ? error.message : undefined}>
        <Input
          id={to_id}
          type="datetime-local"
          step={1}
          min={to_min}
          value={draft.date_to}
          invalid={error?.field === 'date_to'}
          aria-describedby={`${to_id}_message`}
          onChange={(event) => edit('date_to', event.target.value)}
        />
      </Field>
    </>
  );
}
