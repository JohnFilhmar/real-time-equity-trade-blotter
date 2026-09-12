'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { useSession } from '@/providers/session_provider';
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
 * @returns The bar.
 */
export function TopBar(): ReactNode {
  const pathname = usePathname();
  const { session, logout } = useSession();
  const user = session.user;

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-[14px] border-b border-rule bg-glass px-4 shadow-[inset_0_1px_0_var(--glass_edge_soft)] backdrop-blur-[18px] backdrop-saturate-[1.4]">
      <div className="flex shrink-0 items-center gap-[9px]">
        <div className="grid h-6 w-6 place-items-center rounded-[6px] bg-linear-145 from-brand-grad-hi to-brand-grad-lo text-brand-lo shadow-[inset_0_0_0_1px_var(--brand_edge)]" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17l6-6 4 4 8-8" />
          </svg>
        </div>
        <b className="hidden whitespace-nowrap text-[13.5px] font-semibold tracking-[-.012em] md:inline">Fusion Blotter</b>
      </div>

      <nav aria-label="Sections" className="ml-[6px] hidden gap-[3px] md:flex">
        {nav_items.map((item) => {
          const current = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current ? 'page' : undefined}
              className={`whitespace-nowrap rounded-[6px] px-[13px] py-[7px] text-[12.5px] font-medium transition-colors ${
                current ? 'bg-brand-bg text-brand-lo shadow-[inset_0_0_0_1px_var(--brand_edge)]' : 'text-muted hover:bg-glass-soft hover:text-text-2'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-[9px]">
        <ConnectionPill />
        <div className="hidden lg:block">
          <ThemeToggle />
        </div>
        {user !== null ? (
          <div className="flex items-center gap-2">
            <div
              className="grid h-[27px] w-[27px] place-items-center rounded-full bg-avatar font-mono text-[10.5px] font-semibold text-brand-lo shadow-[inset_0_0_0_1px_var(--brand_edge)]"
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
        ) : null}
      </div>
    </header>
  );
}
