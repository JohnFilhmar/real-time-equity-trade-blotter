import { describe, expect, it } from 'vitest';
import type { AuthUser, Trade } from '@blotter/shared';
import { can, can_act_on } from './permissions';

const trade: Trade = {
  id: '0f4a1a1e-0d5f-4a1a-9c2e-7b3c2f1d8e90',
  tradeId: 'TRD-100001',
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 5000,
  price: 227.45,
  currency: 'USD',
  trader: 'JSMITH',
  book: 'EQUITIES_US',
  counterparty: 'Goldman Sachs',
  tradeTimestamp: '2026-08-18T09:15:23.000Z',
  status: 'ACTIVE',
  version: 1,
  createdAt: '2026-08-18T09:15:23.000Z',
  updatedAt: '2026-08-18T09:15:23.000Z',
};

function user_of(role: AuthUser['role'], trader_code: string): AuthUser {
  const permissions: AuthUser['permissions'] =
    role === 'VIEWER'
      ? ['trade.read']
      : role === 'TRADER'
        ? ['trade.read', 'trade.create', 'trade.amend', 'trade.cancel']
        : ['trade.read', 'trade.create', 'trade.amend', 'trade.amend.any', 'trade.cancel', 'trade.cancel.any'];

  return {
    id: '4c3c5f5e-4d2b-4a5f-8b1e-2f0c9d7e6a11',
    username: trader_code.toLowerCase(),
    displayName: trader_code,
    traderCode: trader_code,
    role,
    permissions,
  };
}

describe('can', () => {
  it('is false for nobody and for a missing permission', () => {
    expect(can(null, 'trade.read')).toBe(false);
    expect(can(user_of('VIEWER', 'VIEWER'), 'trade.create')).toBe(false);
    expect(can(user_of('TRADER', 'JSMITH'), 'trade.create')).toBe(true);
  });
});

describe('can_act_on', () => {
  it('lets a trader amend their own trade', () => {
    expect(can_act_on(user_of('TRADER', 'JSMITH'), trade, 'amend')).toEqual({ allowed: true });
  });

  it('greys another trader\'s trade with the desk-head reason', () => {
    expect(can_act_on(user_of('TRADER', 'ABROWN'), trade, 'cancel')).toEqual({
      allowed: false,
      reason: 'Booked by JSMITH, desk head only',
    });
  });

  it('lets an administrator act on anyone\'s trade', () => {
    expect(can_act_on(user_of('ADMIN', 'MJONES'), trade, 'cancel')).toEqual({ allowed: true });
  });

  it('refuses a viewer outright', () => {
    expect(can_act_on(user_of('VIEWER', 'VIEWER'), trade, 'amend').allowed).toBe(false);
  });

  it('refuses a cancelled trade even for its owner', () => {
    expect(can_act_on(user_of('TRADER', 'JSMITH'), { ...trade, status: 'CANCELLED' }, 'amend')).toEqual({
      allowed: false,
      reason: 'This trade is already cancelled',
    });
  });
});
