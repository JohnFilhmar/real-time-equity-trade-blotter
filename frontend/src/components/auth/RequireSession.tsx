'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/Note';
import { ConnectionProvider } from '@/providers/connection_provider';
import { useSession } from '@/providers/session_provider';

/**
 * The session gate. Nothing under it renders without a signed-in user, and the socket only opens
 * once there is a token to open it with.
 *
 * While the first refresh is in flight a skeleton is shown rather than the login screen, so an
 * open session is not flashed a sign-in form on every reload.
 *
 * @param props - The authenticated subtree.
 * @returns The subtree, a skeleton, or nothing while redirecting.
 */
export function RequireSession({ children }: { children: ReactNode }): ReactNode {
  const { session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === 'anonymous') {
      router.replace('/login');
    }
  }, [router, session.status]);

  if (session.status === 'restoring') {
    return (
      <div className="flex flex-1 flex-col gap-3 p-6" aria-busy="true" aria-label="Restoring your session">
        <Skeleton className="h-[52px] w-full" />
        <Skeleton className="h-[64px] w-full" />
        <Skeleton className="h-[320px] w-full" />
      </div>
    );
  }

  if (session.status === 'anonymous') {
    return null;
  }

  return <ConnectionProvider>{children}</ConnectionProvider>;
}

/**
 * The inverse gate for the login page: a signed-in user is sent to the blotter.
 *
 * @param props - The login screen.
 * @returns The screen, or nothing while redirecting.
 */
export function RequireAnonymous({ children }: { children: ReactNode }): ReactNode {
  const { session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === 'authenticated') {
      router.replace('/');
    }
  }, [router, session.status]);

  if (session.status !== 'anonymous') {
    return null;
  }

  return children;
}
