'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * Builds the query client with the blotter's defaults.
 *
 * Window focus does not refetch: the socket keeps the cache current and a focus refetch would race
 * the patches it applies. Retries are kept to one so a dead API reports as an error state within a
 * few seconds rather than spinning.
 *
 * @returns A fresh client.
 */
function create_query_client(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/**
 * Provides the TanStack Query client to the tree. One client per browser tab, created once.
 *
 * @param props - The subtree.
 * @returns The provider.
 */
export function QueryProvider({ children }: { children: ReactNode }): ReactNode {
  const [client] = useState(create_query_client);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
