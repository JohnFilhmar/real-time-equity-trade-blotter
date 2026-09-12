import { describe, expect, it } from 'vitest';
import { permission_values, permissions_for, role_has, role_values } from './roles.js';

describe('roles', () => {
  it('gives a viewer nothing but reading', () => {
    expect(permissions_for('VIEWER')).toEqual(['trade.read']);
  });

  it("lets a trader act on trades but not on somebody else's", () => {
    expect(role_has('TRADER', 'trade.create')).toBe(true);
    expect(role_has('TRADER', 'trade.amend')).toBe(true);
    expect(role_has('TRADER', 'trade.cancel')).toBe(true);
    expect(role_has('TRADER', 'trade.amend.any')).toBe(false);
    expect(role_has('TRADER', 'trade.cancel.any')).toBe(false);
  });

  it('is the elevated pair that separates an administrator from a trader', () => {
    expect(role_has('ADMIN', 'trade.amend.any')).toBe(true);
    expect(role_has('ADMIN', 'trade.cancel.any')).toBe(true);
  });

  it('never grants a viewer a write', () => {
    for (const permission of permission_values) {
      if (permission === 'trade.read') {
        continue;
      }

      expect(role_has('VIEWER', permission)).toBe(false);
    }
  });

  it('grants an administrator every permission that exists', () => {
    for (const permission of permission_values) {
      expect(role_has('ADMIN', permission)).toBe(true);
    }
  });

  it('maps every role, so a new one cannot be added without deciding what it can do', () => {
    for (const role of role_values) {
      expect(permissions_for(role).length).toBeGreaterThan(0);
    }
  });
});
