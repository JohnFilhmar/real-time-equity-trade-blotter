'use client';

import { useState, type ReactNode } from 'react';
import { counterparties, find_instrument, instruments, type Trade } from '@blotter/shared';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { FieldError } from '@/components/ui/FieldError';
import { Note } from '@/components/ui/Note';
import { Toggle } from '@/components/ui/Toggle';
import { useMutationGate } from '@/hooks/useConnection';
import { useAmendTrade, useCreateTrade } from '@/hooks/useTradeMutations';
import { get_trade } from '@/lib/api/tradeApi';
import { format_notional, format_price, format_quantity } from '@/lib/format/money';
import { settle_trade } from '@/lib/query/settleTrade';
import { useToastStore } from '@/lib/stores/toastStore';
import { useAccessToken } from '@/providers/SessionProvider';
import { useQueryClient } from '@tanstack/react-query';
import {
  amendable_fields,
  describe_conflict,
  initial_values,
  parse_amend,
  parse_create,
  to_ticket_errors,
  type TicketErrors,
  type TicketValues,
} from './ticketForm';

/** Whether the ticket books a new trade or amends the selected one. */
export type TicketMode = { kind: 'new' } | { kind: 'amend'; trade: Trade };

/** Props for {@link TradeTicket}. */
export interface TradeTicketProps {
  mode: TicketMode;
  onClose: () => void;
  /** Called with the stored trade after a successful book or amend. */
  onBooked: (trade: Trade) => void;
}

const known_books = Array.from(new Set(instruments.map((instrument) => instrument.book)));

/**
 * The trade ticket, for booking and for amending. Validation runs the shared schema the server
 * runs, so the ticket cannot accept what the API would refuse. An amendment sends only the fields
 * that changed, with the version last seen; a 409 shows what moved and offers the current values
 * rather than retrying over the other desk's change.
 *
 * @param props - Mode, close handler, and the success handler.
 * @returns The dialog.
 */
