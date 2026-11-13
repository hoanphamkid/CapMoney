import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../app.js';
import { UserModel } from '../models/User.js';
import { WalletModel } from '../models/Wallet.js';
import { TransactionModel } from '../models/Transaction.js';
import { signAccessToken } from '../utils/jwt.js';
import { logger } from '../middleware/error.js';
import { env } from '../config/env.js';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, mkdir: vi.fn(actual.mkdir), writeFile: vi.fn(actual.writeFile) };
});

const app = createApp();
const photo = Buffer.from('test receipt image');
let database: MongoMemoryReplSet;
let cookie: string;
let otherCookie: string;
let walletId: string;
let transactionId: string;
const originalMongoUri = env.MONGO_URI;

beforeAll(async () => {
  logger.level = 'silent';
  const systemBinary = [process.env.MONGOMS_SYSTEM_BINARY, 'C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe', 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe'].find(candidate => candidate && existsSync(candidate));
  database = await MongoMemoryReplSet.create({ binary: { ...(systemBinary ? { systemBinary } : {}), checkMD5: false }, replSet: { count: 1 } });
  env.MONGO_URI = database.getUri('finance_tests');
  await mongoose.connect(env.MONGO_URI);
  for (const model of [UserModel, WalletModel, TransactionModel]) await model.init();
  const [owner, other] = await UserModel.create([
    { email: 'photo-owner@example.test', name: 'Owner', passwordHash: 'test-only' },
    { email: 'photo-other@example.test', name: 'Other', passwordHash: 'test-only' },
  ]);
  cookie = `capmoney_access=${signAccessToken({ sub: String(owner._id), role: 'user' })}`;
  otherCookie = `capmoney_access=${signAccessToken({ sub: String(other._id), role: 'user' })}`;
  const wallet = await WalletModel.create({ userId: owner._id, name: 'Wallet', type: 'cash', balanceMinor: 1000000 });
  walletId = String(wallet._id);
}, 60000);

afterEach(async () => {
  vi.restoreAllMocks();
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  vi.mocked(fs.mkdir).mockReset().mockImplementation(actual.mkdir);
  vi.mocked(fs.writeFile).mockReset().mockImplementation(actual.writeFile);
});
afterAll(async () => {
  env.MONGO_URI = originalMongoUri;
  await mongoose.disconnect();
  await database?.stop();
}, 30000);

function postReceipt() {
  return request(app).post('/api/transactions').set('Cookie', cookie)
    .field('type', 'expense').field('amount', '3000').field('note', 'Ăn uống')
    .field('categoryId', 'food').field('walletId', walletId)
    .field('transactionDate', '2026-11-13').field('transactionTime', '09:27:00')
    .field('idempotencyKey', randomUUID())
    .attach('image', photo, { filename: 'receipt.jpg', contentType: 'image/jpeg' });
}

describe('receipt transaction storage', () => {
  it('saves a receipt on a read-only server and preserves it after reconnecting', async () => {
    const readOnlyError = Object.assign(new Error('read-only file system'), { code: 'EROFS' });
    vi.mocked(fs.mkdir).mockClear().mockRejectedValue(readOnlyError);
    vi.mocked(fs.writeFile).mockClear().mockRejectedValue(readOnlyError);
    const result = await postReceipt();
    expect(result.status).toBe(201);
    transactionId = result.body.transaction.id;
    expect((await WalletModel.findById(walletId).lean())!.balanceMinor).toBe(700000);
    await mongoose.disconnect();
    await mongoose.connect(database.getUri('finance_tests'));
    const image = await request(app).get(result.body.transaction.imageUrl).set('Cookie', cookie);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toContain('image/jpeg');
    expect(image.body).toEqual(photo);
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('keeps receipt images private', async () => {
    const url = `/api/transactions/${transactionId}/image`;
    expect((await request(app).get(url)).status).toBe(401);
    expect((await request(app).get(url).set('Cookie', otherCookie)).status).toBe(404);
  });

  it('deletes the receipt and restores the wallet balance with the transaction', async () => {
    expect((await request(app).delete(`/api/transactions/${transactionId}`).set('Cookie', cookie)).status).toBe(204);
    expect((await WalletModel.findById(walletId).lean())!.balanceMinor).toBe(1000000);
    expect(await mongoose.connection.db!.collection('transaction_images.files').countDocuments()).toBe(0);
    expect(await mongoose.connection.db!.collection('transaction_images.chunks').countDocuments()).toBe(0);
  });

  it('removes an uploaded image when the transaction fails', async () => {
    vi.spyOn(TransactionModel, 'create').mockRejectedValueOnce(new Error('simulated database write failure'));
    expect((await postReceipt()).status).toBe(500);
    expect((await WalletModel.findById(walletId).lean())!.balanceMinor).toBe(1000000);
    expect(await TransactionModel.countDocuments()).toBe(0);
    expect(await mongoose.connection.db!.collection('transaction_images.files').countDocuments()).toBe(0);
    expect(await mongoose.connection.db!.collection('transaction_images.chunks').countDocuments()).toBe(0);
  });
});

for (const layout of ['', 'frontend/']) {
  it(`routes nested receipt and delete requests through the ${layout || 'root/'} Vercel configuration`, async () => {
    const config = JSON.parse(await fs.readFile(new URL(`../../../${layout}vercel.json`, import.meta.url), 'utf8'));
    const before = (await WalletModel.findById(walletId).lean())!.balanceMinor;
    const created = await postReceipt();
    expect(created.status).toBe(201);
    const id = created.body.transaction.id;
    const routed = async (path: string) => {
      const rewrite = config.rewrites.find((rule: { source: string }) => new RegExp(`^${rule.source}$`).test(path));
      const destination = path.replace(new RegExp(`^${rewrite.source}$`), rewrite.destination);
      // Import the function selected by the deployment config, preserving the public URL.
      const entry = `../../../${layout}${destination.slice(1)}.js`;
      const { default: handler } = await import(entry);
      return request((req: IncomingMessage, res: ServerResponse) => { void handler(req, res); });
    };
    const imagePath = `/api/transactions/${id}/image`;
    const image = await (await routed(imagePath)).get(imagePath).set('Cookie', cookie);
    expect(image.status).toBe(200);
    expect(image.body).toEqual(photo);
    const deletePath = `/api/transactions/${id}`;
    expect((await (await routed(deletePath)).delete(deletePath).set('Cookie', cookie)).status).toBe(204);
    expect(await TransactionModel.exists({ _id: id })).toBeNull();
    expect((await WalletModel.findById(walletId).lean())!.balanceMinor).toBe(before);
  });
}
