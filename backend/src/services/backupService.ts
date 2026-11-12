import mongoose, { type ClientSession } from 'mongoose';
import { z } from 'zod';
import { AppError } from '../middleware/error.js';
import { AccountBackupModel } from '../models/AccountBackup.js';
import { WalletModel } from '../models/Wallet.js';
import { TransactionModel } from '../models/Transaction.js';
import { CalendarReminderModel } from '../models/CalendarReminder.js';
import { ProfileModel } from '../models/Profile.js';
import { UserModel } from '../models/User.js';
import { readPrivateImage } from './storageService.js';

export const PREFERENCE_KEYS = [
  'capmoney_budget_v1', 'capmoney_savings_jar_v1', 'capmoney_debts_v1',
  'capmoney_subscriptions_v1', 'capmoney_challenge30_v1', 'capmoney-theme',
  'capmoney-remind-record', 'capmoney-remind-bill',
  'capmoney_work_pay_v1',
] as const;
export const preferencesSchema = z.object(Object.fromEntries(PREFERENCE_KEYS.map(key => [key, z.string().max(500_000).nullable().optional()])));
const identifier = z.string().min(1).max(100);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Ngày không hợp lệ');
const timestamp = z.string().datetime().optional();
const minor = z.number().int().safe();
export const backupPayloadSchema = z.object({
  version: z.literal(1),
  account: z.object({ name: z.string().trim().min(2).max(80), phone: z.string().max(24).default('') }),
  profile: z.object({ locale: z.string().max(16), currency: z.string().length(3), timezone: z.string().max(64) }),
  wallets: z.array(z.object({
    id: identifier, name: z.string().trim().min(1).max(80),
    type: z.enum(['cash', 'bank', 'savings', 'e_wallet', 'credit', 'custom']),
    balanceMinor: minor, currency: z.string().length(3), color: z.string().regex(/^#[0-9a-f]{6}$/i), active: z.boolean(),
  })).max(2000),
  transactions: z.array(z.object({
    id: identifier, walletId: identifier.optional(), toWalletId: identifier.optional(),
    categoryId: z.string().max(60), type: z.enum(['income', 'expense', 'transfer']),
    amountMinor: minor.positive(), currency: z.string().length(3).default('VND'),
    note: z.string().max(500), dateKey,
    transactionTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/).optional(),
    source: z.enum(['manual', 'camera', 'webhook_mbbank']).default('manual'),
    status: z.enum(['posted', 'planned', 'cancelled']).default('posted'),
    image: z.string().regex(/^data:image\/(?:jpeg|png|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/).max(12_000_000).optional(),
    createdAt: timestamp,
  })).max(50000),
  reminders: z.array(z.object({
    id: identifier, title: z.string().min(1).max(120), note: z.string().max(500).default(''), dateKey,
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    kind: z.enum(['reminder', 'payment', 'income']).default('reminder'),
    status: z.enum(['pending', 'paid', 'cancelled']).default('pending'),
    repeat: z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly']).default('none'),
    channels: z.array(z.string().max(40)).max(10).default(['in_app']),
  })).max(10000),
  preferences: preferencesSchema,
}).superRefine((data, context) => {
  for (const [key, rows] of Object.entries({ wallets: data.wallets, transactions: data.transactions, reminders: data.reminders })) {
    if (new Set(rows.map(row => row.id)).size !== rows.length) context.addIssue({ code: 'custom', message: 'Mã dữ liệu bị trùng', path: [key] });
  }
  const walletIds = new Set(data.wallets.map(w => w.id));
  data.transactions.forEach((tx, index) => {
    if ((tx.walletId && !walletIds.has(tx.walletId)) || (tx.toWalletId && !walletIds.has(tx.toWalletId))) {
      context.addIssue({ code: 'custom', message: 'Không tìm thấy ví của giao dịch', path: ['transactions', index] });
    }
    if (tx.type === 'transfer' && (!tx.walletId || !tx.toWalletId || tx.walletId === tx.toWalletId)) {
      context.addIssue({ code: 'custom', message: 'Chuyển tiền cần hai ví khác nhau', path: ['transactions', index] });
    }
  });
});
export type BackupPayload = z.infer<typeof backupPayloadSchema>;

export async function captureAccount(userId: string, preferences: Record<string, unknown>, session?: ClientSession): Promise<BackupPayload> {
  // A session cannot run concurrent commands inside a transaction.
  const user = await UserModel.findById(userId).session(session ?? null).lean();
  const profile = await ProfileModel.findOne({ userId }).session(session ?? null).lean();
  const wallets = await WalletModel.find({ userId }).session(session ?? null).lean();
  const transactions = await TransactionModel.find({ userId }).session(session ?? null).lean();
  const reminders = await CalendarReminderModel.find({ userId }).session(session ?? null).lean();
  if (!user) throw new AppError(404, 'Không tìm thấy tài khoản', 'USER_NOT_FOUND');
  const txs = [];
  for (const tx of transactions) {
    let image: string | undefined;
    if (tx.imageKey) {
      try {
        const bytes = await readPrivateImage(tx.imageKey);
        image = `data:${tx.imageMimeType ?? 'image/jpeg'};base64,${bytes.toString('base64')}`;
      } catch {
        throw new AppError(409, 'Một ảnh giao dịch không còn trên máy chủ. Hãy cập nhật ảnh trước khi tạo bản sao.', 'BACKUP_IMAGE_MISSING');
      }
    }
    txs.push({
      id: String(tx._id), walletId: tx.walletId ? String(tx.walletId) : undefined,
      toWalletId: tx.toWalletId ? String(tx.toWalletId) : undefined,
      categoryId: tx.categoryId ?? 'other', type: tx.type, amountMinor: tx.amountMinor, currency: tx.currency,
      note: tx.note ?? '', dateKey: tx.dateKey, transactionTime: tx.transactionTime || undefined,
      source: tx.source, status: tx.status, image, createdAt: tx.createdAt?.toISOString(),
    });
  }
  return backupPayloadSchema.parse({
    version: 1, account: { name: user.name, phone: user.phone ?? '' },
    profile: { locale: profile?.locale ?? 'vi-VN', currency: profile?.currency ?? 'VND', timezone: profile?.timezone ?? 'Asia/Ho_Chi_Minh' },
    wallets: wallets.map(w => ({ id: String(w._id), name: w.name, type: w.type, balanceMinor: w.balanceMinor, currency: w.currency, color: w.color, active: w.active })),
    transactions: txs,
    reminders: reminders.map(r => ({ id: String(r._id), title: r.title, note: r.note ?? '', dateKey: r.dateKey, time: r.time || undefined, kind: r.kind, status: r.status, repeat: r.repeat, channels: r.channels })),
    preferences,
  });
}

export async function storeBackup(userId: string, payload: BackupPayload, metadata: { deviceId: string; deviceName: string; label?: string; kind?: 'manual' | 'before_restore' }, session?: ClientSession) {
  const sizeBytes = Buffer.byteLength(JSON.stringify(payload));
  if (sizeBytes > 12 * 1024 * 1024) throw new AppError(413, 'Bản sao vượt quá 12MB. Hãy giảm kích thước ảnh giao dịch.', 'BACKUP_TOO_LARGE');
  const [backup] = await AccountBackupModel.create([{
    userId, ...metadata, walletCount: payload.wallets.length, transactionCount: payload.transactions.length,
    reminderCount: payload.reminders.length, sizeBytes, payload,
  }], { session });
  return backup;
}

export function backupSummary(row: any) {
  return { id: String(row._id), deviceId: row.deviceId, deviceName: row.deviceName, label: row.label, kind: row.kind,
    walletCount: row.walletCount, transactionCount: row.transactionCount, reminderCount: row.reminderCount,
    sizeBytes: row.sizeBytes, createdAt: row.createdAt };
}

export function newId() { return new mongoose.Types.ObjectId(); }
