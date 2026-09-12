'use client';

import { useState, type ReactNode } from 'react';
import type { Trade } from '@blotter/shared';
import { SideMark } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Note } from '@/components/ui/Note';
import { useMutationGate } from '@/hooks/use_connection';
import { useCancelTrade } from '@/hooks/use_trade_mutations';
import { format_notional, format_price, format_quantity } from '@/lib/format/money';
import { useToastStore } from '@/lib/stores/toast_store';

/** Props for {@link CancelDialog}. */
export interface CancelDialogProps {
  trade: Trade;
  onClose: () => void;
}

/**
 * The cancel confirmation: a recap of what is being cancelled and one destructive button. There
 * is no reason field. Cancel is a plain status transition, and a trader is not asked to justify it.
 *
 * The version last seen travels with the request, so a trade that moved in the meantime is
 * refused with a conflict rather than cancelled blind.
 *
 * @param props - The trade and the close handler.
 * @returns The dialog.
 */
export function CancelDialog({ trade, onClose }: CancelDialogProps): ReactNode {
  const cancel = useCancelTrade();
  const gate = useMutationGate();
  const push = useToastStore((state) => state.push);
  const [problem, set_problem] = useState<string | null>(null);

  const confirm = (): void => {
    set_problem(null);
    cancel.mutate(
      { trade_id: trade.tradeId, input: { version: trade.version } },
      {
        onSuccess: (cancelled) => {
          push('warn', `Cancelled ${cancelled.tradeId}`, `${cancelled.symbol} ${format_quantity(cancelled.quantity)} @ ${format_price(cancelled.price)}`);
          onClose();
        },
        onError: (error) => {
          set_problem(
            error.code === 'conflict'
              ? `${error.detail} Close this dialog to see the current row.`
              : error.detail,
          );
        },
      },
    );
  };

  return (
    <Dialog
      size="sm"
      title={`Cancel ${trade.tradeId}?`}
      description="A status transition to CANCELLED, stamped with your trader code in the audit trail."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Keep trade</Button>
          <Button variant="danger" onClick={confirm} disabled_reason={gate.reason} disabled={cancel.isPending}>
            {cancel.isPending ? 'Cancelling' : 'Cancel trade'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-[11px] rounded-r border border-rule bg-sunk p-[13px] md:grid-cols-2">
        <div className="flex flex-col gap-[3px]">
          <span className="font-mono text-[9px] uppercase tracking-[.11em] text-faint">Symbol</span>
          <span className="text-[12.5px]">
            {trade.symbol} <SideMark side={trade.side} />
          </span>
        </div>
        <div className="flex flex-col gap-[3px]">
          <span className="font-mono text-[9px] uppercase tracking-[.11em] text-faint">Notional</span>
          <span className="font-mono text-[12.5px] tabular-nums">{format_notional(trade.quantity, trade.price, trade.currency)}</span>
        </div>
        <div className="flex flex-col gap-[3px]">
          <span className="font-mono text-[9px] uppercase tracking-[.11em] text-faint">Quantity</span>
          <span className="font-mono text-[12.5px] tabular-nums">{format_quantity(trade.quantity)}</span>
        </div>
        <div className="flex flex-col gap-[3px]">
          <span className="font-mono text-[9px] uppercase tracking-[.11em] text-faint">Price ({trade.currency})</span>
          <span className="font-mono text-[12.5px] tabular-nums">{format_price(trade.price)}</span>
        </div>
      </div>
      <Note tone="warn">
        <b className="font-semibold">This cannot be undone.</b> The trade is not deleted: it stays on the blotter struck through, keeps its
        history, and drops out of positions.
      </Note>
      {problem !== null ? (
        <div role="alert" className="text-[12px] text-loss">
          {problem}
        </div>
      ) : null}
    </Dialog>
  );
}
