/**
 * Vercel Serverless Function: MBBank / SePay Webhook
 * POST /api/webhooks/mbbank
 *
 * Receives transaction notifications from SePay/Casso and stores them
 * directly in MongoDB Atlas — no Express, no ntfy.sh.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { BankWebhookError, bankCategory, bankWalletId, parseBankTransactions, verifyBankWebhook } from '../utils/bankWebhook.js';

// ─── Mongoose models (inline to keep this file self-contained) ─────────────
const TransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
    categoryId: { type: String, trim: true, maxlength: 60 },
    type: { type: String, enum: ['income', 'expense', 'transfer'], required: true },
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'VND' },
    note: { type: String, trim: true, maxlength: 500 },
    imageKey: { type: String, maxlength: 180 },
    transactionDate: { type: Date, required: true },
    dateKey: { type: String, required: true, index: true },
    transactionTime: { type: String, maxlength: 20 },
    source: { type: String, enum: ['manual', 'camera', 'webhook_mbbank'], default: 'manual' },
    status: { type: String, enum: ['posted', 'planned', 'cancelled'], default: 'posted' },
    idempotencyKey: { type: String, maxlength: 120 },
  },
  { timestamps: true, collection: 'transactions' },
);
TransactionSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

const WalletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    type: { type: String, default: 'bank' },
    balanceMinor: { type: Number, default: 0 },
    currency: { type: String, default: 'VND' },
    color: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'wallets' },
);

const UserSchema = new mongoose.Schema(
  { email: { type: String, required: true, unique: true }, status: String },
  { timestamps: true, collection: 'users' },
);

// Re-use models if already compiled (Vercel warm-start)
const Transaction: mongoose.Model<any> = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
const Wallet: mongoose.Model<any> = mongoose.models.Wallet || mongoose.model('Wallet', WalletSchema);
const User: mongoose.Model<any> = mongoose.models.User || mongoose.model('User', UserSchema);

// ─── DB connection (cached across warm invocations) ────────────────────────
let cachedConn: typeof mongoose | null = null;

async function connectDB() {
  if (cachedConn && mongoose.connection.readyState === 1) return cachedConn;
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI env var is not set');
  cachedConn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 4500,
    connectTimeoutMS: 4500,
    socketTimeoutMS: 4500,
  });
  return cachedConn;
}

// ─── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return res.status(200).json({ status: 'ok', service: 'CapMoney MBBank Webhook API' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }
  try {
    verifyBankWebhook(req.headers, process.env.SEPAY_WEBHOOK_SECRET || process.env.MBBANK_WEBHOOK_SECRET);
    const transactions = parseBankTransactions(req.body);
    const configuredUser = process.env.MBBANK_USER_ID;
    const configuredEmail = process.env.MBBANK_USER_EMAIL?.trim().toLowerCase();
    const accountNumber = process.env.MBBANK_ACCOUNT_NUMBER;
    if ((!configuredUser && !configuredEmail) || !accountNumber) {
      throw new BankWebhookError(503, 'BANK_ACCOUNT_NOT_CONFIGURED', 'Chưa cấu hình người dùng và số tài khoản MB Bank.');
    }
    if (transactions.some(tx => tx.accountNumber !== accountNumber)) {
      throw new BankWebhookError(403, 'BANK_ACCOUNT_MISMATCH', 'Số tài khoản không khớp tài khoản đã liên kết.');
    }
    await connectDB();
    const user: any = await User.findOne({
      status: 'active',
      ...(configuredUser && mongoose.isValidObjectId(configuredUser) ? { _id: configuredUser } : { email: configuredEmail }),
    }).lean();
    if (!user) throw new BankWebhookError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản CapMoney đã cấu hình.');
    const userId = user._id;
    const bankId = new mongoose.Types.ObjectId(bankWalletId(String(userId), accountNumber));
    let wallet: any = await Wallet.findOne({ userId, active: true, type: 'bank', $or: [{ _id: bankId }, { name: /^MB Bank$/i }] });
    if (!wallet) {
      wallet = await Wallet.findOneAndUpdate(
        { _id: bankId, userId, active: true },
        { $setOnInsert: { userId, name: 'MB Bank', type: 'bank', balanceMinor: 0, currency: 'VND', color: '#002D72', active: true } },
        { upsert: true, returnDocument: 'after', runValidators: true },
      );
    }
    const session = await mongoose.startSession();
    let results: any[] = [];
    try {
      await session.withTransaction(async () => {
        results = [];
        for (const tx of transactions) {
          const existing: any = await Transaction.findOne({ userId, idempotencyKey: { $in: [tx.idempotencyKey, tx.referenceCode] } }).session(session).lean();
          if (existing) {
            results.push({ id: String(existing._id), amount: existing.amountMinor / 100, type: existing.type, dateKey: existing.dateKey, transactionTime: existing.transactionTime, referenceCode: tx.referenceCode, duplicate: true });
            continue;
          }
          const [created] = await Transaction.create([{
            userId, walletId: wallet._id, type: tx.type, amountMinor: tx.amountMinor, currency: 'VND',
            note: tx.note || (tx.type === 'income' ? 'Nhận tiền MB Bank' : 'Chi tiêu MB Bank'),
            categoryId: bankCategory(tx.note, tx.type), transactionDate: tx.dateObj, dateKey: tx.dateKey,
            transactionTime: tx.timeStr, source: 'webhook_mbbank', status: 'posted', idempotencyKey: tx.idempotencyKey,
          }], { session });
          await Wallet.updateOne({ _id: wallet._id, userId }, { $inc: { balanceMinor: tx.type === 'income' ? tx.amountMinor : -tx.amountMinor } }, { session });
          results.push({ id: String(created._id), amount: tx.amount, type: tx.type, dateKey: tx.dateKey, transactionTime: tx.timeStr, referenceCode: tx.referenceCode, duplicate: false });
        }
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const existing = await Transaction.find({ userId, idempotencyKey: { $in: transactions.map(tx => tx.idempotencyKey) } }).lean();
      if (existing.length !== new Set(transactions.map(tx => tx.idempotencyKey)).size) throw error;
      results = transactions.map(tx => {
        const row = existing.find(item => item.idempotencyKey === tx.idempotencyKey)!;
        return { id: String(row._id), amount: row.amountMinor / 100, type: row.type, dateKey: row.dateKey, transactionTime: row.transactionTime, referenceCode: tx.referenceCode, duplicate: true };
      });
    } finally { await session.endSession(); }
    return res.status(200).json({ success: true, transaction: results[0], transactions: results });
  } catch (error) {
    if (error instanceof BankWebhookError) return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[mbbank webhook] Failed to persist bank transaction', detail);
    const safeDetail = detail.replace(/mongodb(?:\+srv)?:\/\/\S+/gi, 'mongodb://<redacted>').slice(0, 260);
    return res.status(503).json({ success: false, error: { code: 'WEBHOOK_PERSIST_FAILED', message: 'Chưa lưu được giao dịch. Vui lòng gửi lại webhook.', detail: safeDetail } });
  }
}
