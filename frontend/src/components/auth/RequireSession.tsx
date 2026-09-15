'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ConnectionProvider } from '@/providers/ConnectionProvider';
import { useSession } from '@/providers/SessionProvider';

/** Props for {@link RequireSession}. */
export interface RequireSessionProps {
  /** The authenticated section. */
  children: ReactNode;
  /**
   * The skeleton for each section, by path, shown in the section's place while the first refresh is
   * in flight. A path without one shows nothing until the session is known.
   */
  fallbacks: Readonly<Record<string, ReactNode>>;
}

/**
 * The session gate for the section inside the frame. Nothing under it renders without a signed-in
 * user, and the socket only opens once there is a token to open it with.
 *
 * The frame around the gate renders straight away. While the first refresh is in flight the gate
 * shows the skeleton for the section being opened rather than the login screen, so an open session
 * is not flashed a sign-in form on every reload and the page keeps its shape.
 *
 * @param props - The section and the skeletons by path.
 * @returns The section, its skeleton, or nothing while redirecting.
 */
export function RequireSession({ children, fallbacks }: RequireSessionProps): ReactNode {
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (session.status === 'anonymous') {
      router.replace('/login');
    }
  }, [router, session.status]);

  if (session.status === 'restoring') {
    return fallbacks[pathname] ?? null;
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
  const [signedInHere, setSignedInHere] = useState(false);
  if (session.status === 'anonymous' && !signedInHere) {
    setSignedInHere(true);
  }

  useEffect(() => {
    if (session.status === 'authenticated') {
      router.replace('/');
    }
  }, [router, session.status]);

  if (session.status === 'restoring') {
    return fallback;
  }

  if (session.status === 'authenticated' && !signedInHere) {
    return leaving;
  }

  return children;
}
