import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { existsSync } from 'node:fs';
import request from 'supertest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { logger } from '../middleware/error.js';
import { ProfileModel } from '../models/Profile.js';
import { UserModel } from '../models/User.js';
import { signAccessToken } from '../utils/jwt.js';

const app = createApp();
let database: MongoMemoryServer;
let ownerCookie: string;
let otherCookie: string;
let ownerId: string;
let otherId: string;

beforeAll(async () => {
  logger.level = 'silent';
  const systemBinary = [process.env.MONGOMS_SYSTEM_BINARY, 'C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe', 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe'].find(candidate => candidate && existsSync(candidate));
  database = await MongoMemoryServer.create({ binary: { ...(systemBinary ? { systemBinary } : {}), checkMD5: false } });
  await mongoose.connect(database.getUri('auth_tests'), { autoIndex: false });
  await Promise.all([UserModel.init(), ProfileModel.init()]);
  const [owner, other] = await UserModel.create([
    { email: 'owner@example.test', name: 'Owner', passwordHash: 'test-only' },
    { email: 'other@example.test', name: 'Other', passwordHash: 'test-only' },
  ]);
  ownerId = String(owner._id);
  otherId = String(other._id);
  ownerCookie = `capmoney_access=${signAccessToken({ sub: ownerId, role: 'user' })}`;
  otherCookie = `capmoney_access=${signAccessToken({ sub: otherId, role: 'user' })}`;
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
}, 30000);

describe('account avatar and Pro', () => {
  it('updates, preserves and removes the current account avatar', async () => {
    const avatarUrl = 'data:image/jpeg;base64,/9j/2Q==';
    const profile = { name: 'Owner', phone: '', locale: 'vi-VN', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' };
    const patch = (input: object) => request(app).patch('/api/auth/me').set('Cookie', ownerCookie).send({ ...profile, ...input });
    expect((await patch({ avatarUrl: 'https://example.test/avatar.png' })).status).toBe(400);
    const saved = await patch({ avatarUrl, proEnabled: true });
    expect(saved.status).toBe(200);
    expect(saved.body.profile.avatarUrl).toBe(avatarUrl);
    expect(saved.body.user.proEnabled).toBe(false);
    expect((await patch({ currency: 'USD' })).body.profile.avatarUrl).toBe(avatarUrl);
    expect((await request(app).get('/api/auth/me').set('Cookie', otherCookie)).body.profile).toBeNull();
    expect((await patch({ avatarUrl: null })).body.profile.avatarUrl).toBeUndefined();
  });

  it('requires one matching incoming transfer before granting Pro and rejects replay across orders', async () => {
    const config = {
      PRO_PAYMENT_USE_MBBANK_SYNC: 'false',
      PRO_PRICE_VND: undefined,
      PRO_PAYMENT_BANK_NAME: 'MB Bank',
      PRO_PAYMENT_ACCOUNT_NUMBER: '00424242',
      PRO_PAYMENT_ACCOUNT_NAME: 'CAPMONEY TEST',
      PRO_SEPAY_WEBHOOK_SECRET: 'pro-test-webhook-secret',
    };
    const original = Object.fromEntries(Object.keys(config).map(key => [key, env[key as keyof typeof config]]));
    const checkout = (cookie: string) => request(app).get('/api/auth/pro').set('Cookie', cookie);
    const me = (cookie: string) => request(app).get('/api/auth/me').set('Cookie', cookie);
    const order = (cookie: string) => request(app).post('/api/auth/pro').set('Cookie', cookie).send({ userId: otherId, price: 1, proEnabled: true });
    const notify = (payload: object, secret = config.PRO_SEPAY_WEBHOOK_SECRET) => request(app).post('/api/webhooks/pro').set('Authorization', `Apikey ${secret}`).send(payload);

    try {
      Object.assign(env, config, { PRO_SEPAY_WEBHOOK_SECRET: undefined });
      expect((await order(ownerCookie)).body).toEqual({ status: 'unavailable', price: 5000 });
      Object.assign(env, config);
      expect((await request(app).post('/api/auth/pro')).status).toBe(401);
      expect((await checkout(ownerCookie)).body).toEqual({ status: 'available', price: 5000 });
      await UserModel.collection.updateOne({ _id: new mongoose.Types.ObjectId(ownerId) }, { $set: { proEnabled: true } });
      expect((await me(ownerCookie)).body.user.proEnabled).toBe(false);

      const [first, retry, second] = await Promise.all([order(ownerCookie), order(ownerCookie), order(otherCookie)]);
      expect(first.status).toBe(200);
      expect(first.body.status).toBe('pending');
      expect(first.body.order.amount).toBe(5000);
      expect(retry.body).toEqual(first.body);
      expect(second.body.order.code).not.toBe(first.body.order.code);
      expect((await me(ownerCookie)).body.user.proEnabled).toBe(false);

      const payment = { id: 9135, gateway: 'MBBank', accountNumber: config.PRO_PAYMENT_ACCOUNT_NUMBER, transferType: 'in', transferAmount: 5000, content: first.body.order.code };
      expect((await notify(payment, 'incorrect-secret')).status).toBe(401);
      for (const mismatch of [
        { transferAmount: 4999 },
        { accountNumber: '01500009' },
        { gateway: 'Vietcombank' },
        { transferType: 'out' },
        { content: `X${payment.content}` },
        { content: `${payment.content} ${second.body.order.code}` },
      ]) {
        expect((await notify({ ...payment, ...mismatch })).body).toEqual({ success: true });
      }
      expect((await checkout(ownerCookie)).body.status).toBe('pending');
      expect((await notify(payment)).body).toEqual({ success: true });
      expect((await notify(payment)).body).toEqual({ success: true });
      expect((await notify({ ...payment, content: second.body.order.code })).body).toEqual({ success: true });
      expect((await checkout(ownerCookie)).body).toEqual({ status: 'paid' });
      expect((await me(ownerCookie)).body.user.proEnabled).toBe(true);
      expect((await me(otherCookie)).body.user.proEnabled).toBe(false);
      expect((await checkout(otherCookie)).body.status).toBe('pending');
    } finally {
      Object.assign(env, original);
    }
  });
});
