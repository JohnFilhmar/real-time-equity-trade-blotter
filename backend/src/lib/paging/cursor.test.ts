import { describe, expect, it } from 'vitest';
import { decode_cursor, encode_cursor } from './cursor.js';

const a_uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('cursor', () => {
  it('round-trips a row id', () => {
    expect(decode_cursor(encode_cursor(a_uuid))).toBe(a_uuid);
  });

  it('does not hand the client something it can read and rebuild', () => {
    expect(encode_cursor(a_uuid)).not.toContain(a_uuid);
  });

  it('is url-safe, so it survives a query string untouched', () => {
    expect(encode_cursor(a_uuid)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('treats an absent cursor as the first page', () => {
    expect(decode_cursor(undefined)).toBeUndefined();
    expect(decode_cursor('')).toBeUndefined();
  });

  it('treats a hand-edited or stale cursor as the first page rather than an error', () => {
    expect(decode_cursor('not-base64-at-all!!')).toBeUndefined();
    expect(decode_cursor(encode_cursor('definitely not a uuid'))).toBeUndefined();
  });
});
