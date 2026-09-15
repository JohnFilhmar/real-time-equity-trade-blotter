import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useListQuery } from './useListQuery';

/** The address bar the mocked router reads and the calls it received. */
const navigation = vi.hoisted(() => ({
  search: '',
  replace: vi.fn<(href: string, options?: { scroll?: boolean }) => void>(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

describe('useListQuery', () => {
  beforeEach(() => {
    navigation.search = '';
    navigation.replace.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows a new sort the moment it is asked for, before the URL catches up', () => {
    const { result } = renderHook(() => useListQuery());

    act(() => result.current.sort_by('quantity'));

    expect(navigation.replace).toHaveBeenCalledWith('/?sort_by=quantity&sort_dir=asc', { scroll: false });
    expect(result.current.query.sort_by).toBe('quantity');
    expect(result.current.query.sort_dir).toBe('asc');
    expect(result.current.pending).toBe(true);
  });

  it('flips the direction of the pending sort, so a second click before the URL settles still toggles', () => {
    const { result } = renderHook(() => useListQuery());

    act(() => result.current.sort_by('quantity'));
    act(() => result.current.sort_by('quantity'));

    expect(result.current.query.sort_dir).toBe('desc');
    expect(navigation.replace).toHaveBeenLastCalledWith('/?sort_by=quantity', { scroll: false });
  });

  it('reads the URL again once it changes, whether to the written sort or back to another view', () => {
    const { result, rerender } = renderHook(() => useListQuery());

    act(() => result.current.sort_by('quantity'));
    navigation.search = 'sort_by=quantity&sort_dir=asc';
    rerender();

    expect(result.current.pending).toBe(false);
    expect(result.current.query.sort_by).toBe('quantity');

    navigation.search = '';
    rerender();

    expect(result.current.query.sort_by).toBe('tradeTimestamp');
    expect(result.current.query.sort_dir).toBe('desc');
  });
});
