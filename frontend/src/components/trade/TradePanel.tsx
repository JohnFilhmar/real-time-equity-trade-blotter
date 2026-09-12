'use client';

import { useState, type ReactNode } from 'react';
import type { Trade } from '@blotter/shared';
import { CancelDialog } from './CancelDialog';
import { TradeDrawer } from './TradeDrawer';
import { TradeTicket } from './TradeTicket';

/** Props for {@link TradePanel}. */
export interface TradePanelProps {
  trade: Trade;
  onClose: () => void;
}

/**
 * The selected trade's drawer together with the amend ticket and cancel dialog it can open, so
 * every screen that shows a trade gets the same three behaviours from one component.
 *
 * @param props - The trade and the close handler.
 * @returns The drawer and any open overlay.
 */
export function TradePanel({ trade, onClose }: TradePanelProps): ReactNode {
  const [amending, set_amending] = useState(false);
  const [cancelling, set_cancelling] = useState(false);

  return (
    <>
      <TradeDrawer trade={trade} onClose={onClose} onAmend={() => set_amending(true)} onCancel={() => set_cancelling(true)} />
      {amending ? (
        <TradeTicket mode={{ kind: 'amend', trade }} onClose={() => set_amending(false)} onBooked={() => set_amending(false)} />
      ) : null}
      {cancelling ? <CancelDialog trade={trade} onClose={() => set_cancelling(false)} /> : null}
    </>
  );
}
