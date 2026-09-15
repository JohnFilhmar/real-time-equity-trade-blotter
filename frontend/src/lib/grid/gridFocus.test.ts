import { describe, expect, it, vi } from 'vitest';
import { focus_grid, register_grid_focus } from './gridFocus';

describe('grid focus target', () => {
  it('reports that nothing took focus when no grid is mounted', () => {
    expect(focus_grid()).toBe(false);
  });

  it('hands focus to the mounted grid until it unregisters', () => {
    const target = vi.fn<() => void>();
    const unregister = register_grid_focus(target);

    expect(focus_grid()).toBe(true);
    expect(target).toHaveBeenCalledTimes(1);

    unregister();

    expect(focus_grid()).toBe(false);
  });

  it('keeps a newer grid registered when an older one unregisters late', () => {
    const older = vi.fn<() => void>();
    const newer = vi.fn<() => void>();
    const unregister_older = register_grid_focus(older);
    const unregister_newer = register_grid_focus(newer);

    unregister_older();
    focus_grid();

    expect(newer).toHaveBeenCalledTimes(1);
    expect(older).not.toHaveBeenCalled();
    unregister_newer();
  });
});
