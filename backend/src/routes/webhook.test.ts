import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { UserModel } from '../models/User.js';
import { WalletModel } from '../models/Wallet.js';
import { TransactionModel } from '../models/Transaction.js';
import { deletePrivateImage } from '../services/storageService.js';
import { logger } from '../middleware/error.js';
import { bankDate, parseBankTransactions, verifyBankWebhook } from '../utils/bankWebhook.js';
// Import the deployment entry point without pulling it into the backend build's rootDir.
const serverlessEntry = '../../../api/webhooks/mbbank.js';
const { default: serverlessHandler } = await import(serverlessEntry);
const frontendEntry = '../../../frontend/api/webhooks/mbbank.js';
const { default: frontendHandler } = await import(frontendEntry);

const secret = randomBytes(32).toString('hex');
const account = '0123456789';
const payload = (referenceCode: string, transferType = 'out', transferAmount: unknown = 50000) => ({
  gateway: 'MBBank', accountNumber: account, transferType, transferAmount,
  transactionDate: '2026-11-12 00:05:09', referenceCode, content: 'Thanh toán cơm trưa',
});

describe('bank webhook validation', () => {
  it('requires configured credentials and accepts SePay Apikey headers', () => {
    expect(() => verifyBankWebhook({}, undefined)).toThrow(/Chưa cấu hình/);
    expect(() => verifyBankWebhook({}, secret)).toThrow(/không hợp lệ/);
    verifyBankWebhook({ authorization: `Apikey ${secret}` }, secret);
    verifyBankWebhook({ authorization: `Bearer ${secret}` }, secret);
  });
  it('uses Vietnam calendar date at the UTC day boundary', () => {
    expect(bankDate('2026-11-12 00:05:09')).toMatchObject({ dateKey: '2026-11-12', timeStr: '00:05:09' });
    expect(bankDate('2026-11-11T17:05:09Z')).toMatchObject({ dateKey: '2026-11-12', timeStr: '00:05:09' });
  });
  it('rejects malformed, ambiguous and non-finite transactions', () => {
    for (const body of [null, [], 'bad-json', payload('bad', 'unknown'), payload('bad', 'out', 'Infinity'), payload('bad', 'out', -2), payload(''), { ...payload('bad'), accountNumber: '' }, { ...payload('bad'), gateway: 'TPBank' }, { ...payload('bad'), amountIn: 1, amountOut: 2 }]) {
      expect(() => parseBankTransactions(body)).toThrow();
    }
    expect(parseBankTransactions(payload('in', 'in'))[0].type).toBe('income');
    expect(parseBankTransactions({ ...payload('signed'), amountIn: 0, amountOut: 3000 })[0].amount).toBe(3000);
  });
});

const app = createApp();
const rootRequire = createRequire(new URL('../../../package.json', import.meta.url));
const serverlessDb = rootRequire('mongoose') as typeof mongoose;
let database: MongoMemoryReplSet;
let owner: string;
let other: string;
const savedEnv = { ...process.env };

beforeAll(async () => {
  logger.level = 'silent';
  const systemBinary = [process.env.MONGOMS_SYSTEM_BINARY, 'C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe', 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe'].find(candidate => candidate && existsSync(candidate));
  database = await MongoMemoryReplSet.create({ binary: { ...(systemBinary ? { systemBinary } : {}), checkMD5: false }, replSet: { count: 1 } });
  const uri = database.getUri('bank_webhook_tests');
  await mongoose.connect(uri);
  for (const model of [UserModel, WalletModel, TransactionModel]) await model.init();
  const users = await UserModel.create([
    { email: 'bank-owner@example.test', name: 'Owner', passwordHash: 'test-only' },
    { email: 'bank-other@example.test', name: 'Other', passwordHash: 'test-only' },
  ]);
  owner = String(users[0]._id); other = String(users[1]._id);
  Object.assign(env, { MBBANK_WEBHOOK_SECRET: secret, SEPAY_WEBHOOK_SECRET: '', MBBANK_USER_ID: owner, MBBANK_ACCOUNT_NUMBER: account });
  Object.assign(process.env, { MONGO_URI: uri, MBBANK_WEBHOOK_SECRET: secret, SEPAY_WEBHOOK_SECRET: '', MBBANK_USER_ID: owner, MBBANK_ACCOUNT_NUMBER: account });
  // A different bank wallet must never receive MB transactions.
  await WalletModel.create({ userId: owner, name: 'Vietcombank', type: 'bank', balanceMinor: 900000 });
}, 60000);

afterAll(async () => {
  if (mongoose.connection.readyState) {
    const rows = await TransactionModel.find().lean();
    await Promise.all(rows.map(tx => deletePrivateImage(tx.imageKey)));
  }
  await serverlessDb.disconnect();
  await mongoose.disconnect();
  await database?.stop();
  for (const key of ['MONGO_URI', 'MBBANK_WEBHOOK_SECRET', 'SEPAY_WEBHOOK_SECRET', 'MBBANK_USER_ID', 'MBBANK_ACCOUNT_NUMBER']) {
    if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key];
  }
}, 30000);

