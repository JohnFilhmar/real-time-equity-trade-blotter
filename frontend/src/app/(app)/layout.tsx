import { AuditSkeleton } from '@/components/audit/AuditSkeleton';
import { RequireSession } from '@/components/auth/RequireSession';
import { BlotterSkeleton } from '@/components/blotter/BlotterSkeleton';
import { PositionsSkeleton } from '@/components/positions/PositionsSkeleton';
import { AppShell } from '@/components/shell/AppShell';

// The frame renders at once, so the top bar, the tabs and the connection pill are on screen while
// the session restores. Only the section beneath them waits, as that section's own skeleton.
export default function AuthenticatedLayout({ children }: LayoutProps<'/'>) {
  return (
    <AppShell>
      <RequireSession fallbacks={{ '/': <BlotterSkeleton />, '/positions': <PositionsSkeleton />, '/audit': <AuditSkeleton /> }}>
        {children}
      </RequireSession>
    </AppShell>
  );
}
