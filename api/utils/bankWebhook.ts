import { createHash, timingSafeEqual } from 'node:crypto';

export class BankWebhookError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function bankWalletId(userId: string, accountNumber: string) {
  return createHash('sha256').update(JSON.stringify(['mb-wallet', userId, accountNumber])).digest('hex').slice(0, 24);
}

export function verifyBankWebhook(headers: Record<string, unknown>, secret?: string) {
  if (!secret) throw new BankWebhookError(503, 'WEBHOOK_NOT_CONFIGURED', 'Chưa cấu hình khóa webhook trên máy chủ.');
  const authorization = typeof headers.authorization === 'string' ? headers.authorization : '';
  const key = /^(?:Apikey|Bearer)\s+(.+)$/i.exec(authorization)?.[1]?.trim()
    || headers['x-api-key'] || headers['x-webhook-secret'];
  const actual = Buffer.from(typeof key === 'string' ? key : '');
  const expected = Buffer.from(secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new BankWebhookError(401, 'INVALID_WEBHOOK_SECRET', 'Khóa webhook không hợp lệ.');
  }
}

function bankDate(value: unknown) {
  let input = String(value || '').trim();
  if (input && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(input)) input = input.replace(' ', 'T') + '+07:00';
  const date = input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) throw new BankWebhookError(400, 'INVALID_DATE', 'Ngày giao dịch không hợp lệ.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return { dateObj: date, dateKey: `${parts.year}-${parts.month}-${parts.day}`, timeStr: `${parts.hour}:${parts.minute}:${parts.second}` };
}

export function parseBankTransactions(payload: unknown) {
  let body = payload;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { throw new BankWebhookError(400, 'INVALID_PAYLOAD', 'Body JSON không hợp lệ.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BankWebhookError(400, 'INVALID_PAYLOAD', 'Body phải là một JSON object.');
  const root = body as Record<string, unknown>;
  const isCasso = Array.isArray(root.data);
  const items = isCasso ? root.data as unknown[] : [root];
  if (!items.length || items.length > 100) throw new BankWebhookError(400, 'INVALID_PAYLOAD', 'Số lượng giao dịch không hợp lệ.');
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new BankWebhookError(400, 'INVALID_PAYLOAD', 'Giao dịch không hợp lệ.');
    const row = item as Record<string, unknown>;
    const gateway = String(row.gateway || '').replace(/[\s_-]/g, '').toLowerCase();
    if (gateway && gateway !== 'mbbank' && gateway !== 'mb') throw new BankWebhookError(400, 'INVALID_BANK', 'Webhook này chỉ nhận giao dịch MB Bank.');
    const amountIn = Number(row.amountIn || 0);
    const amountOut = Number(row.amountOut || 0);
    const direction = String(row.transferType || row.type || '').toLowerCase();
    let type: 'income' | 'expense';
    let amount: number;
    if (isCasso) {
      amount = Math.abs(Number(row.amount)); type = Number(row.amount) > 0 ? 'income' : 'expense';
    } else if (amountIn > 0 && amountOut > 0) {
      throw new BankWebhookError(400, 'INVALID_AMOUNT', 'Giao dịch không thể vừa tiền vào vừa tiền ra.');
    } else if (amountIn > 0 || amountOut > 0) {
      type = amountIn > 0 ? 'income' : 'expense'; amount = amountIn > 0 ? amountIn : amountOut;
      if (direction && ![type, type === 'income' ? 'in' : 'out'].includes(direction)) throw new BankWebhookError(400, 'INVALID_DIRECTION', 'Loại giao dịch mâu thuẫn với số tiền.');
    } else {
      if (!['in', 'income', 'out', 'expense'].includes(direction)) throw new BankWebhookError(400, 'INVALID_DIRECTION', 'Thiếu loại giao dịch tiền vào/tiền ra.');
      type = ['in', 'income'].includes(direction) ? 'income' : 'expense'; amount = Number(row.transferAmount ?? row.amount ?? row.money);
    }
    const amountMinor = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amountMinor) || amountMinor < 1) throw new BankWebhookError(400, 'INVALID_AMOUNT', 'Số tiền giao dịch không hợp lệ.');
    const referenceCode = String(row.referenceNumber || row.referenceCode || row.tid || row.refCode || row.id || '').trim();
    const accountNumber = String(row.accountNumber || row.subAccId || row.subAccount || '').trim();
    if (!referenceCode) throw new BankWebhookError(400, 'MISSING_REFERENCE', 'Thiếu mã giao dịch để chống ghi trùng.');
    if (!accountNumber) throw new BankWebhookError(400, 'MISSING_ACCOUNT', 'Thiếu số tài khoản ngân hàng.');
    const note = String(row.transactionContent || row.content || row.description || row.note || row.message || '').trim().slice(0, 500);
    const idempotencyKey = `mb:${createHash('sha256').update(JSON.stringify([accountNumber, referenceCode])).digest('hex')}`;
    return { amount, amountMinor, type, note, referenceCode, accountNumber, idempotencyKey, ...bankDate(row.transactionDate || row.when || row.transaction_time || row.transactionTime || row.date) };
  });
}

export function bankCategory(note: string, type: 'income' | 'expense') {
  if (type === 'income') return /lương|salary|bonus|thưởng/i.test(note) ? 'salary' : 'other';
  if (/cơm|phở|bún|ăn|uống|cafe|cà phê|trà sữa|highlands|starbucks|food/i.test(note)) return 'food';
  if (/grab|xăng|taxi|giao thông|vé xe|vé tàu|vé máy bay/i.test(note)) return 'transport';
  if (/mua|shopee|lazada|tiki|tiktok|quần áo|siêu thị|mart/i.test(note)) return 'shopping';
  return 'bills';
}
