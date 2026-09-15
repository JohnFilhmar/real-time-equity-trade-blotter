'use client';

import { useSyncExternalStore } from 'react';

/**
 * Subscribes to a CSS media query.
 *
 * Used where rendering both layouts and hiding one with CSS would double the work, such as the
 * virtualised grid versus the phone card list. Renders as not matching on the server, so the
 * desktop layout is what the first paint carries.
 *
 * @param query - A media query, for example `(max-width: 767px)`.
 * @returns True while the query matches.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (on_change) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', on_change);
      return () => list.removeEventListener('change', on_change);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Below this width the grid gives way to the card list. Matches Tailwind's `md` breakpoint. */
export const phone_query = '(max-width: 767px)';
