import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('hashes and verifies the original password', async () => {
    const hash = await hashPassword('CapMoney-demo-password');
    expect(hash).toMatch(/^scrypt\$/);
    await expect(verifyPassword('CapMoney-demo-password', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });
});
