import type { ReactNode } from 'react';
import { KpiStrip } from '@/components/blotter/KpiStrip';
import { Toasts } from '@/components/ui/Toasts';
import { MobileTabs } from './MobileTabs';
import { TopBar } from './TopBar';

/**
 * The authenticated frame: top bar, KPI strip, the section beneath them, the phone tab bar and
 * the toast stack. The frame is the positioning context for drawers, dialogs and toasts, so they
 * stay inside the app rather than anchoring to the document.
 *
 * @param props - The section.
 * @returns The frame.
 */
export function AppShell({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="relative flex h-dvh min-w-0 flex-col overflow-hidden bg-[radial-gradient(760px_380px_at_8%_-8%,var(--brand_glow),transparent_60%)]">
      <TopBar />
      <KpiStrip />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col pb-14 md:pb-0">{children}</main>
      <MobileTabs />
      <Toasts />
    </div>
  );
}
