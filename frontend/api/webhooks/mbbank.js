function emailToCloudTopic(email) {
  const normalized = (email || '').trim().toLowerCase();
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

function generateMbReceiptSvgDataUrl(options) {
  const isIncome = options.type === 'income';
  const sign = isIncome ? '+' : '−';
  const colorAccent = isIncome ? '#10b981' : '#f43f5e';
  const cleanNote = (options.note || 'Thanh toán qua MB Bank').replace(/[<>&'"]/g, ' ').slice(0, 75);
  const cleanRef = String(options.referenceCode || '').replace(/[<>&'"]/g, '').slice(0, 30);
  const formatted = Number(options.amount || 0).toLocaleString('vi-VN');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 900" width="720" height="900">
  <defs>
    <linearGradient id="mbg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#001844" />
      <stop offset="50%" stop-color="#002D72" />
      <stop offset="100%" stop-color="#0a1226" />
    </linearGradient>
  </defs>
  <rect width="720" height="900" fill="url(#mbg)" />
  <rect x="0" y="0" width="720" height="12" fill="#00A3E0" />
  <g transform="translate(60, 60)">
    <rect x="0" y="0" width="56" height="56" rx="14" fill="#00A3E0" />
    <path d="M 16 38 L 16 18 L 24 28 L 32 18 L 32 38 M 38 18 L 46 18 L 46 28 L 38 28 L 46 38" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
    <text x="72" y="28" font-family="-apple-system, sans-serif" font-weight="900" font-size="24" fill="#ffffff" letter-spacing="1.5">MB BANK</text>
    <text x="72" y="48" font-family="-apple-system, sans-serif" font-weight="600" font-size="13" fill="#93c5fd">NGÂN HÀNG QUÂN ĐỘI • BIÊN LAI ĐIỆN TỬ</text>
    <rect x="420" y="8" width="180" height="38" rx="19" fill="rgba(0, 163, 224, 0.22)" stroke="#00A3E0" stroke-width="1.5" />
    <text x="510" y="32" font-family="-apple-system, sans-serif" font-weight="800" font-size="12" fill="#67e8f9" text-anchor="middle">⚡ MB BANK AUTO</text>
  </g>
  <g transform="translate(60, 160)">
    <rect x="0" y="0" width="600" height="220" rx="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" />
    <text x="40" y="48" font-family="-apple-system, sans-serif" font-size="14" font-weight="600" fill="#94a3b8">BIẾN ĐỘNG SỐ DƯ TỰ ĐỘNG</text>
    <text x="40" y="125" font-family="-apple-system, sans-serif" font-size="50" font-weight="900" fill="${colorAccent}">
      ${sign}${formatted} <tspan font-size="30" font-weight="700">VND</tspan>
    </text>
    <rect x="40" y="155" width="130" height="32" rx="8" fill="${isIncome ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'}" />
    <text x="105" y="176" font-family="-apple-system, sans-serif" font-size="13" font-weight="700" fill="${colorAccent}" text-anchor="middle">
      ${isIncome ? 'TIỀN VÀO (+)' : 'TIỀN RA (−)'}
    </text>
  </g>
  <g transform="translate(60, 410)">
    <rect x="0" y="0" width="600" height="330" rx="20" fill="rgba(10, 18, 38, 0.65)" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1" />
    <text x="36" y="50" font-family="-apple-system, sans-serif" font-size="13" fill="#94a3b8">Thời gian giao dịch</text>
    <text x="564" y="50" font-family="-apple-system, sans-serif" font-size="15" font-weight="700" fill="#ffffff" text-anchor="end">${options.timeStr} • ${options.dateKey}</text>
    <line x1="36" y1="78" x2="564" y2="78" stroke="rgba(255, 255, 255, 0.08)" />
    <text x="36" y="118" font-family="-apple-system, sans-serif" font-size="13" fill="#94a3b8">Mã tham chiếu (Ref ID)</text>
    <text x="564" y="118" font-family="-apple-system, sans-serif" font-size="14" font-weight="700" fill="#38bdf8" text-anchor="end">${cleanRef}</text>
    <line x1="36" y1="146" x2="564" y2="146" stroke="rgba(255, 255, 255, 0.08)" />
    <text x="36" y="186" font-family="-apple-system, sans-serif" font-size="13" fill="#94a3b8">Nội dung</text>
    <text x="36" y="222" font-family="-apple-system, sans-serif" font-size="16" font-weight="600" fill="#f8fafc">${cleanNote}</text>
    <line x1="36" y1="254" x2="564" y2="254" stroke="rgba(255, 255, 255, 0.08)" />
    <text x="36" y="294" font-family="-apple-system, sans-serif" font-size="13" fill="#94a3b8">Kênh tích hợp</text>
    <text x="564" y="294" font-family="-apple-system, sans-serif" font-size="14" font-weight="700" fill="#a78bfa" text-anchor="end">SePay Webhook (Real-time)</text>
  </g>
  <g transform="translate(60, 780)">
    <rect x="0" y="0" width="600" height="54" rx="14" fill="rgba(0, 163, 224, 0.12)" stroke="rgba(0, 163, 224, 0.3)" stroke-width="1" />
    <text x="300" y="32" font-family="-apple-system, sans-serif" font-size="13" font-weight="600" fill="#7dd3fc" text-anchor="middle">
      📸 Chạm vào giao dịch trên CapMoney để chụp hoặc đổi ảnh bill thực tế
    </text>
  </g>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default async function handler(req, res) {
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
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        // Leave as string
      }
    }
    body = body || {};

    let rawAmount = 0;
    let type = 'expense';
    let note = '';
    let referenceCode = '';
    let accountNumber = '';
    let transactionDateTimeStr = '';

    // 1. SePay format
    if ('gateway' in body || 'amountIn' in body || 'amountOut' in body || 'transferAmount' in body) {
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
    // 2. Casso format
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
    // 3. Generic format
    else {
      rawAmount = Math.abs(Number(body.amount) || Number(body.money) || 0);
      const rawType = String(body.type || '').toLowerCase();
      type = rawType === 'income' || rawType === 'in' || (Number(body.amountIn) || 0) > 0 ? 'income' : 'expense';
      note = String(body.description || body.content || body.note || body.message || '').trim();
      referenceCode = String(body.referenceCode || body.refCode || body.id || `MB_${Date.now()}`);
      accountNumber = String(body.accountNumber || body.subAccount || '');
      transactionDateTimeStr = String(body.transaction_time || body.transactionTime || body.date || '');
    }

    if (rawAmount <= 0) {
      return res.status(200).json({ success: true, message: 'Số tiền bằng 0 hoặc ping webhook' });
    }

    let dateObj = new Date();
    if (transactionDateTimeStr) {
      const parsed = new Date(transactionDateTimeStr);
      if (!isNaN(parsed.getTime())) dateObj = parsed;
    }
    const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    const timeStr = dateObj.toTimeString().slice(0, 8);

    const targetEmail = (req.query?.email) || body.email || 'hoan@gmail.com';
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
      note: note || 'Thanh toán qua MB Bank',
      referenceCode,
      accountNumber,
    });

    const amountMinor = Math.round(rawAmount * 100);

    // Fetch existing cloud account snapshot
    let snapshot = null;
    try {
      const r = await fetch(`https://ntfy.sh/${topic}/raw`);
      if (r.ok) {
        snapshot = await r.json();
      }
    } catch {
      // Ignore
    }

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

    // Idempotency: skip if already imported
    const exists = snapshot.transactions.some((tx) => tx.idempotencyKey === referenceCode);
    if (exists) {
      return res.status(200).json({
        success: true,
        message: 'Giao dịch đã được ghi nhận trước đó',
        referenceNumber: referenceCode,
      });
    }

    let mbWallet = snapshot.wallets.find((w) => /MB/i.test(w.name) || w.type === 'bank');
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

    const newTx = {
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

    if (type === 'income') {
      mbWallet.balanceMinor = (mbWallet.balanceMinor || 0) + amountMinor;
    } else {
      mbWallet.balanceMinor = (mbWallet.balanceMinor || 0) - amountMinor;
    }
    mbWallet.balance = mbWallet.balanceMinor / 100;

    snapshot.transactions.unshift(newTx);
    snapshot.updatedAt = Date.now();

    // Push updated snapshot back to cloud topic
    try {
      await fetch(`https://ntfy.sh/${topic}`, {
        method: 'PUT',
        headers: { Filename: 'account.json' },
        body: JSON.stringify(snapshot),
      });
    } catch {
      // Ignore
    }

    return res.status(200).json({
      success: true,
      message: 'Đã tự động đồng bộ biến động số dư MB Bank thành công!',
      transaction: {
        id: newTx.id,
        amount: rawAmount,
        type,
        dateKey,
        time: timeStr,
        note: newTx.note,
        referenceNumber: referenceCode,
      },
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      message: err?.message || 'Lỗi xử lý webhook',
    });
  }
}
