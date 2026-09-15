'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { Trade } from '@blotter/shared';
import { SideMark, StatusBadge, VersionPill } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { SectionLabel } from '@/components/ui/Note';
import { useMutationGate } from '@/hooks/useConnection';
import { useMark } from '@/hooks/useMarks';
import { can, can_act_on } from '@/lib/auth/permissions';
import { format_date_time } from '@/lib/format/clock';
import { format_money, format_notional, format_price, format_quantity, to_display_notional } from '@/lib/format/money';
import { useSession } from '@/providers/SessionProvider';
import { TradeHistory } from './TradeHistory';

/** Props for {@link TradeDrawer}. */
export interface TradeDrawerProps {
  trade: Trade;
  onClose: () => void;
  onAmend: () => void;
  onCancel: () => void;
}

/**
 * One labelled value in the drawer.
 *
 * @param props - Label, value, and whether it spans both columns.
 * @returns A definition pair.
 */
function Value({ label, children, wide = false, mono = false }: { label: string; children: ReactNode; wide?: boolean; mono?: boolean }): ReactNode {
  return (
    <div className={`flex min-w-0 flex-col gap-0.75 ${wide ? 'col-span-2' : ''}`}>
      <span className="font-mono text-[9px] uppercase tracking-[.11em] text-faint">{label}</span>
      <span className={`truncate text-[12.5px] text-text ${mono ? 'font-mono tabular-nums' : ''}`}>{children}</span>
    </div>
  );
}

/**
 * The detail panel for the selected trade. Overlays the grid rather than taking a column from it,
 * so the blotter sheds no columns when nothing is selected.
 *
 * Amend and Cancel are hidden for a role that can never use them, and greyed with the reason when
 * the block is temporary: another trader's row, a cancelled trade, or a link that is down.
 *
 * @param props - The trade and the close, amend and cancel handlers.
 * @returns The drawer.
 */
export function TradeDrawer({ trade, onClose, onAmend, onCancel }: TradeDrawerProps): ReactNode {
  const { session } = useSession();
  const user = session.user;
  const gate = useMutationGate();
  const close_button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close_button.current?.focus();
  }, [trade.id]);

  const mark = useMark(trade.symbol);
  // What this trade is worth against the current mark, signed by side: a BUY gains as the mark
  // rises, a SELL gains as it falls. The prototype's "drift since execution".
  const drift = mark === undefined ? null : (mark - trade.price) * trade.quantity * (trade.side === 'BUY' ? 1 : -1);
  const amend = can_act_on(user, trade, 'amend');
  const cancel = can_act_on(user, trade, 'cancel');
  const amend_reason = !amend.allowed ? amend.reason : gate.reason;
  const cancel_reason = !cancel.allowed ? cancel.reason : gate.reason;
  const shows_actions = can(user, 'trade.amend') || can(user, 'trade.cancel');

  return (
    <aside
      aria-label={`Trade ${trade.tradeId}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
      className="absolute top-0 right-0 bottom-0 z-[55] flex w-full min-h-0 animate-slide-in flex-col border-l border-glass-edge bg-glass shadow-drawer backdrop-blur-[20px] backdrop-saturate-150 md:w-[min(360px,88%)]"
    >
      <div className="flex shrink-0 items-start gap-2.5 border-b border-rule px-3.75 py-3.25">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[12.5px] text-brand">{trade.tradeId}</div>
          <div className="mt-1.25 flex items-center gap-2">
            <b className="text-[16px] font-semibold">{trade.symbol}</b>
            <SideMark side={trade.side} />
            <StatusBadge status={trade.status} />
            <VersionPill version={trade.version} />
          </div>
        </div>
        <IconButton ref={close_button} label="Close detail" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </IconButton>
      </div>

      <div className="flex flex-1 flex-col gap-4.25 overflow-y-auto p-3.75">
        <section>
          <SectionLabel>Economics</SectionLabel>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3.25">
            <Value label="Quantity" mono>{format_quantity(trade.quantity)}</Value>
            <Value label={`Price (${trade.currency})`} mono>{format_price(trade.price)}</Value>
            <Value label="Notional" mono>{format_notional(trade.quantity, trade.price, trade.currency)}</Value>
            <Value label={`Mark (${trade.currency})`} mono>{mark === undefined ? '–' : format_price(mark)}</Value>
            <Value label="Drift since execution" mono wide>
              {drift === null ? (
                <span className="text-faint">{'–'}</span>
              ) : (
                <span className={drift >= 0 ? 'text-gain' : 'text-loss'}>
                  {drift >= 0 ? '+' : ''}
                  {format_money(to_display_notional(drift, trade.currency), trade.currency)}
                </span>
              )}
            </Value>
          </div>
        </section>

        <section>
          <SectionLabel>Booking</SectionLabel>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3.25">
            <Value label="Trader">{trade.trader}</Value>
            <Value label="Book">{trade.book}</Value>
            <Value label="Counterparty" wide>{trade.counterparty}</Value>
            <Value label="Trade timestamp (UTC)" mono wide>{format_date_time(trade.tradeTimestamp)}</Value>
          </div>
        </section>

        <section>
          <SectionLabel>History {'·'} version {trade.version}</SectionLabel>
          <TradeHistory trade={trade} />
        </section>
      </div>

      {shows_actions ? (
        <div className="flex shrink-0 gap-2 border-t border-rule px-3.75 py-3">
          {can(user, 'trade.amend') ? (
            <Button block onClick={onAmend} disabled_reason={amend_reason}>
              Amend
            </Button>
          ) : null}
          {can(user, 'trade.cancel') ? (
            <Button block variant="danger" onClick={onCancel} disabled_reason={cancel_reason}>
              Cancel trade
            </Button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
