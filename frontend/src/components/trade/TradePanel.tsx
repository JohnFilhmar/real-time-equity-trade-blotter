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
  /** Whether the drawer takes focus when it opens or shows another trade. Defaults to true; see {@link TradeDrawer}. */
  take_focus?: boolean;
}

/**
 * The selected trade's drawer together with the amend ticket and cancel dialog it can open, so
 * every screen that shows a trade gets the same three behaviours from one component.
 *
 * @param props - The trade, the close handler, and whether the drawer takes focus.
 * @returns The drawer and any open overlay.
 */
export function TradePanel({ trade, onClose, take_focus = true }: TradePanelProps): ReactNode {
  const [amending, setAmending] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  return (
    <>
      <TradeDrawer trade={trade} take_focus={take_focus} onClose={onClose} onAmend={() => setAmending(true)} onCancel={() => setCancelling(true)} />
      {amending ? (
        <TradeTicket mode={{ kind: 'amend', trade }} onClose={() => setAmending(false)} onBooked={() => setAmending(false)} />
      ) : null}
      {cancelling ? <CancelDialog trade={trade} onClose={() => setCancelling(false)} /> : null}
    </>
  );
}
