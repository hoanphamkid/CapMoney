/**
 * CapMoney - SePay / MBBank webhook
 * Khi có MONGO_URI, dùng handler MongoDB chung với backend.
 * Nếu chưa cấu hình database, giữ luồng ntfy.sh của bản cũ.
 */

function emailToCloudTopic(email: string): string {
  const normalized = email.trim().toLowerCase();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch * 31 + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const safeSlug = normalized.replace(/[^a-z0-9]/g, '').slice(0, 14);
  return `cm_cloud_v2_${safeSlug}_${hex1}${hex2}`;
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateMbReceiptSvgDataUrl(options: {
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
  const accent = isIncome ? '#10b981' : '#f43f5e';
  const formatted = options.amount.toLocaleString('vi-VN');
  const note = escapeXml((options.note || 'Giao dịch MB Bank').slice(0, 75));
  const ref = escapeXml(options.referenceCode.slice(0, 30));
  const date = escapeXml(options.dateKey);
  const time = escapeXml(options.timeStr);

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 900" width="720" height="900">
    <defs>
      <linearGradient id="mbg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#001844" />
        <stop offset="50%" stop-color="#002D72" />
        <stop offset="100%" stop-color="#0a1226" />
      </linearGradient>
    </defs>
    <rect width="720" height="900" fill="url(#mbg)" />
    <rect width="720" height="12" fill="#00A3E0" />
    <g transform="translate(60 60)">
      <rect width="56" height="56" rx="14" fill="#00A3E0" />
      <text x="72" y="35" font-family="Arial,sans-serif" font-weight="900" font-size="24" fill="#fff">MB BANK</text>
      <text x="72" y="55" font-family="Arial,sans-serif" font-size="12" fill="#93c5fd">BIÊN LAI ĐIỆN TỬ</text>
    </g>
    <g transform="translate(60 160)">
      <rect width="600" height="220" rx="24" fill="#ffffff" fill-opacity=".08" stroke="#ffffff" stroke-opacity=".18" />
      <text x="40" y="48" font-family="Arial,sans-serif" font-size="14" fill="#94a3b8">BIẾN ĐỘNG SỐ DƯ</text>
      <text x="40" y="125" font-family="Arial,sans-serif" font-size="48" font-weight="900" fill="${accent}">${sign}${formatted} VND</text>
      <text x="40" y="180" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="${accent}">${isIncome ? 'TIỀN VÀO' : 'TIỀN RA'}</text>
    </g>
    <g transform="translate(60 410)">
      <rect width="600" height="330" rx="20" fill="#0a1226" fill-opacity=".8" stroke="#ffffff" stroke-opacity=".1" />
      <text x="36" y="50" font-family="Arial,sans-serif" font-size="13" fill="#94a3b8">Thời gian giao dịch</text>
      <text x="564" y="50" text-anchor="end" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#fff">${time} • ${date}</text>
      <line x1="36" y1="78" x2="564" y2="78" stroke="#ffffff" stroke-opacity=".12" />
      <text x="36" y="118" font-family="Arial,sans-serif" font-size="13" fill="#94a3b8">Mã tham chiếu</text>
      <text x="564" y="118" text-anchor="end" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#38bdf8">${ref}</text>
      <line x1="36" y1="146" x2="564" y2="146" stroke="#ffffff" stroke-opacity=".12" />
      <text x="36" y="186" font-family="Arial,sans-serif" font-size="13" fill="#94a3b8">Nội dung</text>
      <text x="36" y="222" font-family="Arial,sans-serif" font-size="16" font-weight="600" fill="#f8fafc">${note}</text>
      <line x1="36" y1="254" x2="564" y2="254" stroke="#ffffff" stroke-opacity=".12" />
      <text x="36" y="294" font-family="Arial,sans-serif" font-size="13" fill="#94a3b8">Kênh tích hợp</text>
      <text x="564" y="294" text-anchor="end" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#a78bfa">SePay Webhook</text>
    </g>
    <text x="360" y="820" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#7dd3fc">CapMoney • Biên lai giao dịch tự động</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 7000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function getAuthorizationHeader(req: any): string {
  const value = req.headers?.authorization || req.headers?.Authorization || '';
  return String(value).trim();
}

function isAuthorized(req: any): boolean {
  const secret = (globalThis as any).process?.env?.SEPAY_WEBHOOK_SECRET;
  if (!secret) return false;

  const received = getAuthorizationHeader(req);
  const expected = `Apikey ${secret}`;
  return received === expected;
}

async function readLatestSnapshot(topic: string): Promise<any | null> {
  // poll=1 khiến ntfy đóng kết nối sau khi trả các tin đã lưu.
  // since=latest chỉ lấy tin mới nhất, tránh đọc một luồng stream vô hạn.
  const url = `https://ntfy.sh/${topic}/json?poll=1&since=latest`;
  const response = await fetchWithTimeout(url, {}, 7000);

  if (!response.ok) {
    throw new Error(`Không đọc được dữ liệu ntfy (HTTP ${response.status})`);
  }

  const responseText = await response.text();
  if (!responseText.trim()) return null;

  const events = responseText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const messageEvent = [...events].reverse().find((event: any) => event.event === 'message');
  if (!messageEvent) return null;

  // Nếu ntfy lưu JSON dưới dạng file đính kèm, tải file theo URL đính kèm.
  if (messageEvent.attachment?.url) {
    const attachmentResponse = await fetchWithTimeout(messageEvent.attachment.url, {}, 7000);
    if (!attachmentResponse.ok) {
      throw new Error(`Không tải được file dữ liệu ntfy (HTTP ${attachmentResponse.status})`);
    }
    return await attachmentResponse.json();
  }

  const message = String(messageEvent.message || '').trim();
  if (!message) return null;

  try {
    return JSON.parse(message);
  } catch {
    throw new Error('Tin mới nhất trên ntfy không phải dữ liệu JSON tài khoản');
  }
}

export default async function handler(req: any, res: any) {
  // Persist to the same database as the web API when a server database is configured.
  // Retain the existing ntfy implementation below for deployments that still use it.
  if ((globalThis as any).process?.env?.MONGO_URI) {
    const { default: databaseHandler } = await import('../../../api/webhooks/mbbank.js');
    return databaseHandler(req, res);
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'CapMoney SePay/MBBank Webhook API',
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  // Bắt buộc cấu hình secret trên Vercel và gửi đúng Authorization: Apikey <secret>.
  if (!(globalThis as any).process?.env?.SEPAY_WEBHOOK_SECRET) {
    console.error('Thiếu biến môi trường SEPAY_WEBHOOK_SECRET');
    return res.status(500).json({ success: false, message: 'Webhook chưa được cấu hình secret' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    let body = req.body;

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ success: false, message: 'Body JSON không hợp lệ' });
      }
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ success: false, message: 'Body không hợp lệ' });
    }

    let rawAmount = 0;
    let type: 'income' | 'expense' = 'expense';
    let note = '';
    let referenceCode = '';
    let accountNumber = '';
    let transactionDateTimeStr = '';

    // 1. SePay / MBBank format
    if (
      'gateway' in body ||
      'amountIn' in body ||
      'amountOut' in body ||
      'transferAmount' in body ||
      'transferType' in body
    ) {
      const amountIn = Number(body.amountIn) || 0;
      const amountOut = Number(body.amountOut) || 0;
      const transferType = String(body.transferType || '').toLowerCase();

      if (amountIn > 0 || transferType === 'in') {
        rawAmount = amountIn > 0 ? amountIn : Number(body.transferAmount) || 0;
        type = 'income';
      } else {
        rawAmount = amountOut > 0 ? amountOut : Number(body.transferAmount) || 0;
        type = 'expense';
      }

      note = String(body.transactionContent || body.content || body.description || '').trim();
      referenceCode = String(
        body.referenceNumber || body.referenceCode || body.id || `MB_${Date.now()}`
      );
      accountNumber = String(body.accountNumber || body.subAccount || '');
      transactionDateTimeStr = String(body.transactionDate || '');
    }
    // 2. Casso format
    else if (Array.isArray(body.data) && body.data.length > 0) {
      const item = body.data[0];
      const value = Number(item.amount) || 0;
      rawAmount = Math.abs(value);
      type = value >= 0 ? 'income' : 'expense';
      note = String(item.description || '').trim();
      referenceCode = String(item.tid || item.id || `CASSO_${Date.now()}`);
      accountNumber = String(item.subAccId || item.accountNumber || '');
      transactionDateTimeStr = String(item.when || '');
    }
    // 3. Generic format
    else {
      rawAmount = Math.abs(Number(body.amount) || Number(body.money) || 0);
      const rawType = String(body.type || '').toLowerCase();
      type = rawType === 'income' || rawType === 'in' ? 'income' : 'expense';
      note = String(body.description || body.content || body.note || body.message || '').trim();
      referenceCode = String(body.referenceCode || body.refCode || body.id || `MB_${Date.now()}`);
      accountNumber = String(body.accountNumber || body.subAccount || '');
      transactionDateTimeStr = String(
        body.transaction_time || body.transactionTime || body.date || ''
      );
    }

    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      return res.status(200).json({
        success: true,
        message: 'Không có số tiền hợp lệ; webhook đã nhận và bỏ qua',
      });
    }

    let dateObj = new Date();
    if (transactionDateTimeStr) {
      // Chuỗi ngày giờ SePay dạng YYYY-MM-DD HH:mm:ss được chuẩn hóa để parse ổn định.
      const normalizedDate = transactionDateTimeStr.includes('T')
        ? transactionDateTimeStr
        : transactionDateTimeStr.replace(' ', 'T') + '+07:00';
      const parsed = new Date(normalizedDate);
      if (!Number.isNaN(parsed.getTime())) dateObj = parsed;
    }

    const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    const timeStr = dateObj.toLocaleTimeString('vi-VN', {
      hour12: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    const targetEmail = String(req.query?.email || body.email || 'hoan@gmail.com')
      .trim()
      .toLowerCase();
    const topic = emailToCloudTopic(targetEmail);

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

    const receiptUrl = generateMbReceiptSvgDataUrl({
      amount: rawAmount,
      type,
      dateKey,
      timeStr,
      note: note || 'Giao dịch qua MB Bank',
      referenceCode,
      accountNumber,
    });

    // Đọc snapshot bằng poll=1 để ntfy không giữ kết nối stream vô hạn.
    let snapshot: any = await readLatestSnapshot(topic);

    if (!snapshot) {
      snapshot = {
        email: targetEmail,
        updatedAt: Date.now(),
        user: { id: 'u_default', email: targetEmail, name: 'Hoàn', phone: '' },
        wallets: [
          {
            id: 'w_mbbank',
            userId: 'u_default',
            name: 'MB Bank',
            type: 'bank',
            balance: 0,
            balanceMinor: 0,
            currency: 'VND',
            color: '#002D72',
            active: true,
          },
        ],
        transactions: [],
        reminders: [],
      };
    }

    if (!Array.isArray(snapshot.transactions)) snapshot.transactions = [];
    if (!Array.isArray(snapshot.wallets)) snapshot.wallets = [];

    // Chống ghi trùng khi SePay gửi lại cùng referenceCode.
    const alreadyExists = snapshot.transactions.some(
      (transaction: any) => String(transaction.idempotencyKey) === referenceCode
    );

    if (alreadyExists) {
      return res.status(200).json({
        success: true,
        message: 'Giao dịch đã được ghi nhận trước đó',
        referenceNumber: referenceCode,
      });
    }

    let mbWallet = snapshot.wallets.find(
      (wallet: any) => /MB/i.test(String(wallet.name || '')) || wallet.type === 'bank'
    );

    if (!mbWallet) {
      mbWallet = {
        id: `w_${Date.now()}`,
        userId: snapshot.user?.id || 'u_default',
        name: 'MB Bank',
        type: 'bank',
        balance: 0,
        balanceMinor: 0,
        currency: 'VND',
        color: '#002D72',
        active: true,
      };
      snapshot.wallets.push(mbWallet);
    }

    const amountMinor = Math.round(rawAmount * 100);
    const newTransaction = {
      id: `tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId: snapshot.user?.id || 'u_default',
      type,
      amount: rawAmount,
      amountMinor,
      note: note || (type === 'income' ? 'Nhận tiền MB Bank' : 'Chi tiêu MB Bank'),
      categoryId,
      walletId: mbWallet.id,
      dateKey,
      transactionTime: timeStr,
      source: 'webhook_mbbank',
      status: 'completed',
      imageUrl: receiptUrl,
      createdAt: new Date().toISOString(),
      idempotencyKey: referenceCode,
    };

    const currentBalanceMinor = Number(mbWallet.balanceMinor) || 0;
    mbWallet.balanceMinor = type === 'income'
      ? currentBalanceMinor + amountMinor
      : currentBalanceMinor - amountMinor;
    mbWallet.balance = mbWallet.balanceMinor / 100;

    snapshot.transactions.unshift(newTransaction);
    snapshot.updatedAt = Date.now();

    // Ghi snapshot lên ntfy. Nếu ghi thất bại, trả lỗi để SePay có thể phát lại.
    const writeResponse = await fetchWithTimeout(
      `https://ntfy.sh/${topic}`,
      {
        method: 'PUT',
        headers: {
          Filename: 'account.json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(snapshot),
      },
      7000
    );

    if (!writeResponse.ok) {
      throw new Error(`Không lưu được snapshot lên ntfy (HTTP ${writeResponse.status})`);
    }

    return res.status(200).json({
      success: true,
      message: 'Đã đồng bộ giao dịch MB Bank thành công',
      transaction: {
        id: newTransaction.id,
        amount: rawAmount,
        type,
        dateKey,
        time: timeStr,
        note: newTransaction.note,
        referenceNumber: referenceCode,
      },
    });
  } catch (error: any) {
    console.error('[MBBANK WEBHOOK ERROR]', error);
    const message = error?.name === 'AbortError'
      ? 'Dịch vụ lưu trữ phản hồi quá thời gian cho phép'
      : (error?.message || 'Lỗi xử lý webhook');

    // Không trả 200 giả khi chưa lưu được dữ liệu.
    return res.status(503).json({ success: false, message });
  }
}
