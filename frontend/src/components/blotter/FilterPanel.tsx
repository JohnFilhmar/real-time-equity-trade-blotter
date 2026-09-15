'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

/** Props for {@link FilterPanel}. */
export interface FilterPanelProps {
  /** How many filters are set. The button shows the number while it is above zero. */
  active_count: number;
  /** The filter rail, in its panel layout. */
  children: ReactNode;
}

/**
 * The toolbar's Filters button below `lg`, where the rail has no room, and the panel it opens: the
 * same rail, slid in from the left edge of the frame. The panel is modal. Escape, its close button
 * and a click on the scrim close it, and focus goes back to the button.
 *
 * @param props - The active filter count and the rail.
 * @returns The button, and the panel while it is open.
 */
export function FilterPanel({ active_count, children }: FilterPanelProps): ReactNode {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);

  const close = (): void => {
    setOpen(false);
    opener.current?.focus();
  };

  return (
    <>
      <Button
        className="lg:hidden"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          opener.current = event.currentTarget;
          setOpen(true);
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h18M7 12h10M10 18h4" />
        </svg>
        Filters{' '}
        {active_count > 0 ? (
          <span className="rounded-[3px] bg-brand-bg px-1.25 font-mono text-[10px] font-semibold text-brand-lo">{active_count.toString()}</span>
        ) : null}
      </Button>
      {open ? (
        <Dialog title="Filters" placement="left" onClose={close}>
          {children}
        </Dialog>
      ) : null}
    </>
  );
}
