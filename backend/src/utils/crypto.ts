import { createHash, randomBytes } from 'node:crypto';

export function randomToken(bytes = 48) {
  return randomBytes(bytes).toString('hex');
}

export function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
