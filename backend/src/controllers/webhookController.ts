import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error.js';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';
import { WalletModel } from '../models/Wallet.js';
import { saveBufferImage } from '../services/storageService.js';

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
  // 1. Verify Secret Key
  const authHeader = request.headers['authorization'];
  const apiKeyHeader = request.headers['x-api-key'] || request.headers['x-webhook-secret'];
  const querySecret = request.query.apiKey || request.query.secret;

  let providedKey = '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    providedKey = authHeader.slice(7).trim();
  } else if (typeof apiKeyHeader === 'string') {
    providedKey = apiKeyHeader.trim();
  } else if (typeof querySecret === 'string') {
    providedKey = querySecret.trim();
  }

  const configuredSecret = env.MBBANK_WEBHOOK_SECRET;
  if (configuredSecret && providedKey !== configuredSecret) {
    throw new AppError(401, 'Webhook Secret không hợp lệ. Vui lòng kiểm tra MBBANK_WEBHOOK_SECRET', 'INVALID_WEBHOOK_SECRET');
  }

  // 2. Parse Incoming Payload
  const body = request.body || {};
  let rawAmount = 0;
  let type: 'income' | 'expense' = 'expense';
  let note = '';
  let referenceCode = '';
  let accountNumber = '';
  let transactionDateTimeStr = '';

  // Case A: SePay Payload
  if ('gateway' in body || 'amountIn' in body || 'amountOut' in body) {
    const amountIn = Number(body.amountIn) || 0;
    const amountOut = Number(body.amountOut) || 0;
    if (amountIn > 0) {
      rawAmount = amountIn;
      type = 'income';
    } else {
      rawAmount = amountOut > 0 ? amountOut : Number(body.transferAmount) || 0;
      type = 'expense';
    }
    note = String(body.transactionContent || body.content || body.description || '').trim();
    referenceCode = String(body.referenceNumber || body.referenceCode || body.id || `MB_${Date.now()}`);
    accountNumber = String(body.accountNumber || body.subAccount || '');
    transactionDateTimeStr = String(body.transactionDate || '');
  }
  // Case B: Casso Payload (data array)
  else if (Array.isArray(body.data) && body.data.length > 0) {
    const item = body.data[0];
    const val = Number(item.amount) || 0;
    rawAmount = Math.abs(val);
    type = val >= 0 ? 'income' : 'expense';
    note = String(item.description || '').trim();
    referenceCode = String(item.tid || item.id || `CASSO_${Date.now()}`);
    accountNumber = String(item.subAccId || item.accountNumber || '');
    transactionDateTimeStr = String(item.when || '');
  }
  // Case C: Generic notification forwarder format
  else {
    rawAmount = Math.abs(Number(body.amount) || Number(body.money) || 0);
    const rawType = String(body.type || '').toLowerCase();
    type = rawType === 'income' || rawType === 'in' || (Number(body.amountIn) || 0) > 0 ? 'income' : 'expense';
    note = String(body.description || body.content || body.note || body.message || '').trim();
    referenceCode = String(body.referenceCode || body.refCode || body.id || body.code || `MB_${Date.now()}`);
    accountNumber = String(body.accountNumber || body.subAccount || '');
    transactionDateTimeStr = String(body.transaction_time || body.transactionTime || body.date || '');
  }

  if (rawAmount <= 0) {
    throw new AppError(400, 'Số tiền giao dịch không hợp lệ hoặc bằng 0', 'INVALID_AMOUNT');
  }

  // 3. Normalize Date & Time
  let dateObj = new Date();
  if (transactionDateTimeStr) {
    const parsed = new Date(transactionDateTimeStr);
    if (!isNaN(parsed.getTime())) dateObj = parsed;
  }
  const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
  const timeStr = dateObj.toTimeString().slice(0, 8); // e.g. "14:35:20"

  // 4. Resolve Target User & Wallet
  // Priority: explicit userId in query/body -> user with matching account number -> first active user
  let targetUser = null;
  const explicitUserId = (request.query.userId as string) || (body.userId as string);
  if (explicitUserId && mongoose.isValidObjectId(explicitUserId)) {
    targetUser = await UserModel.findById(explicitUserId);
  }
  if (!targetUser) {
    targetUser = await UserModel.findOne().sort({ createdAt: 1 });
  }
  if (!targetUser) {
    throw new AppError(404, 'Hệ thống chưa có người dùng nào để ghi nhận giao dịch', 'USER_NOT_FOUND');
  }

  const userId = targetUser._id as mongoose.Types.ObjectId;

  // Idempotency Check: if this referenceCode was already imported, return existing transaction
  const existing = await TransactionModel.findOne({ userId, idempotencyKey: referenceCode }).lean();
  if (existing) {
    response.status(200).json({
      success: true,
      message: 'Giao dịch đã được ghi nhận trước đó',
      transaction: {
        id: String(existing._id),
        amount: existing.amountMinor / 100,
        type: existing.type,
        dateKey: existing.dateKey,
        referenceCode,
      },
    });
    return;
  }

  // Find or auto-create MB Bank wallet for this user
  let wallet = await WalletModel.findOne({
    userId,
    active: true,
    $or: [{ name: /MB/i }, { type: 'bank' }],
  });

  if (!wallet) {
    wallet = await WalletModel.create({
      userId,
      name: 'MB Bank',
      type: 'bank',
      balanceMinor: 0,
      currency: 'VND',
      color: '#002D72',
      active: true,
    });
  }

  // 5. Generate Default MB Bank Digital Receipt SVG & Save to Private Storage
  const receiptSvg = generateMbReceiptSvg({
    amount: rawAmount,
    type,
    dateKey,
    timeStr,
    note: note || 'Thanh toán qua MB Bank',
    referenceCode,
    accountNumber,
  });

  const savedImage = await saveBufferImage(Buffer.from(receiptSvg, 'utf-8'), 'image/svg+xml', '.svg');

  // Guess category from note
  let categoryId = 'bills';
  const lowerNote = note.toLowerCase();
  if (/cơm|phở|bún|ăn|uống|cf|cafe|cà phê|trà sữa|highlands|starbucks|food|grabfood|shopeefood/i.test(lowerNote)) {
    categoryId = 'food';
  } else if (/grab|be|xăng|taxi|giao thông|vé xe|vé tàu|vé máy bay/i.test(lowerNote)) {
    categoryId = 'transport';
  } else if (/mua|shopee|lazada|tiki|tiktok|quần áo|siêu thị|mart/i.test(lowerNote)) {
    categoryId = 'shopping';
  } else if (/lương|thu nhập|bonus|thưởng|tiền về/i.test(lowerNote)) {
    categoryId = 'salary';
  }

  // 6. Save Transaction & Update Wallet Balance atomically
  const amountMinor = Math.round(rawAmount * 100);
  const session = await mongoose.startSession();
  let createdTx: any = null;

  try {
    await session.withTransaction(async () => {
      [createdTx] = await TransactionModel.create(
        [
          {
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
            imageKey: savedImage.key,
            imageMimeType: savedImage.mimetype,
            imageSize: savedImage.size,
            idempotencyKey: referenceCode,
            status: 'posted',
          },
        ],
        { session },
      );

      const balanceDelta = type === 'income' ? amountMinor : -amountMinor;
      await WalletModel.updateOne({ _id: wallet._id }, { $inc: { balanceMinor: balanceDelta } }, { session });
    });
  } finally {
    session.endSession();
  }

  response.status(201).json({
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
      imageUrl: `/api/transactions/${String(createdTx._id)}/image`,
    },
  });
};
