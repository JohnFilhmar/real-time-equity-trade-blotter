'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { probe_ready } from '@/lib/api/health_api';
import type { Readiness } from '@/types/readiness';

/** Props for {@link DeskReadiness}. */
export interface DeskReadinessProps {
  /** Dot and one word, for the phone strip. */
  compact?: boolean;
}

/**
 * Whether the desk can serve, asked once when the door opens.
 *
 * Tells a trader before they type whether a failure is going to be their password or the system.
 * One request and no polling: the pill inside the blotter takes over once they are in.
 *
 * @param props - Compact or full.
 * @returns A status line: checking, ready with the round trip, or unavailable.
 */
export function DeskReadiness({ compact = false }: DeskReadinessProps): ReactNode {
  const [readiness, set_readiness] = useState<Readiness | null>(null);

  useEffect(() => {
    let cancelled = false;
    void probe_ready().then((result) => {
      if (!cancelled) {
        set_readiness(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const state = readiness === null ? 'checking' : readiness.state;
  const dot = state === 'ready' ? 'bg-gain animate-pulse-dot' : state === 'unavailable' ? 'bg-warn' : 'bg-muted animate-pulse-dot';
  const label =
    readiness === null
      ? 'checking'
      : readiness.state === 'unavailable'
        ? 'unavailable'
        : compact
          ? 'ready'
          : `ready ${'·'} ${readiness.latency_ms.toString()} ms`;

  return (
    <span role="status" className="inline-flex items-center gap-[7px] font-mono text-[10.5px] text-text-2">
      <i className={`h-[6px] w-[6px] rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
