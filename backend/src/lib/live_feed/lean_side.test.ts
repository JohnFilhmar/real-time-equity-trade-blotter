import { describe, expect, it } from 'vitest';
import { lean_scale_shares, lean_side } from './lean_side.js';

describe('lean_side', () => {
  it('is an even call when the symbol is flat', () => {
    expect(lean_side(0, 0.49)).toBe('SELL');
    expect(lean_side(0, 0.51)).toBe('BUY');
  });

  it('leans toward selling a symbol the desk is long', () => {
    // One scale unit long puts the chance of a sell at about four in five.
    expect(lean_side(lean_scale_shares, 0.75)).toBe('SELL');
    expect(lean_side(lean_scale_shares, 0.85)).toBe('BUY');
  });

  it('leans toward buying a symbol the desk is short', () => {
    expect(lean_side(-lean_scale_shares, 0.25)).toBe('BUY');
    expect(lean_side(-lean_scale_shares, 0.15)).toBe('SELL');
  });

  it('never rules a side out, however lopsided the book', () => {
    expect(lean_side(50 * lean_scale_shares, 0.95)).toBe('BUY');
    expect(lean_side(-50 * lean_scale_shares, 0.05)).toBe('SELL');
  });
});
