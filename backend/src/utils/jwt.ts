import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type AccessClaims = { sub: string; role: 'user' | 'admin'; type: 'access' };

export function signAccessToken(claims: Omit<AccessClaims, 'type'>) {
  return jwt.sign({ ...claims, type: 'access' }, env.JWT_SECRET, { expiresIn: '15m' });
}

export function verifyAccessToken(token: string) {
  const decoded = jwt.verify(token, env.JWT_SECRET) as AccessClaims;
  if (decoded.type !== 'access' || !decoded.sub) throw new Error('Invalid access token');
  return decoded;
}