export function TradeTicket({ mode, onClose, onBooked }: TradeTicketProps): ReactNode {
  // The ticket edits its own copy, taken when it opened. A broadcast that changes the trade mid-edit
  // must not silently become the version this form sends; the server's 409 is the right answer.
  const [base] = useState<Trade | null>(() => (mode.kind === 'amend' ? mode.trade : null));
  const [values, setValues] = useState<TicketValues>(() => initial_values(base));
  const [errors, setErrors] = useState<TicketErrors>({});
  const [conflict, setConflict] = useState<{ current: Trade; lines: string[] } | null>(null);
  const create = useCreateTrade();
  const amend = useAmendTrade();
  const gate = useMutationGate();
  const push = useToastStore((state) => state.push);
  const token = useAccessToken();
  const query_client = useQueryClient();

  const instrument = find_instrument(values.symbol);
  const currency = instrument?.currency ?? 'USD';
  const quantity = Number(values.quantity);
  const price = Number(values.price);
  const notional_ok = Number.isFinite(quantity) && Number.isFinite(price) && quantity > 0 && price > 0;
  const pending = create.isPending || amend.isPending;
  const read_only = (field: keyof TicketValues): boolean => base !== null && !amendable_fields.has(field);

  const set = (field: keyof TicketValues, value: string): void => {
    setValues((current) => {
      const next = { ...current, [field]: value };
      if (field === 'symbol' && base === null) {
        const chosen = find_instrument(value);
        if (chosen !== undefined) {
          next.book = chosen.book;
          next.price = chosen.base_price.toFixed(2);
        }
      }
      return next;
    });
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  };

  const on_error = (error: { code: string; detail: string; errors: readonly { field: string; message: string }[] }): void => {
    if (error.code === 'validation_failed' && error.errors.length > 0) {
      setErrors(to_ticket_errors(error.errors));
      return;
    }
    if (error.code === 'conflict' && base !== null) {
      void get_trade(token, base.tradeId).then((current) => {
        settle_trade(query_client, current);
        setConflict({ current, lines: describe_conflict(base, current) });
      });
      setErrors({ form: error.detail });
      return;
    }
    setErrors({ form: error.detail });
  };

  const submit = (): void => {
    setErrors({});
    if (base === null) {
      const parsed = parse_create(values);
      if (!parsed.ok) {
        setErrors(parsed.errors);
        return;
      }
      create.mutate(parsed.input, {
        onSuccess: (trade) => {
          push('ok', `Booked ${trade.tradeId}`, `${format_quantity(trade.quantity)} ${trade.symbol} @ ${format_price(trade.price)}`);
          onBooked(trade);
        },
        onError: on_error,
      });
      return;
    }

    const parsed = parse_amend(values, base);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    amend.mutate(
      { trade_id: base.tradeId, input: parsed.input },
      {
        onSuccess: (trade) => {
          push('ok', `Amended ${trade.tradeId}`, `now version ${trade.version.toString()}`);
          onBooked(trade);
        },
        onError: on_error,
      },
    );
  };

  return (
    <Dialog
      title={base === null ? 'Book a new trade' : `Amend ${base.tradeId}`}
      description={
        base === null
          ? 'Validation is the same schema the API runs. Your trader code is stamped by the server.'
          : `Currently version ${base.version.toString()}. Saving writes an audit row and increments the version. Symbol, side, counterparty and execution time cannot change: that would be a rebooking.`
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Discard</Button>
          <Button variant="primary" onClick={submit} disabled_reason={gate.reason} disabled={pending || conflict !== null}>
            {pending ? 'Saving' : base === null ? 'Book trade' : 'Save amendment'}
          </Button>
        </>
      }
    >
      <form
        className="grid grid-cols-1 gap-3.25 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field id="t_symbol" label="Symbol" error={errors.symbol}>
          <Select id="t_symbol" value={values.symbol} disabled={read_only('symbol')} onChange={(event) => set('symbol', event.target.value)}>
            {instruments.map((item) => (
              <option key={item.symbol} value={item.symbol}>
                {item.symbol} ({item.currency})
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-col gap-1.25">
          <span className="font-mono text-[9.5px] uppercase tracking-[.11em] text-faint">Side</span>
          <div className="grid grid-cols-2 gap-1.5">
            <Toggle tone="gain" pressed={values.side === 'BUY'} onToggle={() => (read_only('side') ? undefined : set('side', 'BUY'))}>
              BUY
            </Toggle>
            <Toggle tone="loss" pressed={values.side === 'SELL'} onToggle={() => (read_only('side') ? undefined : set('side', 'SELL'))}>
              SELL
            </Toggle>
          </div>
          <div className={`min-h-3.5 text-[11px] ${errors.side === undefined ? 'text-muted' : 'text-loss'}`} aria-live="polite">
            {errors.side ?? (read_only('side') ? 'Fixed on an amendment' : '')}
          </div>
        </div>

        <Field id="t_quantity" label="Quantity" error={errors.quantity}>
          <Input id="t_quantity" inputMode="numeric" value={values.quantity} invalid={errors.quantity !== undefined} onChange={(event) => set('quantity', event.target.value)} />
        </Field>

        <Field id="t_price" label={`Price (${currency})`} error={errors.price}>
          <Input id="t_price" inputMode="decimal" value={values.price} invalid={errors.price !== undefined} onChange={(event) => set('price', event.target.value)} />
        </Field>

        <Field id="t_book" label="Book" error={errors.book}>
          <Input id="t_book" list="t_books" value={values.book} invalid={errors.book !== undefined} onChange={(event) => set('book', event.target.value)} />
          <datalist id="t_books">
            {known_books.map((book) => (
              <option key={book} value={book} />
            ))}
          </datalist>
        </Field>

        <Field id="t_counterparty" label="Counterparty" required error={errors.counterparty} hint={read_only('counterparty') ? 'Fixed on an amendment. Cancel and rebook to change it.' : undefined}>
          <Input id="t_counterparty" list="t_counterparties" placeholder="Goldman Sachs" aria-required value={values.counterparty} disabled={read_only('counterparty')} invalid={errors.counterparty !== undefined} onChange={(event) => set('counterparty', event.target.value)} />
          <datalist id="t_counterparties">
            {counterparties.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>

        <div className="md:col-span-2">
          <Field id="t_time" label="Trade timestamp (UTC)" error={errors.trade_time} hint={read_only('trade_time') ? 'Fixed on an amendment' : 'Up to a minute ahead of the server clock is tolerated'}>
            <Input id="t_time" type="datetime-local" step={1} value={values.trade_time} disabled={read_only('trade_time')} invalid={errors.trade_time !== undefined} onChange={(event) => set('trade_time', event.target.value)} />
          </Field>
        </div>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>

      <Note>
        <b>Notional</b> {notional_ok ? format_notional(quantity, price, currency) : '–'}
        {currency === 'GBX' ? ' (price in pence, notional in pounds)' : ''}. The desk limit is checked by the server.
      </Note>

      <FieldError message={errors.form} lines={2} />

      {conflict !== null ? (
        <Note tone="warn">
          <b>Another desk changed this trade first.</b> {conflict.lines.length > 0 ? conflict.lines.join('; ') : 'The version moved.'}{' '}
          <button
            type="button"
            className="font-semibold text-brand-lo underline"
            onClick={() => {
              setValues(initial_values(conflict.current));
              setConflict(null);
              setErrors({});
              onClose();
            }}
          >
            Close and reopen with the current values
          </button>
        </Note>
      ) : null}
    </Dialog>
  );
}
