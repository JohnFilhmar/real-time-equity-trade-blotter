'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/ui/BrandMark';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Note';
import { focus_trades, trade_grid_id } from '@/lib/grid/gridFocus';
import { useSession } from '@/providers/SessionProvider';
import { ConnectionPill } from './ConnectionPill';
import { ThemeToggle } from './ThemeToggle';

/** The app's sections. Shared by the top bar and the phone tab bar. */
export const nav_items: ReadonlyArray<{ href: string; label: string; short: string }> = [
  { href: '/', label: 'Blotter', short: 'Blotter' },
  { href: '/positions', label: 'Positions', short: 'Positions' },
  { href: '/audit', label: 'Audit trail', short: 'Activity' },
];

/**
 * The top bar: wordmark, section navigation, the connection pill, the theme switch and the user.
 *
 * On the blotter, the first thing Tab reaches is a "Skip to trades" link, shown only while it has
 * focus, which moves focus past the navigation and the header buttons to the trades: the grid's
 * current row, the first card on a phone, or the message shown when no trades are listed.
 *
 * @returns The bar.
 */
export function TopBar(): ReactNode {
  const pathname = usePathname();
  const { session, logout } = useSession();
  const user = session.user;

  return (
    <header className="flex h-13 shrink-0 items-center gap-3.5 border-b border-rule bg-glass px-4 shadow-[inset_0_1px_0_var(--glass_edge_soft)] backdrop-blur-[18px] backdrop-saturate-[1.4]">
      {pathname === '/' ? (
        <a
          href={`#${trade_grid_id}`}
          onClick={(event) => {
            if (focus_trades()) {
              event.preventDefault();
            }
          }}
          className="sr-only rounded-md border border-brand-edge bg-surface px-3 py-2 text-[12.5px] font-medium text-brand-lo shadow-glass focus:not-sr-only focus:absolute focus:top-2.5 focus:left-3 focus:z-[70]"
        >
          Skip to trades
        </a>
      ) : null}
      <div className="flex shrink-0 items-center gap-2.25">
        <BrandMark />
        <b className="hidden whitespace-nowrap text-[13.5px] font-semibold tracking-[-.012em] md:inline">Fusion Blotter</b>
      </div>

      <nav aria-label="Sections" className="ml-1.5 hidden gap-0.75 md:flex">
        {nav_items.map((item) => {
          const current = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current ? 'page' : undefined}
              className={`whitespace-nowrap rounded-md px-3.25 py-1.75 text-[12.5px] font-medium transition-colors ${
                current ? 'bg-brand-bg text-brand-lo shadow-[inset_0_0_0_1px_var(--brand_edge)]' : 'text-muted hover:bg-glass-soft hover:text-text-2'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2.25">
        <ConnectionPill />
        <div className="hidden lg:block">
          <ThemeToggle />
        </div>
        {user !== null ? (
          <div className="flex items-center gap-2">
            <div
              className="grid h-6.75 w-6.75 place-items-center rounded-full bg-avatar font-mono text-[10.5px] font-semibold text-brand-lo shadow-[inset_0_0_0_1px_var(--brand_edge)]"
              title={`${user.displayName} (${user.role})`}
              aria-hidden="true"
            >
              {user.traderCode.slice(0, 2)}
            </div>
            <div className="hidden flex-col leading-tight xl:flex">
              <span className="text-[12px] font-medium">{user.displayName}</span>
              <span className="font-mono text-[9.5px] uppercase tracking-[.1em] text-faint">{user.role}</span>
            </div>
            <IconButton label={`Sign out ${user.username}`} onClick={() => void logout()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 17l5-5-5-5M21 12H9M13 21H5a2 2 0 01-2-2V5a2 2 0 012-2h8" />
              </svg>
            </IconButton>
          </div>
        ) : session.status === 'restoring' ? (
          <div className="flex items-center gap-2" aria-hidden="true">
            <Skeleton shape="pill" className="h-6.75 w-6.75" />
            <div className="hidden flex-col leading-tight xl:flex">
              <span className="text-[12px]">
                <Skeleton inline className="h-2 w-20" />
              </span>
              <span className="font-mono text-[9.5px]">
                <Skeleton inline className="h-1.5 w-12" />
              </span>
            </div>
            <Skeleton shape="control" className="h-7 w-7" />
          </div>
        ) : null}
      </div>
    </header>
  );
}
