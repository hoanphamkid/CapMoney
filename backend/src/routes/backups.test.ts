import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createApp } from '../app.js';
import { signAccessToken } from '../utils/jwt.js';
import { UserModel } from '../models/User.js';
import { WalletModel } from '../models/Wallet.js';
import { TransactionModel } from '../models/Transaction.js';
import { CalendarReminderModel } from '../models/CalendarReminder.js';
import { ProfileModel } from '../models/Profile.js';
import { AccountBackupModel, BackupDeviceModel, BackupActivityModel } from '../models/AccountBackup.js';
import { deletePrivateImage, savePrivateImage } from '../services/storageService.js';
import { logger } from '../middleware/error.js';

const app = createApp();
const mobile = { deviceId: randomUUID(), deviceName: 'Điện thoại' };
const laptop = { deviceId: randomUUID(), deviceName: 'Laptop' };
const photo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>');
const preferences = { capmoney_budget_v1: '{"monthlyLimit":900000}', capmoney_savings_jar_v1: '{"savedAmount":123456}', capmoney_work_pay_v1: '{"selectedShift":"day-long","paymentCycle":"weekly"}', 'capmoney-theme': 'light' };
let database: MongoMemoryReplSet;
let owner: string;
let other: string;
let cookie: string;
let otherCookie: string;
let originalWallet: string;
let originalImage: string;
let backupId: string;
const asOwner = (call: request.Test) => call.set('Cookie', cookie);
const history = () => asOwner(request(app).get(`/api/backups?deviceId=${laptop.deviceId}`));

