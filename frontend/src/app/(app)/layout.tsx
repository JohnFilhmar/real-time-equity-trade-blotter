import { RequireSession } from '@/components/auth/RequireSession';
import { AppShell } from '@/components/shell/AppShell';

export default function AuthenticatedLayout({ children }: LayoutProps<'/'>) {
  return (
    <RequireSession>
      <AppShell>{children}</AppShell>
    </RequireSession>
  );
}
