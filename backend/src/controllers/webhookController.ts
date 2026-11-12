import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error.js';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';
import { WalletModel } from '../models/Wallet.js';
import { deletePrivateImage, saveBufferImage } from '../services/storageService.js';
import { BankWebhookError, bankCategory, bankWalletId, parseBankTransactions, verifyBankWebhook } from '../utils/bankWebhook.js';

function formatVND(amount: number): string {
  return amount.toLocaleString('vi-VN');
}

/**
 * Generate a stylish SVG receipt for MB Bank transactions
 */
function generateMbReceiptSvg(options: {
  amount: number;
  type: 'income' | 'expense';
  dateKey: string;
  timeStr: string;
  note: string;
  referenceCode: string;
  accountNumber?: string;
}): string {
  const isIncome = options.type === 'income';
  const sign = isIncome ? '+' : '−';
  const colorAccent = isIncome ? '#10b981' : '#f43f5e';
  const cleanNote = options.note.replace(/[<>&'"]/g, ' ').slice(0, 75);
  const cleanRef = options.referenceCode.replace(/[<>&'"]/g, '').slice(0, 30);
  const cleanAcc = (options.accountNumber || '•••• ••••').replace(/[<>&'"]/g, '').slice(0, 20);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 900" width="720" height="900">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#001844" />
      <stop offset="50%" stop-color="#002D72" />
      <stop offset="100%" stop-color="#0a1226" />
    </linearGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.14" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="720" height="900" fill="url(#bg)" />

  <!-- Ambient glowing orb -->
  <circle cx="640" cy="180" r="160" fill="#00A3E0" opacity="0.25" filter="url(#glow)" />
  <circle cx="80" cy="720" r="140" fill="${colorAccent}" opacity="0.2" filter="url(#glow)" />

  <!-- Decorative Top MB Star Brand Bar -->
  <rect x="0" y="0" width="720" height="12" fill="#00A3E0" />

  <!-- Header Card -->
  <g transform="translate(60, 60)">
    <!-- MB Logo Symbol -->
    <rect x="0" y="0" width="56" height="56" rx="14" fill="#00A3E0" />
    <path d="M 16 38 L 16 18 L 24 28 L 32 18 L 32 38 M 38 18 L 46 18 L 46 28 L 38 28 L 46 38" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />

    <text x="72" y="28" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="24" fill="#ffffff" letter-spacing="1.5">MB BANK</text>
    <text x="72" y="48" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="600" font-size="13" fill="#93c5fd" letter-spacing="0.5">NGÂN HÀNG QUÂN ĐỘI • BIÊN LAI ĐIỆN TỬ</text>

    <!-- Auto-Sync Badge -->
    <rect x="420" y="8" width="180" height="38" rx="19" fill="rgba(0, 163, 224, 0.22)" stroke="#00A3E0" stroke-width="1.5" />
    <text x="510" y="32" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="12" fill="#67e8f9" text-anchor="middle">⚡ MB BANK AUTO</text>
  </g>

  <!-- Main Amount Showcase Box -->
  <g transform="translate(60, 160)">
    <rect x="0" y="0" width="600" height="230" rx="24" fill="url(#cardGrad)" stroke="rgba(255, 255, 255, 0.18)" stroke-width="1.5" />
    
    <text x="40" y="48" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#94a3b8" letter-spacing="1">BIẾN ĐỘNG SỐ DƯ TỰ ĐỘNG</text>
    
    <text x="40" y="125" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="52" font-weight="900" fill="${colorAccent}">
      ${sign}${formatVND(options.amount)} <tspan font-size="32" font-weight="700">VND</tspan>
    </text>

    <!-- Sub status tag -->
    <rect x="40" y="160" width="130" height="32" rx="8" fill="${isIncome ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'}" />
    <text x="105" y="181" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="${colorAccent}" text-anchor="middle">
      ${isIncome ? 'TIỀN VÀO (+)' : 'TIỀN RA (−)'}
    </text>
    <text x="190" y="181" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="500" fill="#cbd5e1">
      Tài khoản: ${cleanAcc}
    </text>
  </g>

  <!-- Detailed Meta Grid -->
  <g transform="translate(60, 420)">
    <rect x="0" y="0" width="600" height="340" rx="20" fill="rgba(10, 18, 38, 0.65)" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1" />

    <!-- Row 1: Time -->
    <text x="36" y="50" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="500" fill="#94a3b8">Thời gian giao dịch</text>
    <text x="564" y="50" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="#ffffff" text-anchor="end">${options.timeStr} • ${options.dateKey}</text>
    <line x1="36" y1="78" x2="564" y2="78" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />

    <!-- Row 2: Reference Code -->
    <text x="36" y="118" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="500" fill="#94a3b8">Mã tham chiếu (Ref ID)</text>
    <text x="564" y="118" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="#38bdf8" text-anchor="end">${cleanRef}</text>
    <line x1="36" y1="146" x2="564" y2="146" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />

    <!-- Row 3: Description -->
    <text x="36" y="186" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="500" fill="#94a3b8">Nội dung giao dịch</text>
    <text x="36" y="222" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" fill="#f8fafc">${cleanNote || 'Thanh toán qua MB Bank'}</text>
    <line x1="36" y1="254" x2="564" y2="254" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />

    <!-- Row 4: Source Info -->
    <text x="36" y="294" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="500" fill="#94a3b8">Kênh tích hợp</text>
    <text x="564" y="294" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="#a78bfa" text-anchor="end">Webhook API (Real-time)</text>
  </g>

  <!-- Footer Tip -->
  <g transform="translate(60, 800)">
    <rect x="0" y="0" width="600" height="54" rx="14" fill="rgba(0, 163, 224, 0.12)" stroke="rgba(0, 163, 224, 0.3)" stroke-width="1" />
    <text x="300" y="32" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="600" fill="#7dd3fc" text-anchor="middle">
      📸 Chạm vào giao dịch trên CapMoney để chụp hoặc đổi ảnh bill thực tế
    </text>
  </g>
</svg>
`.trim();
}

/**
 * Handle Webhook from MB Bank (via SePay, Casso, or custom notification forwarder)
 */
export const handleMbBankWebhook: RequestHandler = async (request, response) => {
  try {
    verifyBankWebhook(request.headers, env.SEPAY_WEBHOOK_SECRET || env.MBBANK_WEBHOOK_SECRET);
    const transactions = parseBankTransactions(request.body);
    if ((!env.MBBANK_USER_ID && !env.MBBANK_USER_EMAIL) || !env.MBBANK_ACCOUNT_NUMBER) {
      throw new AppError(503, 'Chưa cấu hình người dùng và số tài khoản MB Bank trên máy chủ.', 'BANK_ACCOUNT_NOT_CONFIGURED');
    }
    if (transactions.some(tx => tx.accountNumber !== env.MBBANK_ACCOUNT_NUMBER)) {
      throw new AppError(403, 'Số tài khoản không khớp tài khoản MB Bank đã liên kết.', 'BANK_ACCOUNT_MISMATCH');
    }
    const user = await UserModel.findOne({
      status: 'active',
      ...(env.MBBANK_USER_ID && mongoose.isValidObjectId(env.MBBANK_USER_ID)
        ? { _id: env.MBBANK_USER_ID }
        : { email: env.MBBANK_USER_EMAIL?.trim().toLowerCase() }),
    }).lean();
    if (!user) throw new AppError(404, 'Không tìm thấy tài khoản CapMoney đã cấu hình.', 'USER_NOT_FOUND');
    const userId = user._id;
    const bankId = new mongoose.Types.ObjectId(bankWalletId(String(userId), env.MBBANK_ACCOUNT_NUMBER));
    let wallet = await WalletModel.findOne({ userId, active: true, type: 'bank', $or: [{ _id: bankId }, { name: /^MB Bank$/i }] });
    if (!wallet) {
      wallet = await WalletModel.findOneAndUpdate(
        { _id: bankId, userId, active: true },
        { $setOnInsert: { userId, name: 'MB Bank', type: 'bank', balanceMinor: 0, currency: 'VND', color: '#002D72', active: true } },
        { upsert: true, returnDocument: 'after', runValidators: true },
      );
    }
    if (!wallet) throw new AppError(503, 'Chưa tạo được ví MB Bank.', 'BANK_WALLET_UNAVAILABLE');
    const walletId = wallet._id;
    const session = await mongoose.startSession();
    const imageKeys: string[] = [];
    let results: Array<{ id: string; amount: number; type: string; dateKey: string; transactionTime: string; referenceCode: string; duplicate: boolean }> = [];
    try {
      await session.withTransaction(async () => {
        results = [];
        for (const tx of transactions) {
          const existing = await TransactionModel.findOne({ userId, idempotencyKey: { $in: [tx.idempotencyKey, tx.referenceCode] } }).session(session).lean();
          if (existing) {
            results.push({ id: String(existing._id), amount: existing.amountMinor / 100, type: existing.type, dateKey: existing.dateKey, transactionTime: existing.transactionTime || '', referenceCode: tx.referenceCode, duplicate: true });
            continue;
          }
          const image = await saveBufferImage(Buffer.from(generateMbReceiptSvg(tx), 'utf-8'), 'image/svg+xml', '.svg');
          imageKeys.push(image.key);
          const [created] = await TransactionModel.create([{
            userId, walletId, type: tx.type, amountMinor: tx.amountMinor,
            currency: 'VND', note: tx.note || (tx.type === 'income' ? 'Nhận tiền MB Bank' : 'Chi tiêu MB Bank'),
            categoryId: bankCategory(tx.note, tx.type), transactionDate: tx.dateObj, dateKey: tx.dateKey,
            transactionTime: tx.timeStr, source: 'webhook_mbbank', status: 'posted', idempotencyKey: tx.idempotencyKey,
            imageKey: image.key, imageMimeType: image.mimetype, imageSize: image.size,
          }], { session });
          await WalletModel.updateOne({ _id: walletId, userId }, { $inc: { balanceMinor: tx.type === 'income' ? tx.amountMinor : -tx.amountMinor } }, { session });
          results.push({ id: String(created._id), amount: tx.amount, type: tx.type, dateKey: tx.dateKey, transactionTime: tx.timeStr, referenceCode: tx.referenceCode, duplicate: false });
        }
      });
    } catch (error) {
      await Promise.all(imageKeys.map(key => deletePrivateImage(key)));
      // A concurrent delivery can commit the same reference before this request.
      if ((error as { code?: number }).code !== 11000) throw error;
      const existing = await TransactionModel.find({ userId, idempotencyKey: { $in: transactions.map(tx => tx.idempotencyKey) } }).lean();
      if (existing.length !== new Set(transactions.map(tx => tx.idempotencyKey)).size) throw error;
      results = transactions.map(tx => {
        const row = existing.find(item => item.idempotencyKey === tx.idempotencyKey)!;
        return { id: String(row._id), amount: row.amountMinor / 100, type: row.type, dateKey: row.dateKey, transactionTime: row.transactionTime || '', referenceCode: tx.referenceCode, duplicate: true };
      });
    } finally {
      await session.endSession();
    }
    // withTransaction may retry; remove receipt files belonging to aborted attempts.
    if (imageKeys.length) {
      const used = await TransactionModel.find({ userId, imageKey: { $in: imageKeys } }).select('imageKey').lean();
      const keep = new Set(used.map(row => row.imageKey));
      await Promise.all(imageKeys.filter(key => !keep.has(key)).map(key => deletePrivateImage(key)));
    }
    response.status(200).json({ success: true, message: 'Đã ghi nhận giao dịch MB Bank.', transaction: results[0], transactions: results });
  } catch (error) {
    if (error instanceof BankWebhookError) throw new AppError(error.status, error.message, error.code);
    throw error;
  }
};
