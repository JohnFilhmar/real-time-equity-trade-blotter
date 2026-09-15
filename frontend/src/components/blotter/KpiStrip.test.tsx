import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@blotter/shared';
import { list_positions } from '@/lib/api/positionApi';
import { useSession } from '@/providers/SessionProvider';
import type { SessionState } from '@/types/session';
import { KpiStrip } from './KpiStrip';

vi.mock('@/providers/SessionProvider', () => ({ useSession: vi.fn() }));
vi.mock('@/lib/api/positionApi', () => ({ list_positions: vi.fn() }));

const trader: AuthUser = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  username: 'jsmith',
  displayName: 'John Smith',
  traderCode: 'JSMITH',
  role: 'TRADER',
  permissions: [],
};

// Vitest globals are off here, so Testing Library cannot register its own cleanup between tests.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * Renders the strip for a session over an empty cache, the way the frame mounts it.
 *
 * @param session - The session the strip reads.
 * @returns The rendered container.
 */
function render_strip(session: SessionState): HTMLElement {
  vi.mocked(useSession).mockReturnValue({ session, login: vi.fn(), logout: vi.fn() });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <KpiStrip />
    </QueryClientProvider>,
  ).container;
}

describe('KpiStrip', () => {
  it('shows skeleton tiles and sends no request while the session restores', () => {
    const container = render_strip({ status: 'restoring', user: null, token: null });

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('Net position')).toBeNull();
    expect(list_positions).not.toHaveBeenCalled();
  });

  it('reads the positions with the token once the session has one', async () => {
    vi.mocked(list_positions).mockResolvedValue([]);

    render_strip({ status: 'authenticated', user: trader, token: 'access-token' });

    expect(await screen.findByText('Net position')).toBeInTheDocument();
    expect(list_positions).toHaveBeenCalledWith('access-token');
  });
});
