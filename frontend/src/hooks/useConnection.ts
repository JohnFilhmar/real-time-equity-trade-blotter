'use client';

import { mutation_block_reason, mutations_allowed, useConnectionStore } from '@/lib/stores/connectionStore';
import type { ConnectionStatus } from '@/types/connection';

/**
 * Reads the link state.
 *
 * @returns The current status.
 */
export function useConnectionStatus(): ConnectionStatus {
  return useConnectionStore((state) => state.status);
}

/** Whether writes may be sent, and if not, why. */
export interface MutationGate {
  allowed: boolean;
  reason: string | null;
}

/**
 * Reads whether a mutation may be sent right now.
 *
 * Every New trade, Amend and Cancel control reads this, so the block applies in one place and the
 * disabled control can say why.
 *
 * @returns Allowed, and the reason when not.
 */
export function useMutationGate(): MutationGate {
  const status = useConnectionStore((state) => state.status);
  return { allowed: mutations_allowed(status), reason: mutation_block_reason(status) };
}

/**
 * Reads the last broadcast sequence seen, for the connection pill.
 *
 * @returns The sequence, or `null` before the first broadcast since the last resync.
 */
export function useLastSeq(): number | null {
  return useConnectionStore((state) => state.last_seq);
}
