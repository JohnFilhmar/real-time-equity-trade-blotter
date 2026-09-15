import bcrypt from 'bcrypt';
import { describe, expect, it } from 'vitest';
import { env } from '../../config/env.js';
import { create_dummy_hash, hash_password, needs_rehash, verify_password } from './password.js';

describe('password hashing', () => {
  it('accepts the password it hashed', async () => {
    const hash = await hash_password('correct horse battery staple');

    await expect(verify_password('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects a different password', async () => {
    const hash = await hash_password('correct horse battery staple');

    await expect(verify_password('Correct horse battery staple', hash)).resolves.toBe(false);
  });

  it('never stores the password', async () => {
    const hash = await hash_password('correct horse battery staple');

    expect(hash).not.toContain('correct horse battery staple');
  });

  it('salts, so the same password hashes differently every time', async () => {
    const first = await hash_password('the same password');
    const second = await hash_password('the same password');

    expect(first).not.toBe(second);
    await expect(verify_password('the same password', second)).resolves.toBe(true);
  });

  it('refuses to hash a password bcrypt would silently truncate', async () => {
    // bcrypt reads 72 bytes and ignores the rest, so two different long passwords would otherwise
    // authenticate each other.
    await expect(hash_password('a'.repeat(73))).rejects.toThrow('72 byte');
  });

  it('fails a too-long password at verification rather than truncating it', async () => {
    const hash = await hash_password('a'.repeat(72));

    await expect(verify_password('a'.repeat(73), hash)).resolves.toBe(false);
  });

  it('does not throw on a hash it cannot read', async () => {
    await expect(verify_password('anything', 'not-a-bcrypt-hash')).resolves.toBe(false);
  });
});

describe('the dummy hash', () => {
  it('is made at the configured cost, so a missing account costs what a real one does', async () => {
    const dummy = await create_dummy_hash();

    expect(bcrypt.getRounds(dummy)).toBe(env.BCRYPT_ROUNDS);
  });

  it('matches none of the passwords a guesser would try first', async () => {
    const dummy = await create_dummy_hash();

    await expect(verify_password('', dummy)).resolves.toBe(false);
    await expect(verify_password('password', dummy)).resolves.toBe(false);
  });

  it('is different every time, so there is no fixed value to learn', async () => {
    expect(await create_dummy_hash()).not.toBe(await create_dummy_hash());
  });
});

describe('needs_rehash', () => {
  it('leaves a hash made at the configured cost alone', async () => {
    expect(needs_rehash(await hash_password('the same password'))).toBe(false);
  });

  it('flags a hash made at a different cost', async () => {
    expect(needs_rehash(await bcrypt.hash('the same password', 4))).toBe(true);
  });

  it('does not throw on a hash it cannot read', () => {
    expect(needs_rehash('not-a-bcrypt-hash')).toBe(false);
  });
});
