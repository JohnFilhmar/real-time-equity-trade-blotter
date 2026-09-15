'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { nav_items } from './TopBar';

const glyph: Record<string, string> = {
  '/': '▦',
  '/positions': '◳',
  '/audit': '☷',
};

/**
 * The phone tab bar, pinned to the bottom of the frame below the `md` breakpoint.
 *
 * @returns The tab bar.
 */
export function MobileTabs(): ReactNode {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="absolute right-0 bottom-0 left-0 z-[45] grid grid-cols-3 border-t border-rule bg-glass shadow-[inset_0_1px_0_var(--glass_edge_soft)] backdrop-blur-[20px] backdrop-saturate-[1.4] md:hidden"
    >
      {nav_items.map((item) => {
        const current = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.75 px-1 py-1.5 text-[10px] ${current ? 'text-brand-lo' : 'text-muted'}`}
          >
            <span className="text-[15px] leading-none" aria-hidden="true">
              {glyph[item.href]}
            </span>
            {item.short}
          </Link>
        );
      })}
    </nav>
  );
}