async function serverlessPost(body: unknown, authorized = true, handler = serverlessHandler) {
  let status = 200; let responseBody: any;
  const res: any = { setHeader() {}, status(value: number) { status = value; return res; }, json(value: unknown) { responseBody = value; return res; } };
  await handler({ method: 'POST', body, headers: authorized ? { authorization: `Apikey ${secret}` } : {}, query: {} } as any, res);
  return { status, body: responseBody };
}

for (const [name, post] of [
  ['Express', (body: unknown, authorized = true) => { const call = request(app).post('/api/webhooks/sepay'); if (authorized) call.set('Authorization', `Apikey ${secret}`); return call.send(body as object); }],
  ['Vercel', serverlessPost],
  ['VercelFrontend', (body: unknown, authorized = true) => serverlessPost(body, authorized, frontendHandler)],
] as const) {
  describe(`${name} MB Bank integration`, () => {
    it('rejects unsigned and unrelated account deliveries', async () => {
      expect((await post(payload(`${name}-unsigned`), false)).status).toBe(401);
      expect((await post({ ...payload(`${name}-wrong-account`), accountNumber: 'another' })).status).toBe(403);
    });
    it('creates only one MB wallet for concurrent first payments', async () => {
      // Each deployment starts with its own new account.
      const user = await UserModel.create({ email: `${name.toLowerCase()}@example.test`, name, passwordHash: 'test-only' });
      owner = String(user._id);
      env.MBBANK_USER_ID = owner; process.env.MBBANK_USER_ID = owner;
      await WalletModel.create({ userId: owner, name: 'Vietcombank', type: 'bank', balanceMinor: 900000 });
      const results = await Promise.all(Array.from({ length: 3 }, (_, index) => post(payload(`${name}-first-${index}`, 'out', 1000))));
      expect(results.map(result => result.status)).toEqual([200, 200, 200]);
      expect(await WalletModel.countDocuments({ userId: owner, name: 'MB Bank' })).toBe(1);
      expect((await WalletModel.findOne({ userId: owner, name: 'MB Bank' }).lean())!.balanceMinor).toBe(-300000);
    });
    it('records an outgoing payment once in the correct wallet, ignoring supplied userId', async () => {
      const result = await post({ ...payload(`${name}-out`), userId: other });
      expect(result.status).toBe(200);
      expect(result.body.transaction).toMatchObject({ type: 'expense', amount: 50000, dateKey: '2026-11-12', transactionTime: '00:05:09' });
      expect((await post(payload(`${name}-out`))).status).toBe(200);
      expect(await TransactionModel.countDocuments({ userId: other })).toBe(0);
      const unrelated = await WalletModel.findOne({ userId: owner, name: 'Vietcombank' }).lean();
      expect(unrelated!.balanceMinor).toBe(900000);
    });
    it('handles every item in a Casso batch and keeps balances exact', async () => {
      const before = (await WalletModel.findOne({ userId: owner, name: 'MB Bank' }).lean())!.balanceMinor;
      const result = await post({ data: [
        { tid: `${name}-batch-in`, amount: 70000, accountNumber: account, when: '2026-11-12 01:00:00' },
        { tid: `${name}-batch-out`, amount: -12000, accountNumber: account, when: '2026-11-12 02:00:00' },
      ] });
      expect(result.status).toBe(200);
      expect(result.body.transactions).toHaveLength(2);
      expect((await WalletModel.findOne({ userId: owner, name: 'MB Bank' }).lean())!.balanceMinor).toBe(before + 5800000);
    });
    it('deduplicates concurrent retries without changing the balance twice', async () => {
      const before = (await WalletModel.findOne({ userId: owner, name: 'MB Bank' }).lean())!.balanceMinor;
      const results = await Promise.all(Array.from({ length: 4 }, () => post(payload(`${name}-concurrent`, 'in', 10000))));
      expect(results.map(result => result.status)).toEqual([200, 200, 200, 200]);
      expect((await WalletModel.findOne({ userId: owner, name: 'MB Bank' }).lean())!.balanceMinor).toBe(before + 1000000);
    });
    it('rolls back both transaction and balance if persistence fails', async () => {
      const before = (await WalletModel.findOne({ userId: owner, name: 'MB Bank' }).lean())!.balanceMinor;
      const count = await TransactionModel.countDocuments({ userId: owner });
      const walletModel = name === 'Express' ? WalletModel : serverlessDb.model('Wallet');
      const mock = vi.spyOn(walletModel, 'updateOne').mockRejectedValueOnce(new Error('simulated database failure'));
      const consoleMock = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        expect((await post(payload(`${name}-rollback`))).status).toBeGreaterThanOrEqual(500);
        expect(await TransactionModel.countDocuments({ userId: owner })).toBe(count);
        expect((await WalletModel.findOne({ userId: owner, name: 'MB Bank' }).lean())!.balanceMinor).toBe(before);
      } finally { mock.mockRestore(); consoleMock.mockRestore(); }
    });
  });
}
