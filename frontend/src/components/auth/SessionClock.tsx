'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { format_clock } from '@/lib/format/clock';

/**
 * The desk's clock in UTC, ticking once a second.
 *
 * Renders a placeholder of the same width until mounted, so the markup the server sends never
 * carries a time the client would immediately disagree with, and nothing shifts when the first
 * real reading lands.
 *
 * @param props - Extra classes for size and colour.
 * @returns A `time` element.
 */
export function SessionClock({ className = '' }: { className?: string }): ReactNode {
  const [now, set_now] = useState<Date | null>(null);

  useEffect(() => {
    const tick = (): void => {
      set_now(new Date());
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <time dateTime={now?.toISOString()} className={`font-mono tabular-nums ${className}`}>
      {now === null ? '--:--:--' : format_clock(now.toISOString())}
    </time>
  );
}
