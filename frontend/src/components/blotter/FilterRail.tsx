'use client';

import type { ReactNode } from 'react';
import { instruments } from '@blotter/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';
import { from_datetime_local_value, to_datetime_local_value } from '@/lib/format/clock';
import { active_filter_count, type TradeListQuery } from '@/lib/query/trade_query';

/** Props for {@link FilterRail}. */
export interface FilterRailProps {
  query: TradeListQuery;
  onChange: (patch: Partial<TradeListQuery>) => void;
  onClear: () => void;
  /** Loaded rows and server total, for the count line. */
  loaded: number;
  total: number;
  /** Rendered only for a role that can book; `null` hides the button entirely. */
  book_button: ReactNode;
}

/**
 * Turns a `datetime-local` value into the query's ISO form, or clears the key when empty.
 *
 * @param value - The input value.
 * @returns The ISO timestamp, or `undefined`.
 */
function iso_or_clear(value: string): string | undefined {
  return from_datetime_local_value(value);
}

/**
 * The left-hand filter rail: symbol, side, status, trader, book, counterparty and the trade date
 * range. Every filter writes straight to the URL, so the blotter is linkable in any filtered state.
 *
 * @param props - The query, its setters, the counts, and the book button.
 * @returns The rail.
 */
export function FilterRail({ query, onChange, onClear, loaded, total, book_button }: FilterRailProps): ReactNode {
  const active = active_filter_count(query);

  return (
    <aside className="flex w-[216px] shrink-0 flex-col gap-[15px] overflow-y-auto border-r border-rule bg-glass-soft p-[14px]" aria-label="Filters">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9.5px] uppercase tracking-[.12em] text-faint">Filters</span>
        {active > 0 ? (
          <button type="button" onClick={onClear} className="text-[11px] font-medium text-brand hover:text-brand-lo hover:underline">
            Clear {active.toString()}
          </button>
        ) : null}
      </div>

      <Field id="f_symbol" label="Symbol">
        <Select id="f_symbol" value={query.symbol ?? ''} onChange={(event) => onChange({ symbol: event.target.value || undefined })}>
          <option value="">All</option>
          {instruments.map((instrument) => (
            <option key={instrument.symbol} value={instrument.symbol}>
              {instrument.symbol}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex flex-col gap-[5px]">
        <span className="font-mono text-[9.5px] uppercase tracking-[.11em] text-faint">Side</span>
        <div className="grid grid-cols-2 gap-[6px]">
          <Toggle tone="gain" pressed={query.side === 'BUY'} onToggle={() => onChange({ side: query.side === 'BUY' ? undefined : 'BUY' })}>
            BUY
          </Toggle>
          <Toggle tone="loss" pressed={query.side === 'SELL'} onToggle={() => onChange({ side: query.side === 'SELL' ? undefined : 'SELL' })}>
            SELL
          </Toggle>
        </div>
      </div>

      <div className="flex flex-col gap-[5px]">
        <span className="font-mono text-[9.5px] uppercase tracking-[.11em] text-faint">Status</span>
        <div className="grid grid-cols-2 gap-[6px]">
          <Toggle pressed={query.status === 'ACTIVE'} onToggle={() => onChange({ status: query.status === 'ACTIVE' ? undefined : 'ACTIVE' })}>
            ACTIVE
          </Toggle>
          <Toggle
            pressed={query.status === 'CANCELLED'}
            label="Cancelled"
            onToggle={() => onChange({ status: query.status === 'CANCELLED' ? undefined : 'CANCELLED' })}
          >
            CANC
          </Toggle>
        </div>
      </div>

      <Field id="f_trader" label="Trader">
        <Input id="f_trader" placeholder="JSMITH" value={query.trader ?? ''} onChange={(event) => onChange({ trader: event.target.value || undefined })} />
      </Field>

      <Field id="f_book" label="Book">
        <Input id="f_book" placeholder="EQUITIES" value={query.book ?? ''} onChange={(event) => onChange({ book: event.target.value || undefined })} />
      </Field>

      <Field id="f_cpty" label="Counterparty">
        <Input id="f_cpty" placeholder="Goldman" value={query.counterparty ?? ''} onChange={(event) => onChange({ counterparty: event.target.value || undefined })} />
      </Field>

      <Field id="f_from" label="Trade date from (UTC)">
        <Input
          id="f_from"
          type="datetime-local"
          step={1}
          value={query.date_from === undefined ? '' : to_datetime_local_value(new Date(query.date_from))}
          onChange={(event) => onChange({ date_from: iso_or_clear(event.target.value) })}
        />
      </Field>

      <Field id="f_to" label="Trade date to (UTC)">
        <Input
          id="f_to"
          type="datetime-local"
          step={1}
          value={query.date_to === undefined ? '' : to_datetime_local_value(new Date(query.date_to))}
          onChange={(event) => onChange({ date_to: iso_or_clear(event.target.value) })}
        />
      </Field>

      <div className="mt-auto flex flex-col gap-[9px] border-t border-rule pt-3">
        <div className="font-mono text-[10.5px] text-muted">
          {loaded.toLocaleString('en-GB')} of {total.toLocaleString('en-GB')} trades
        </div>
        {book_button}
      </div>
    </aside>
  );
}

/**
 * The count line the toolbar shows when the rail is hidden.
 *
 * @param props - Loaded rows and server total.
 * @returns A span.
 */
export function RowCount({ loaded, total }: { loaded: number; total: number }): ReactNode {
  return (
    <span className="font-mono text-[10.5px] text-muted">
      {loaded.toLocaleString('en-GB')} of {total.toLocaleString('en-GB')}
    </span>
  );
}

/** Reusable primary button for booking, so the rail, toolbar and empty state share one look. */
export function BookButton({ onClick, disabled_reason }: { onClick: () => void; disabled_reason: string | null }): ReactNode {
  return (
    <Button variant="primary" block onClick={onClick} disabled_reason={disabled_reason}>
      New trade
    </Button>
  );
}
