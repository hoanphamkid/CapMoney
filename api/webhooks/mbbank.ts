/**
 * Vercel Serverless Function: MBBank / SePay Webhook
 * POST /api/webhooks/mbbank
 *
 * Receives transaction notifications from SePay/Casso and stores them
 * directly in MongoDB Atlas — no Express, no ntfy.sh.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';

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
  { email: { type: String, required: true, unique: true } },
  { timestamps: true, collection: 'users' },
);

// Re-use models if already compiled (Vercel warm-start)
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', WalletSchema);
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// ─── DB connection (cached across warm invocations) ────────────────────────
let cachedConn: typeof mongoose | null = null;

async function connectDB() {
  if (cachedConn && mongoose.connection.readyState === 1) return cachedConn;
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI env var is not set');
  cachedConn = await mongoose.connect(uri);
  return cachedConn;
}

// ─── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-webhook-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'CapMoney MBBank Webhook API',
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Verify secret key
    const configuredSecret = process.env.MBBANK_WEBHOOK_SECRET || 'capmoney_mbbank_secret_key_2026';
    const authHeader = req.headers['authorization'];
    const apiKeyHeader = req.headers['x-api-key'] || req.headers['x-webhook-secret'];
    const querySecret = req.query.apiKey || req.query.secret;

    let providedKey = '';
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      providedKey = authHeader.slice(7).trim();
    } else if (typeof apiKeyHeader === 'string') {
      providedKey = apiKeyHeader.trim();
    } else if (typeof querySecret === 'string') {
      providedKey = querySecret.trim();
    }

    if (configuredSecret && providedKey !== configuredSecret) {
      return res.status(401).json({ error: 'Webhook Secret không hợp lệ' });
    }

    // 2. Parse payload (SePay / Casso / generic)
    const body = req.body || {};
    let rawAmount = 0;
    let type: 'income' | 'expense' = 'expense';
    let note = '';
    let referenceCode = '';
    let accountNumber = '';
    let transactionDateTimeStr = '';

    if ('gateway' in body || 'amountIn' in body || 'amountOut' in body || 'transferAmount' in body) {
      // SePay format
      const amountIn = Number(body.amountIn) || 0;
      const amountOut = Number(body.amountOut) || 0;
      rawAmount = amountIn > 0 ? amountIn : (amountOut > 0 ? amountOut : Number(body.transferAmount) || 0);
      type = amountIn > 0 ? 'income' : 'expense';
      note = String(body.transactionContent || body.content || body.description || '').trim();
      referenceCode = String(body.referenceNumber || body.referenceCode || body.id || `MB_${Date.now()}`);
      accountNumber = String(body.accountNumber || body.subAccount || '');
      transactionDateTimeStr = String(body.transactionDate || '');
    } else if (Array.isArray(body.data) && body.data.length > 0) {
      // Casso format
      const item = body.data[0];
      const val = Number(item.amount) || 0;
      rawAmount = Math.abs(val);
      type = val >= 0 ? 'income' : 'expense';
      note = String(item.description || '').trim();
      referenceCode = String(item.tid || item.id || `CASSO_${Date.now()}`);
      accountNumber = String(item.subAccId || item.accountNumber || '');
      transactionDateTimeStr = String(item.when || '');
    } else {
      // Generic format
      rawAmount = Math.abs(Number(body.amount) || Number(body.money) || 0);
      const rawType = String(body.type || '').toLowerCase();
      type = rawType === 'income' || rawType === 'in' || (Number(body.amountIn) || 0) > 0 ? 'income' : 'expense';
      note = String(body.description || body.content || body.note || body.message || '').trim();
      referenceCode = String(body.referenceCode || body.refCode || body.id || body.code || `MB_${Date.now()}`);
      accountNumber = String(body.accountNumber || body.subAccount || '');
      transactionDateTimeStr = String(body.transaction_time || body.transactionTime || body.date || '');
    }

    if (rawAmount <= 0) {
      return res.status(200).json({ success: true, message: 'Số tiền bằng 0 — bỏ qua (ping)' });
    }

    // 3. Date / time
    let dateObj = new Date();
    if (transactionDateTimeStr) {
      const parsed = new Date(transactionDateTimeStr);
      if (!isNaN(parsed.getTime())) dateObj = parsed;
    }
    const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    const timeStr = dateObj.toTimeString().slice(0, 8);

    // 4. Connect to MongoDB
    await connectDB();

    // 5. Resolve user (explicit userId → first user)
    let targetUser: any = null;
    const explicitUserId = (req.query.userId as string) || (body.userId as string);
    if (explicitUserId && mongoose.isValidObjectId(explicitUserId)) {
      targetUser = await User.findById(explicitUserId);
    }
    if (!targetUser) {
      targetUser = await User.findOne().sort({ createdAt: 1 });
    }
    if (!targetUser) {
      return res.status(404).json({ error: 'Chưa có người dùng nào trong hệ thống' });
    }

    const userId = targetUser._id;

    // 6. Idempotency check
    const existing = await Transaction.findOne({ userId, idempotencyKey: referenceCode }).lean();
    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Giao dịch đã được ghi nhận trước đó',
        referenceCode,
      });
    }

    // 7. Find or create MB Bank wallet
    let wallet: any = await Wallet.findOne({ userId, active: true, $or: [{ name: /MB/i }, { type: 'bank' }] });
    if (!wallet) {
      wallet = await Wallet.create({ userId, name: 'MB Bank', type: 'bank', balanceMinor: 0, currency: 'VND', color: '#002D72', active: true });
    }

    // 8. Auto-categorise
    let categoryId = 'bills';
    const lowerNote = note.toLowerCase();
    if (/cơm|phở|bún|ăn|uống|cf|cafe|cà phê|trà sữa|highlands|starbucks|food|grabfood|shopeefood/i.test(lowerNote)) categoryId = 'food';
    else if (/grab|be|xăng|taxi|giao thông|vé xe|vé tàu|vé máy bay/i.test(lowerNote)) categoryId = 'transport';
    else if (/mua|shopee|lazada|tiki|tiktok|quần áo|siêu thị|mart/i.test(lowerNote)) categoryId = 'shopping';
    else if (/lương|thu nhập|bonus|thưởng|tiền về/i.test(lowerNote)) categoryId = 'salary';

    // 9. Save transaction + update wallet balance (atomic)
    const amountMinor = Math.round(rawAmount * 100);
    const session = await mongoose.startSession();
    let createdTx: any;
    try {
      await session.withTransaction(async () => {
        [createdTx] = await Transaction.create(
          [{
            userId,
            walletId: wallet._id,
            type,
            amountMinor,
            currency: 'VND',
            note: note || (type === 'income' ? 'Nhận tiền MB Bank' : 'Chi tiêu MB Bank'),
            categoryId,
            transactionDate: dateObj,
            dateKey,
            transactionTime: timeStr,
            source: 'webhook_mbbank',
            idempotencyKey: referenceCode,
            status: 'posted',
          }],
          { session },
        );
        const delta = type === 'income' ? amountMinor : -amountMinor;
        await Wallet.updateOne({ _id: wallet._id }, { $inc: { balanceMinor: delta } }, { session });
      });
    } finally {
      session.endSession();
    }

    return res.status(201).json({
      success: true,
      message: 'Đã tự động đồng bộ giao dịch từ MB Bank',
      transaction: {
        id: String(createdTx._id),
        amount: rawAmount,
        type,
        note: createdTx.note,
        dateKey,
        transactionTime: timeStr,
        source: 'webhook_mbbank',
        referenceCode,
        walletName: wallet.name,
      },
    });
  } catch (err: any) {
    console.error('[mbbank webhook error]', err);
    return res.status(500).json({ success: false, message: err?.message || 'Lỗi server' });
  }
}
