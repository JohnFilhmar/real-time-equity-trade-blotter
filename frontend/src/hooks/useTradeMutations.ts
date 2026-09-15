'use client';

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { AmendTrade, CancelTrade, CreateTrade, Trade } from '@blotter/shared';
import type { ApiError } from '@/lib/api/http';
import { amend_trade, cancel_trade, create_trade } from '@/lib/api/tradeApi';
import { settle_trade } from '@/lib/query/settleTrade';
import { useAccessToken } from '@/providers/SessionProvider';

/** Arguments for amending: which trade, and the changes plus the version last seen. */
export interface AmendArguments {
  trade_id: string;
  input: AmendTrade;
}

/** Arguments for cancelling: which trade, and the version guard. */
export interface CancelArguments {
  trade_id: string;
  input: CancelTrade;
}

/**
 * Books a trade. The answer is settled into every cache at once, so the row appears before the
 * socket echoes it back and the echo is then dropped as a duplicate.
 *
 * @returns The mutation.
 */
export function useCreateTrade(): UseMutationResult<Trade, ApiError, CreateTrade> {
  const token = useAccessToken();
  const query_client = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTrade) => create_trade(token, input),
    onSuccess: (trade) => {
      settle_trade(query_client, trade);
    },
  });
}

/**
 * Amends a trade, echoing the version last seen so a concurrent change is refused with a 409
 * rather than overwritten.
 *
 * @returns The mutation.
 */
export function useAmendTrade(): UseMutationResult<Trade, ApiError, AmendArguments> {
  const token = useAccessToken();
  const query_client = useQueryClient();

  return useMutation({
    mutationFn: ({ trade_id, input }: AmendArguments) => amend_trade(token, trade_id, input),
    onSuccess: (trade) => {
      settle_trade(query_client, trade);
    },
  });
}

/**
 * Cancels a trade.
 *
 * @returns The mutation.
 */
export function useCancelTrade(): UseMutationResult<Trade, ApiError, CancelArguments> {
  const token = useAccessToken();
  const query_client = useQueryClient();

  return useMutation({
    mutationFn: ({ trade_id, input }: CancelArguments) => cancel_trade(token, trade_id, input),
    onSuccess: (trade) => {
      settle_trade(query_client, trade);
    },
  });
}
