export type OcrScanResult = {
  bestAmount: number;
  candidates: number[];
  suggestedCategory?: string;
  suggestedType?: 'expense' | 'income';
  suggestedNote?: string;
  rawText: string;
};

type TesseractWorker = {
  recognize: (image: HTMLCanvasElement | Blob | string) => Promise<{ data: { text: string } }>;
};

declare global {
  interface Window {
    Tesseract?: {
      createWorker: (lang?: string) => Promise<TesseractWorker>;
    };
    TextDetector?: new () => {
      detect: (image: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
    };
  }
}

let cachedWorkerPromise: Promise<TesseractWorker | null> | null = null;

function loadTesseractScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.Tesseract) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-tesseract="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load OCR script')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.dataset.tesseract = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load OCR script'));
    document.head.appendChild(script);
  });
}

async function getOcrWorker(): Promise<TesseractWorker | null> {
  if (!cachedWorkerPromise) {
    cachedWorkerPromise = (async () => {
      try {
        await loadTesseractScript();
        if (!window.Tesseract) return null;
        return await window.Tesseract.createWorker('eng');
      } catch {
        cachedWorkerPromise = null;
        return null;
      }
    })();
  }
  return cachedWorkerPromise;
}

/**
 * Preprocesses image into a high-contrast canvas for accurate number recognition on mobile photos
 */
