'use client';

import type { ReactNode } from 'react';
import { QueryProvider } from '@/providers/query_provider';
import { SessionProvider } from '@/providers/session_provider';
import { ThemeProvider } from '@/providers/theme_provider';

/**
 * The root provider layer: everything the whole app needs, composed once.
 *
 * The connection provider is not here. It needs an access token, so it mounts inside the session
 * gate in the authenticated route group rather than at the root.
 *
 * @param props - The app.
 * @returns The wrapped app.
 */
export function Providers({ children }: { children: ReactNode }): ReactNode {
  return (
    <ThemeProvider>
      <QueryProvider>
        <SessionProvider>{children}</SessionProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
