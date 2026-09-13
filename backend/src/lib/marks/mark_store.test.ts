import { describe, expect, it } from 'vitest';
import { instruments } from '@blotter/shared';
import { create_mark_store } from './mark_store.js';

describe('create_mark_store', () => {
  it('seeds one mark per instrument at its reference price', () => {
    const store = create_mark_store();
    const marks = store.current();

    expect(Object.keys(marks)).toHaveLength(instruments.length);
    for (const instrument of instruments) {
      expect(marks[instrument.symbol]).toBe(instrument.base_price);
    }
  });

  it('hands out copies, so a caller cannot move a mark without set', () => {
    const store = create_mark_store();
    const leaked = store.current();
    leaked.AAPL = 1;

    expect(store.current().AAPL).not.toBe(1);

    store.set({ ...store.current(), AAPL: 250 });
    expect(store.current().AAPL).toBe(250);
  });
});