async function preprocessImageForOcr(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 1100;
  const scale = Math.min(1.5, maxDim / Math.max(bitmap.width, bitmap.height, 1));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.filter = 'contrast(1.35) saturate(0.2) brightness(1.05)';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

/**
 * Extracts raw text from image using native TextDetector (if available) + Tesseract.js
 */
export async function scanReceiptImage(file: File): Promise<OcrScanResult> {
  let combinedText = '';

  try {
    const canvas = await preprocessImageForOcr(file);

    // 1. Try fast native TextDetector first if browser supports it
    if (typeof window !== 'undefined' && window.TextDetector) {
      try {
        const detector = new window.TextDetector();
        const blocks = await detector.detect(canvas);
        if (blocks.length > 0) {
          combinedText += blocks.map(b => b.rawValue).join('\n') + '\n';
        }
      } catch {
        // Fallback to Tesseract
      }
    }

    // 2. Run Tesseract worker if native detector wasn't available or didn't find enough digits
    if ((combinedText.match(/\d/g)?.length ?? 0) < 2) {
      const worker = await getOcrWorker();
      if (worker) {
        const res = await worker.recognize(canvas);
        if (res?.data?.text) {
          combinedText += '\n' + res.data.text;
        }
      }
    }
  } catch {
    // Ignore OCR failures gracefully
  }

  return parseReceiptText(combinedText);
}

/**
 * Parses OCR text to find Vietnamese currency amounts, total lines, and category hints
 */
export function parseReceiptText(rawText: string): OcrScanResult {
  const cleanText = rawText.replace(/[Oo]/g, match => match); // preserve original first
  const lines = cleanText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const scoredCandidates = new Map<number, number>(); // amount -> score

  const addCandidate = (val: number, weight: number) => {
    if (!Number.isFinite(val) || val < 1_000 || val > 500_000_000) return;
    // Prefer rounded amounts or typical receipt amounts
    let bonus = 0;
    if (val % 1_000 === 0) bonus += 15;
    else if (val % 100 === 0) bonus += 5;
    if (val >= 10_000 && val <= 20_000_000) bonus += 10;

    // Avoid years like 2024, 2025, 2026 or phone numbers starting with 09/03/08
    if (val >= 1990 && val <= 2035) return;

    const prev = scoredCandidates.get(val) ?? 0;
    scoredCandidates.set(val, Math.max(prev, weight + bonus));
  };

  const totalKeywords = /(tổng|tong|total|thành tiền|thanh tien|thanh toán|thanh toan|cộng|cong|amount|phải thu|phai thu|số tiền|so tien|tiền mặt|tien mat|chuyển khoản|chuyen khoan|vnd|vnđ)/i;

  for (const line of lines) {
    const isTotalLine = totalKeywords.test(line);
    const hasCurrencySymbol = /(đ|d\b|vnd|vnđ|\+|-)/i.test(line);
    const baseWeight = (isTotalLine ? 60 : 15) + (hasCurrencySymbol ? 25 : 0);

    // Normalize common OCR digit confusions inside numeric patterns (e.g. O -> 0, l/I -> 1 when adjacent to digits)
    const normalizedLine = line
      .replace(/(?<=\d)[Oo](?=\d|[.,\s]|$)/g, '0')
      .replace(/(?<=\d)[lI|](?=\d|[.,\s]|$)/g, '1');

    // Pattern 1: Thousand-separated numbers like 746,000 or 1.250.000 or 31,000 or 150 000
    const thousandRegex = /\b(\d{1,3}(?:[.,\s]\d{3})+)\b/g;
    let m: RegExpExecArray | null;
    while ((m = thousandRegex.exec(normalizedLine)) !== null) {
      const digitsOnly = m[1].replace(/[^0-9]/g, '');
      const num = Number(digitsOnly);
      if (num >= 1_000) {
        addCandidate(num, baseWeight + 35);
      }
    }

    // Pattern 2: Shorthand with k / tr (e.g., 35k, 120K, 1.5tr)
    const kRegex = /\b(\d{1,4}(?:[.,]\d{1,2})?)\s*(k|nghin|nghìn|ngàn)\b/gi;
    while ((m = kRegex.exec(normalizedLine)) !== null) {
      const num = Math.round(parseFloat(m[1].replace(',', '.')) * 1_000);
      addCandidate(num, baseWeight + 30);
    }

    // Pattern 3: Plain 4 to 8 digit numbers (e.g. 35000, 746000, 1250000)
    const plainRegex = /\b(\d{4,8})\b/g;
    while ((m = plainRegex.exec(normalizedLine)) !== null) {
      const rawDigits = m[1];
      // Skip likely dates like 10112026 or 20261110
      if (/^(19|20)\d{6}$/.test(rawDigits) || /^\d{4}(19|20)\d{2}$/.test(rawDigits)) continue;
      const num = Number(rawDigits);
      addCandidate(num, baseWeight + 10);
    }

    // Pattern 4: Small 2-3 digit numbers on menus/receipts where '000' is omitted (e.g. "35", "45", "125")
    const shortMenuRegex = /\b([1-9]\d{1,2})\b/g;
    while ((m = shortMenuRegex.exec(normalizedLine)) !== null) {
      const small = Number(m[1]);
      if (small >= 10 && small <= 950) {
        addCandidate(small * 1_000, (isTotalLine ? 35 : 5));
      }
    }
  }

  const sorted = Array.from(scoredCandidates.entries())
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .map(entry => entry[0]);

  const bestAmount = sorted[0] ?? 0;
  const candidates = sorted.slice(0, 5);

  // Detect category & type from text
  const lower = rawText.toLowerCase();
  let suggestedCategory: string | undefined;
  let suggestedType: 'expense' | 'income' | undefined;
  let suggestedNote: string | undefined;

  if (/(\+\s*\d|lương|luong|thưởng|thuong|nhận tiền|nhan tien|cộng tiền)/i.test(lower)) {
    suggestedType = 'income';
    suggestedCategory = 'salary';
  } else if (/(cafe|cà phê|coffee|highlands|phúc long|trà sữa|tra sua|phở|bún|cơm|ăn|nhà hàng|bánh|kfc|lotteria|jollibee|pizza|lau|lẩu|nướng)/i.test(lower)) {
    suggestedCategory = 'food';
    suggestedNote = 'Ăn uống / Cafe';
  } else if (/(grab|be\b|xanh sm|taxi|xăng|petrolimex|gửi xe|vé xe)/i.test(lower)) {
    suggestedCategory = 'transport';
    suggestedNote = 'Di chuyển';
  } else if (/(shopee|lazada|tiktok|winmart|circle k|familymart|siêu thị|coopmart|aeon|mua sắm|uniqlo|zara)/i.test(lower)) {
    suggestedCategory = 'shopping';
    suggestedNote = 'Mua sắm';
  } else if (/(điện|nước|internet|wifi|viettel|fpt|vnpt|hóa đơn|bill)/i.test(lower)) {
    suggestedCategory = 'bills';
    suggestedNote = 'Thanh toán hóa đơn';
  } else if (/(cgv|lotte cinema|galaxy|xem phim|netflix|spotify|game|karaoke)/i.test(lower)) {
    suggestedCategory = 'entertainment';
    suggestedNote = 'Giải trí';
  } else if (/(thuốc|pharmacy|long châu|pharmacity|bệnh viện|khám)/i.test(lower)) {
    suggestedCategory = 'health';
    suggestedNote = 'Sức khỏe';
  }

  return {
    bestAmount,
    candidates,
    suggestedCategory,
    suggestedType,
    suggestedNote,
    rawText,
  };
}
