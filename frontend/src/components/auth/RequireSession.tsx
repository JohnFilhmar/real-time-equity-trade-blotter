'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
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
 * The two other states each have a slot so the page around the form can stay on screen: `fallback`
 * shows while the first refresh is in flight, in the form's reserved space, and `leaving` shows
 * when a session already existed on arrival, until the redirect lands. A session that was created
 * by the form itself keeps the form mounted through the redirect, so its own "opening the desk"
 * state is what the person sees. Either way a signed-in person reloading this route sees the
 * stage and then the blotter, never a sign-in form.
 *
 * @param props - The form, what to show while restoring, and what to show while redirecting.
 * @returns The form, one of the two slots, or nothing when no slot was given.
 */
export function RequireAnonymous({
  children,
  fallback = null,
  leaving = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  leaving?: ReactNode;
}): ReactNode {
  const { session } = useSession();
  const router = useRouter();
  const [signed_in_here, set_signed_in_here] = useState(false);
  if (session.status === 'anonymous' && !signed_in_here) {
    set_signed_in_here(true);
  }

  useEffect(() => {
    if (session.status === 'authenticated') {
      router.replace('/');
    }
  }, [router, session.status]);

  if (session.status === 'restoring') {
    return fallback;
  }

  if (session.status === 'authenticated' && !signed_in_here) {
    return leaving;
  }

  return children;
}
