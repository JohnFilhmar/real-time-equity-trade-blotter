import { describe, expect, it } from 'vitest';
import { choose_amend_scope, recent_amend_share, recent_amend_window } from './choose_amend_scope.js';

describe('choose_amend_scope', () => {
  it('looks among the newest trades when the roll falls below the recent share', () => {
    expect(choose_amend_scope(0)).toBe('recent');
    expect(choose_amend_scope(recent_amend_share - 0.000_001)).toBe('recent');
  });

  it('looks across the whole book when the roll reaches the recent share', () => {
    expect(choose_amend_scope(recent_amend_share)).toBe('any');
    expect(choose_amend_scope(0.999_999)).toBe('any');
  });

  it('splits amendments evenly and names the thirty rows on the first screen', () => {
    expect(recent_amend_share).toBe(0.5);
    expect(recent_amend_window).toBe(30);
  });
});