beforeAll(async () => {
  logger.level = 'silent';
  const systemBinary = [process.env.MONGOMS_SYSTEM_BINARY, 'C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe', 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe'].find(candidate => candidate && existsSync(candidate));
  database = await MongoMemoryReplSet.create({ binary: { ...(systemBinary ? { systemBinary } : {}), checkMD5: false }, replSet: { count: 1 } });
  await mongoose.connect(database.getUri('backup_tests'));
  for (const model of [UserModel, WalletModel, TransactionModel, CalendarReminderModel, ProfileModel, AccountBackupModel, BackupDeviceModel, BackupActivityModel]) await model.init();
  const user = await UserModel.create({ email: 'backup-owner@example.test', name: 'Mobile Owner', passwordHash: 'untouched-password-hash' });
  const stranger = await UserModel.create({ email: 'stranger@example.test', name: 'Other User', passwordHash: 'other-hash' });
  owner = String(user._id); other = String(stranger._id);
  cookie = `capmoney_access=${signAccessToken({ sub: owner, role: 'user' })}`;
  otherCookie = `capmoney_access=${signAccessToken({ sub: other, role: 'user' })}`;
  await ProfileModel.create({ userId: owner, locale: 'vi-VN', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' });
  const wallet = await WalletModel.create({ userId: owner, name: 'Mobile Wallet', type: 'cash', balanceMinor: 9100000 });
  originalWallet = String(wallet._id);
  originalImage = await savePrivateImage({ buffer: photo, mimetype: 'image/svg+xml', originalname: 'test.svg' });
  await TransactionModel.create({ userId: owner, walletId: wallet._id, type: 'expense', amountMinor: 900000, categoryId: 'food', note: 'Mobile lunch', dateKey: '2026-11-12', transactionDate: new Date('2026-11-12T12:30:00Z'), transactionTime: '12:30:00', imageKey: originalImage, imageMimeType: 'image/svg+xml', imageSize: photo.length });
  await CalendarReminderModel.create({ userId: owner, title: 'Pay rent', dateKey: '2026-11-15', time: '08:00' });
  await WalletModel.create({ userId: other, name: 'Other wallet', type: 'cash', balanceMinor: 777 });
}, 60000);

afterAll(async () => {
  if (mongoose.connection.readyState) {
    const transactions = await TransactionModel.find().lean();
    await Promise.all([originalImage, ...transactions.map(t => t.imageKey)].filter(Boolean).map(key => deletePrivateImage(key)));
    await mongoose.disconnect();
  }
  await database?.stop();
}, 30000);

describe('account backup history and restore', () => {
  it('requires a real authenticated account and isolates histories', async () => {
    expect((await request(app).get(`/api/backups?deviceId=${mobile.deviceId}`)).status).toBe(401);
    expect((await request(app).get(`/api/backups?deviceId=${mobile.deviceId}`).set('Cookie', otherCookie)).body.backups).toEqual([]);
  });

  it('captures all data and images without credentials; laptop sees the same version', async () => {
    const result = await asOwner(request(app).post('/api/backups')).send({ ...mobile, label: 'Mobile complete', preferences });
    expect(result.status).toBe(201);
    backupId = result.body.backup.id;
    expect(result.body.backup).toMatchObject({ deviceName: 'Điện thoại', walletCount: 1, transactionCount: 1, reminderCount: 1 });
    expect(result.body.backup.payload).toBeUndefined();
    const snapshot = await AccountBackupModel.findById(backupId).select('+payload').lean();
    expect(snapshot!.payload.transactions[0].image).toBe(`data:image/svg+xml;base64,${photo.toString('base64')}`);
    expect(JSON.stringify(snapshot!.payload)).not.toMatch(/password|token|@example/);
    const list = await history();
    expect(list.body.backups[0].id).toBe(backupId);
    expect(list.body.lastApplied).toBeNull();
  });

  it('rejects another account, malformed links and invalid dates without changing live data', async () => {
    expect((await request(app).post(`/api/backups/${backupId}/restore`).set('Cookie', otherCookie).send({ ...laptop, preferences: {} })).status).toBe(404);
    const snapshot = (await AccountBackupModel.findById(backupId).select('+payload').lean())!.payload;
    for (const payload of [
      { ...snapshot, transactions: [{ ...snapshot.transactions[0], walletId: 'not-a-wallet' }] },
      { ...snapshot, transactions: [{ ...snapshot.transactions[0], dateKey: '2026-02-30' }] },
      { ...snapshot, wallets: [...snapshot.wallets, snapshot.wallets[0]] },
    ]) {
      expect((await asOwner(request(app).post('/api/backups')).send({ ...mobile, preferences, localData: payload })).status).toBe(400);
    }
    expect(await WalletModel.countDocuments({ userId: owner })).toBe(1);
  });

  it('restores the chosen version, preserves exact balances/images, and creates a reversible safety version', async () => {
    await WalletModel.updateOne({ _id: originalWallet }, { $set: { name: 'Changed on laptop', balanceMinor: 123 } });
    await TransactionModel.deleteMany({ userId: owner });
    await CalendarReminderModel.deleteMany({ userId: owner });
    await UserModel.updateOne({ _id: owner }, { $set: { name: 'Laptop Owner' } });
    // A backup is self-contained even after its original image has been removed.
    await deletePrivateImage(originalImage);
    const result = await asOwner(request(app).post(`/api/backups/${backupId}/restore`)).send({ ...laptop, preferences: { 'capmoney-theme': 'dark' } });
    expect(result.status).toBe(200);
    expect(result.body.preferences).toMatchObject(preferences);
    const wallet = await WalletModel.findOne({ userId: owner }).lean();
    expect(wallet).toMatchObject({ name: 'Mobile Wallet', balanceMinor: 9100000 });
    const tx = await TransactionModel.findOne({ userId: owner }).lean();
    expect(String(tx!.walletId)).toBe(String(wallet!._id));
    expect(tx!.transactionTime).toBe('12:30:00');
    const imageResponse = await asOwner(request(app).get(`/api/transactions/${tx!._id}/image`));
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers['content-type']).toMatch(/image\/svg\+xml/);
    expect(imageResponse.body).toEqual(photo);
    expect(await CalendarReminderModel.countDocuments({ userId: owner })).toBe(1);
    const user = await UserModel.findById(owner).select('+passwordHash').lean();
    expect(user!.name).toBe('Mobile Owner');
    expect(user!.passwordHash).toBe('untouched-password-hash');
    expect((await WalletModel.findOne({ userId: other }).lean())!.balanceMinor).toBe(777);
    const list = await history();
    expect(list.body.backups).toHaveLength(2);
    expect(list.body.lastApplied.backupId).toBe(backupId);
    expect(list.body.activities[0].deviceName).toBe('Laptop');
    const safetyId = result.body.safetyBackupId;
    const undo = await asOwner(request(app).post(`/api/backups/${safetyId}/restore`)).send({ ...mobile, preferences });
    expect(undo.status).toBe(200);
    expect((await WalletModel.findOne({ userId: owner }).lean())!.balanceMinor).toBe(123);
    expect(await TransactionModel.countDocuments({ userId: owner })).toBe(0);
    expect((await history()).body.activities).toHaveLength(2);
  });

  it('accepts local UUIDs and large image payloads, paginates immutable versions, and rejects oversized requests', async () => {
    const localWallet = randomUUID();
    const payload = { version: 1, account: { name: 'Imported Mobile', phone: '' }, profile: { locale: 'vi-VN', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' },
      wallets: [{ id: localWallet, name: 'Offline cash', type: 'cash', balanceMinor: 987600, currency: 'VND', color: '#163e36', active: true }],
      transactions: [{ id: randomUUID(), walletId: localWallet, type: 'expense', amountMinor: 100, categoryId: 'food', note: 'Offline tx', dateKey: '2026-11-12', image: `data:image/png;base64,${Buffer.alloc(800000).toString('base64')}` },
        { id: randomUUID(), walletId: localWallet, type: 'income', amountMinor: 200, categoryId: 'salary', note: 'Offline income', dateKey: '2026-11-12' }], reminders: [], preferences };
    const created = await asOwner(request(app).post('/api/backups')).send({ ...mobile, localData: payload, preferences });
    expect(created.status).toBe(201);
    const restored = await asOwner(request(app).post(`/api/backups/${created.body.backup.id}/restore`)).send({ ...laptop, preferences });
    expect(restored.status).toBe(200);
    const wallet = await WalletModel.findOne({ userId: owner }).lean();
    const tx = await TransactionModel.findOne({ userId: owner }).lean();
    expect(wallet!.balanceMinor).toBe(987600);
    expect(String(tx!.walletId)).toBe(String(wallet!._id));
    expect(await TransactionModel.countDocuments({ userId: owner })).toBe(2);
    for (let i = 0; i < 21; i++) await AccountBackupModel.create({ userId: owner, ...mobile, label: `Version ${i}`, walletCount: 0, transactionCount: 0, reminderCount: 0, sizeBytes: 2, payload: {} });
    const first = await history();
    expect(first.body.backups).toHaveLength(20);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await asOwner(request(app).get(`/api/backups?deviceId=${laptop.deviceId}&before=${first.body.nextCursor}`));
    const ids = [...first.body.backups, ...second.body.backups].map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect((await asOwner(request(app).post('/api/backups')).set('Content-Type', 'application/json').send(JSON.stringify({ data: 'x'.repeat(14 * 1024 * 1024) }))).status).toBe(413);
  });

  it('captures more than the regular transaction API limit and rolls back a failed restore', async () => {
    const wallet = await WalletModel.findOne({ userId: owner }).lean();
    await TransactionModel.insertMany(Array.from({ length: 505 }, (_, i) => ({ userId: owner, walletId: wallet!._id, type: 'expense', amountMinor: 100, note: `Older transaction ${i}`, categoryId: 'food', dateKey: '2026-10-10', transactionDate: new Date('2026-10-10T00:00:00Z'), idempotencyKey: `test:${i}` })));
    const created = await asOwner(request(app).post('/api/backups')).send({ ...mobile, preferences });
    expect(created.status).toBe(201);
    expect(created.body.backup.transactionCount).toBe(507);
    const originalCount = await AccountBackupModel.countDocuments({ userId: owner });
    const profileWrite = vi.spyOn(ProfileModel, 'updateOne').mockRejectedValueOnce(new Error('Simulated database write failure'));
    try {
      const failed = await asOwner(request(app).post(`/api/backups/${created.body.backup.id}/restore`)).send({ ...laptop, preferences });
      expect(failed.status).toBe(500);
      expect(await TransactionModel.countDocuments({ userId: owner })).toBe(507);
      expect(await AccountBackupModel.countDocuments({ userId: owner })).toBe(originalCount);
      expect(String((await WalletModel.findOne({ userId: owner }).lean())!._id)).toBe(String(wallet!._id));
    } finally { profileWrite.mockRestore(); }
  });
});
