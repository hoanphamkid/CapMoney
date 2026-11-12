import express, { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { AccountBackupModel, BackupActivityModel, BackupDeviceModel } from '../models/AccountBackup.js';
import { WalletModel } from '../models/Wallet.js';
import { TransactionModel } from '../models/Transaction.js';
import { CalendarReminderModel } from '../models/CalendarReminder.js';
import { ProfileModel } from '../models/Profile.js';
import { UserModel } from '../models/User.js';
import { backupPayloadSchema, backupSummary, captureAccount, newId, preferencesSchema, storeBackup } from '../services/backupService.js';
import { deletePrivateImage, savePrivateImage } from '../services/storageService.js';

const deviceSchema = z.object({ deviceId: z.string().uuid(), deviceName: z.string().trim().min(1).max(80) });
const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const backupsRouter = Router();
backupsRouter.use(requireAuth);
backupsRouter.use(express.json({ limit: '13mb' }));
backupsRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

backupsRouter.get('/', async (req, res) => {
  const query = z.object({ deviceId: z.string().uuid(), before: idSchema.optional() }).parse(req.query);
  const userId = req.user!.id;
  const rows = await AccountBackupModel.find({ userId, ...(query.before ? { _id: { $lt: query.before } } : {}) }).sort({ _id: -1 }).limit(21).lean();
  const current = await BackupDeviceModel.findOne({ userId, deviceId: query.deviceId }).select('-preferences').lean();
  const events = await BackupActivityModel.find({ userId }).sort({ _id: -1 }).limit(20).lean();
  res.json({ backups: rows.slice(0, 20).map(backupSummary), nextCursor: rows.length > 20 ? String(rows[19]._id) : null,
    lastApplied: current ? { backupId: String(current.backupId), appliedAt: current.appliedAt } : null,
    activities: events.map(e => ({ id: String(e._id), backupId: String(e.backupId), deviceName: e.deviceName, appliedAt: e.createdAt })) });
});

backupsRouter.post('/', async (req, res) => {
  const input = deviceSchema.extend({ label: z.string().trim().max(80).default(''), preferences: preferencesSchema, localData: backupPayloadSchema.optional() }).parse(req.body);
  const userId = req.user!.id;
  const session = await mongoose.startSession();
  let summary;
  try {
    await session.withTransaction(async () => {
      const payload = input.localData ?? await captureAccount(userId, input.preferences, session);
      summary = backupSummary(await storeBackup(userId, payload, { deviceId: input.deviceId, deviceName: input.deviceName, label: input.label }, session));
    });
  } finally { await session.endSession(); }
  res.status(201).json({ backup: summary });
});

backupsRouter.post('/:id/restore', async (req, res) => {
  const backupId = idSchema.parse(req.params.id);
  const input = deviceSchema.extend({ preferences: preferencesSchema }).parse(req.body);
  const userId = req.user!.id;
  const backup = await AccountBackupModel.findOne({ _id: backupId, userId }).select('+payload').lean();
  if (!backup) throw new AppError(404, 'Không tìm thấy bản sao trong tài khoản này.', 'BACKUP_NOT_FOUND');
  const payload = backupPayloadSchema.parse(backup.payload);
  const walletIds = new Map(payload.wallets.map(w => [w.id, newId()]));
  const preparedImages = new Map<string, { key: string; mimetype: string; size: number }>();
  const savedKeys: string[] = [];
  const session = await mongoose.startSession();
  let committed = false;
  let safetyBackupId = '';
  const appliedAt = new Date();
  try {
    // Images are prepared before the database transaction; failed restores remove these files.
    for (const tx of payload.transactions) {
      if (!tx.image) continue;
      const split = tx.image.indexOf(',');
      const mimetype = tx.image.slice(5, split - 7);
      const bytes = Buffer.from(tx.image.slice(split + 1), 'base64');
      const extension = mimetype === 'image/svg+xml' ? 'svg' : mimetype.split('/')[1];
      const key = await savePrivateImage({ buffer: bytes, mimetype, originalname: `backup.${extension}` });
      savedKeys.push(key);
      preparedImages.set(tx.id, { key, mimetype, size: bytes.length });
    }
    await session.withTransaction(async () => {
      const before = await captureAccount(userId, input.preferences, session);
      const safety = await storeBackup(userId, before, { deviceId: input.deviceId, deviceName: input.deviceName, kind: 'before_restore', label: 'Tự lưu trước khi khôi phục' }, session);
      safetyBackupId = String(safety._id);
      await TransactionModel.deleteMany({ userId }, { session });
      await WalletModel.deleteMany({ userId }, { session });
      await CalendarReminderModel.deleteMany({ userId }, { session });
      if (payload.wallets.length) await WalletModel.insertMany(payload.wallets.map(({ id, ...w }) => ({ ...w, _id: walletIds.get(id), userId })), { session });
      if (payload.transactions.length) await TransactionModel.insertMany(payload.transactions.map(({ id, image: _image, walletId, toWalletId, createdAt, ...tx }) => {
        const photo = preparedImages.get(id);
        return { ...tx, _id: newId(), userId, idempotencyKey: `backup:${id}`, walletId: walletId ? walletIds.get(walletId) : undefined,
          toWalletId: toWalletId ? walletIds.get(toWalletId) : undefined,
          transactionDate: new Date(`${tx.dateKey}T${tx.transactionTime?.length === 5 ? `${tx.transactionTime}:00` : tx.transactionTime ?? '00:00:00'}.000Z`),
          ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
          ...(photo ? { imageKey: photo.key, imageMimeType: photo.mimetype, imageSize: photo.size } : {}),
        };
      }), { session });
      if (payload.reminders.length) await CalendarReminderModel.insertMany(payload.reminders.map(({ id: _id, ...r }) => ({ ...r, userId })), { session });
      await UserModel.updateOne({ _id: userId }, { $set: payload.account }, { session });
      await ProfileModel.updateOne({ userId }, { $set: payload.profile }, { upsert: true, session });
      await BackupDeviceModel.updateOne({ userId, deviceId: input.deviceId }, { $set: { backupId, appliedAt, preferences: payload.preferences } }, { upsert: true, session });
      await BackupActivityModel.create([{ userId, deviceId: input.deviceId, deviceName: input.deviceName, backupId }], { session });
    });
    committed = true;
  } finally {
    await session.endSession();
    if (!committed) await Promise.all(savedKeys.map(key => deletePrivateImage(key)));
  }
  res.json({ backup: backupSummary(backup), appliedAt, safetyBackupId, preferences: payload.preferences });
});

// Allows retrying browser settings if a restore succeeded but the response was lost.
backupsRouter.get('/device', async (req, res) => {
  const deviceId = z.string().uuid().parse(req.query.deviceId);
  const state = await BackupDeviceModel.findOne({ userId: req.user!.id, deviceId }).lean();
  res.json({ state: state ? { backupId: String(state.backupId), appliedAt: state.appliedAt, preferences: state.preferences } : null });
});
