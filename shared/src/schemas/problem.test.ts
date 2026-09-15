import { describe, expect, it } from 'vitest';
import { problem_schema, problem_type_for } from './problem.js';

describe('problem_schema', () => {
  it('accepts an account lockout under its own locked_out code', () => {
    const lockout = {
      type: problem_type_for('locked_out'),
      title: 'Too many requests',
      status: 429,
      detail: 'Too many failed attempts. Try again in 900 seconds.',
      instance: '/api/v1/auth/login',
      code: 'locked_out',
    };

    expect(lockout.type).toBe('/problems/locked-out');
    expect(problem_schema.safeParse(lockout)).toMatchObject({ success: true, data: lockout });
  });
});
