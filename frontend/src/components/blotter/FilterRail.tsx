'use client';

import { useId, type ReactNode } from 'react';
import { instruments } from '@blotter/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';
import { active_filter_count, type TradeListQuery } from '@/lib/query/tradeQuery';
import { DateRangeFields } from './DateRangeFields';

/** Where the rail is shown: a column beside the grid, or the body of the filters panel. */
export type FilterRailLayout = 'rail' | 'panel';

/**
 * The rail's column beside the grid, 216px wide. The rail skeleton is built on the same classes, so
 * nothing beside the rail moves when the real one takes its place.
 */
export const filter_rail_classes =
  'flex w-54 shrink-0 flex-col gap-3.75 overflow-y-auto border-r border-rule bg-glass-soft p-3.5';

/** The frame per layout. The panel draws its own edge and glass, so the rail does not repeat them there. */
const layout_classes: Record<FilterRailLayout, string> = {
  rail: filter_rail_classes,
  panel: 'flex w-54 max-w-full flex-col gap-3.75 overflow-y-auto p-3.5',
};

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
  /** `rail`, the default, for the column beside the grid; `panel` inside the filters panel. */
  layout?: FilterRailLayout;
}

/**
 * The left-hand filter rail: symbol, side, status, trader, book, counterparty and the trade date
 * range. Every filter writes straight to the URL, so the blotter is linkable in any filtered state;
 * the date range writes only once From is on or before To.
 *
 * Control ids are unique per rail, because below `lg` the hidden column and the open panel can both
 * be on the page.
 *
 * @param props - The query, its setters, the counts, the book button and the layout.
 * @returns The rail.
 */
export function FilterRail({ query, onChange, onClear, loaded, total, book_button, layout = 'rail' }: FilterRailProps): ReactNode {
  const active = active_filter_count(query);
  const id = useId();
  const Frame = layout === 'rail' ? 'aside' : 'div';

  return (
    <Frame className={layout_classes[layout]} aria-label={layout === 'rail' ? 'Filters' : undefined}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9.5px] uppercase tracking-[.12em] text-faint">Filters</span>
        {active > 0 ? (
          <button type="button" onClick={onClear} className="text-[11px] font-medium text-brand hover:text-brand-lo hover:underline">
            Clear {active.toString()}
          </button>
        ) : null}
      </div>

      <Field id={`${id}symbol`} label="Symbol">
        <Select id={`${id}symbol`} value={query.symbol ?? ''} onChange={(event) => onChange({ symbol: event.target.value || undefined })}>
          <option value="">All</option>
          {instruments.map((instrument) => (
            <option key={instrument.symbol} value={instrument.symbol}>
              {instrument.symbol}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex flex-col gap-1.25">
        <span className="font-mono text-[9.5px] uppercase tracking-[.11em] text-faint">Side</span>
        <div className="grid grid-cols-2 gap-1.5">
          <Toggle tone="gain" pressed={query.side === 'BUY'} onToggle={() => onChange({ side: query.side === 'BUY' ? undefined : 'BUY' })}>
            BUY
          </Toggle>
          <Toggle tone="loss" pressed={query.side === 'SELL'} onToggle={() => onChange({ side: query.side === 'SELL' ? undefined : 'SELL' })}>
            SELL
          </Toggle>
        </div>
      </div>

      <div className="flex flex-col gap-1.25">
        <span className="font-mono text-[9.5px] uppercase tracking-[.11em] text-faint">Status</span>
        <div className="grid grid-cols-2 gap-1.5">
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

      <Field id={`${id}trader`} label="Trader">
        <Input id={`${id}trader`} placeholder="JSMITH" value={query.trader ?? ''} onChange={(event) => onChange({ trader: event.target.value || undefined })} />
      </Field>

      <Field id={`${id}book`} label="Book">
        <Input id={`${id}book`} placeholder="EQUITIES" value={query.book ?? ''} onChange={(event) => onChange({ book: event.target.value || undefined })} />
      </Field>

      <Field id={`${id}cpty`} label="Counterparty">
        <Input id={`${id}cpty`} placeholder="Goldman" value={query.counterparty ?? ''} onChange={(event) => onChange({ counterparty: event.target.value || undefined })} />
      </Field>

      <DateRangeFields id_prefix={id} range={{ date_from: query.date_from, date_to: query.date_to }} onChange={onChange} />

      <div className="mt-auto flex flex-col gap-2.25 border-t border-rule pt-3">
        <div className="font-mono text-[10.5px] text-muted">
          {loaded.toLocaleString('en-GB')} of {total.toLocaleString('en-GB')} trades
        </div>
        {book_button}
      </div>
    </Frame>
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
