import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  Crop,
  Delete,
  LoaderCircle,
  Mic,
  MicOff,
  Plus,
  ReceiptText,
  ScanText,
  Share,
  ShoppingCart,
  SquarePen,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api, type Wallet } from '../services/api';
import { scanReceiptImage } from '../utils/receiptOcr';
import { CameraView } from './CameraView';
import { ImageCropModal } from './ImageCropModal';

const expenseCategories = [
  { id: 'food', label: 'Ăn uống' },
  { id: 'shopping', label: 'Mua sắm' },
  { id: 'transport', label: 'Di chuyển' },
  { id: 'bills', label: 'Hóa đơn' },
  { id: 'entertainment', label: 'Giải trí' },
  { id: 'health', label: 'Sức khỏe' },
  { id: 'other', label: 'Khác' },
];

const incomeCategories = [
  { id: 'salary', label: 'Lương' },
  { id: 'bonus', label: 'Thưởng' },
  { id: 'investment', label: 'Đầu tư' },
  { id: 'gift', label: 'Được tặng' },
  { id: 'other', label: 'Thu khác' },
];

type ExpenseCaptureProps = {
  selectedDate: string;
  initialType?: 'expense' | 'income';
  defaultWalletId?: string;
  onClose: () => void;
  onSaved: () => void;
};

export function ExpenseCapture({
  selectedDate,
  initialType = 'expense',
  defaultWalletId,
  onClose,
  onSaved,
}: ExpenseCaptureProps) {
  const [step, setStep] = useState<'camera' | 'form'>('camera');
  const [type, setType] = useState<'expense' | 'income'>(initialType);
  const [expr, setExpr] = useState(''); // calculator expression or plain digits
  const [note, setNote] = useState('');
  const [category, setCategory] = useState(initialType === 'income' ? 'salary' : 'food');
  const [dateKey, setDateKey] = useState(selectedDate || todayKey());
  const [walletId, setWalletId] = useState(defaultWalletId && defaultWalletId !== 'all' ? defaultWalletId : '');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [image, setImage] = useState<File | null>(null);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrCandidates, setOcrCandidates] = useState<number[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const [ocrAutoFilled, setOcrAutoFilled] = useState(false);
  const [listening, setListening] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(true);
  const [celebrate, setCelebrate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(() => (image ? URL.createObjectURL(image) : ''), [image]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    let active = true;
    const initWallets = async () => {
      try {
        const result = await api.wallets();
        let list = result.wallets;
        if (!list.length) {
          const w1 = await api.createWallet({ name: 'Wallet', type: 'cash', openingBalance: 0, color: '#163e36' });
          const w2 = await api.createWallet({ name: 'Bank', type: 'bank', openingBalance: 0, color: '#3c6684' });
          list = [w1.wallet, w2.wallet];
        }
        if (!active) return;
        setWallets(list);
        setWalletId(current => {
          if (current && list.some(w => w.id === current)) return current;
          return list[0]?.id ?? '';
        });
      } catch {
        if (active) setError('Không tải được danh sách ví.');
      }
    };
    void initWallets();
    return () => {
      active = false;
    };
  }, []);

  // Automatically scan numbers on captured/selected bill photo
  const triggerOcrScan = async (targetFile: File, forceOverwrite = false) => {
    setOcrScanning(true);
    setOcrAutoFilled(false);
    try {
      const result = await scanReceiptImage(targetFile);
      setOcrCandidates(result.candidates);
      if (result.bestAmount > 0) {
        setExpr(current => {
          if (forceOverwrite || !current || current === '0') {
            setOcrAutoFilled(true);
            if (navigator.vibrate) navigator.vibrate(45);
            return String(result.bestAmount);
          }
          return current;
        });
      }
      if (result.suggestedType) {
        setType(result.suggestedType);
      }
      if (result.suggestedCategory) {
        setCategory(result.suggestedCategory);
      }
      if (result.suggestedNote) {
        setNote(current => current || result.suggestedNote || '');
      }
    } finally {
      setOcrScanning(false);
    }
  };

  useEffect(() => {
    if (!image) {
      setOcrCandidates([]);
      setOcrScanning(false);
      return;
    }
    void triggerOcrScan(image, false);
  }, [image]);

  const switchType = (nextType: 'expense' | 'income') => {
    setType(nextType);
    if (nextType === 'income' && !incomeCategories.some(item => item.id === category)) {
      setCategory('salary');
    } else if (nextType === 'expense' && !expenseCategories.some(item => item.id === category)) {
      setCategory('food');
    }
  };

  const categories = type === 'income' ? incomeCategories : expenseCategories;

  const evaluateExpression = (raw: string): number => {
    const cleaned = raw.replace(/[^0-9+\-*/.]/g, '');
    if (!cleaned) return 0;
    try {
      // Safe simple arithmetic evaluation (+, -, *, /)
      const tokens = cleaned.match(/(\d+(?:\.\d+)?|[+\-*/])/g);
      if (!tokens || tokens.length === 0) return 0;
      let current = Number(tokens[0]) || 0;
      for (let i = 1; i < tokens.length; i += 2) {
        const op = tokens[i];
        const nextVal = Number(tokens[i + 1]);
        if (!Number.isFinite(nextVal)) break;
        if (op === '+') current += nextVal;
        else if (op === '-') current = Math.max(0, current - nextVal);
        else if (op === '*') current = Math.round(current * nextVal);
        else if (op === '/') current = nextVal !== 0 ? Math.round(current / nextVal) : current;
      }
      return Math.max(0, Math.round(current));
    } catch {
      return Number(raw.replace(/[^0-9]/g, '')) || 0;
    }
  };

  const hasOperator = /[+\-*/]/.test(expr);
  const rawNumericAmount = evaluateExpression(expr);

  const formattedDisplay = useMemo(() => {
    if (!expr) return '0';
    if (!hasOperator) {
      const n = Number(expr.replace(/[^0-9]/g, '')) || 0;
      return n.toLocaleString('en-US');
    }
    // Format numbers inside expression with commas (e.g., 60,000÷2)
    return expr
      .replace(/\d+/g, m => Number(m).toLocaleString('en-US'))
      .replace(/\*/g, '×')
      .replace(/\//g, '÷');
  }, [expr, hasOperator]);

  const parseAmountFromNote = (text: string): number => {
    const matchK = text.match(/(\d+(?:[.,]\d+)?)\s*(k|nghin|nghìn|ngàn)/i);
    if (matchK) {
      return Math.round(parseFloat(matchK[1].replace(',', '.')) * 1_000);
    }
    const matchTr = text.match(/(\d+(?:[.,]\d+)?)\s*(tr|trieu|triệu|củ)/i);
    if (matchTr) {
      return Math.round(parseFloat(matchTr[1].replace(',', '.')) * 1_000_000);
    }
    const matchRaw = text.match(/\b(\d{4,9})\b/);
    if (matchRaw) {
      return Number(matchRaw[1]);
    }
    return 0;
  };

  const startVoiceInput = () => {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setError('Trình duyệt này chưa hỗ trợ nhận diện giọng nói.');
      return;
    }

    try {
      const rec = new SpeechRec() as {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        onstart: () => void;
        onend: () => void;
        onerror: () => void;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        start: () => void;
      };
      rec.lang = 'vi-VN';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onstart = () => {
        setListening(true);
        if (navigator.vibrate) navigator.vibrate(30);
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      rec.onresult = event => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim() ?? '';
        if (!transcript) return;
        const parsedAmt = parseAmountFromNote(transcript);
        if (parsedAmt > 0) {
          setExpr(String(parsedAmt));
          setOcrAutoFilled(true);
          if (navigator.vibrate) navigator.vibrate([30, 50]);
        }
        const cleanedNote = transcript
          .replace(/(\d+(?:[.,]\d+)?)\s*(k|nghin|nghìn|ngàn|tr|trieu|triệu|củ|đ|d|vnd)/gi, '')
          .trim();
        setNote(cleanedNote || transcript);
      };
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const handleKeyPress = (key: string) => {
    setError('');
    setOcrAutoFilled(false);
    if (navigator.vibrate) navigator.vibrate(12);

    if (key === 'C') {
      setExpr('');
      return;
    }
    if (key === 'BACK') {
      setExpr(prev => prev.slice(0, -1));
      return;
    }
    if (['+', '-', '*', '/'].includes(key)) {
      setExpr(prev => {
        if (!prev) return '';
        if (/[+\-*/]$/.test(prev)) {
          return prev.slice(0, -1) + key;
        }
        return prev + key;
      });
      return;
    }
    if (key === '000') {
      setExpr(prev => {
        if (!prev || prev === '0') return '';
        if (/[+\-*/]$/.test(prev)) return prev;
        return prev + '000';
      });
      return;
    }
    // Digit 0-9
    setExpr(prev => {
      if (prev === '0') return key;
      if (prev.length >= 15) return prev;
      return prev + key;
    });
  };

  const saveTransaction = async (keepOpenForNextShot = false) => {
    let numericAmount = evaluateExpression(expr);
    if (!numericAmount && note.trim()) {
      const guessed = parseAmountFromNote(note);
      if (guessed > 0) {
        numericAmount = guessed;
        setExpr(String(guessed));
      }
    }
    if (!numericAmount) {
      setError('Vui lòng nhập số tiền.');
      setKeypadOpen(true);
      return;
    }
    let targetWalletId = walletId || wallets[0]?.id || '';
    setSaving(true);
    setError('');
    try {
      if (!targetWalletId) {
        const created = await api.createWallet({ name: 'Wallet', type: 'cash', openingBalance: 0, color: '#163e36' });
        targetWalletId = created.wallet.id;
        setWallets([created.wallet]);
        setWalletId(targetWalletId);
      }
      await api.createTransaction({
        type,
        amount: numericAmount,
        note: note.trim() || (categories.find(c => c.id === category)?.label ?? ''),
        categoryId: category,
        walletId: targetWalletId,
        transactionDate: dateKey,
        image,
      });
      if (navigator.vibrate) navigator.vibrate([35, 50, 75]);
      if (keepOpenForNextShot) {
        setExpr('');
        setNote('');
        setImage(null);
        setStep('camera');
      } else {
        setCelebrate(true);
        setTimeout(() => {
          onSaved();
        }, 380);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Không thể lưu giao dịch.');
    } finally {
      setSaving(false);
    }
  };

  if (pendingCropFile) {
    return (
      <ImageCropModal
        file={pendingCropFile}
        onCancel={() => setPendingCropFile(null)}
        onConfirm={cropped => {
          setPendingCropFile(null);
          setImage(cropped);
        }}
      />
    );
  }

  if (step === 'camera') {
    return (
      <CameraView
        onCaptured={file => {
          setImage(file);
          setStep('form');
        }}
        onSelected={file => {
          setImage(file);
          setStep('form');
        }}
        onManual={() => setStep('form')}
        onClose={onClose}
      />
    );
  }

  const isToday = dateKey === todayKey();
  const displayDate = isToday ? 'Hôm nay' : formatShortDate(dateKey);

  return (
    <div className="cm-capture-modal" onClick={onClose}>
      <div className="cm-capture-sheet cm-spring-pop" onClick={event => event.stopPropagation()}>
        {celebrate && (
          <div className="cm-confetti-burst" aria-hidden="true">
            <span>🎉</span>
            <span>✨</span>
            <span>💸</span>
            <span>🌟</span>
            <span>🎊</span>
            <span>💎</span>
          </div>
        )}

        {/* TOP ROUNDED PHOTO CARD WITH TRANSLUCENT FROSTED AMOUNT OVERLAY */}
        <div
          className={`cm-photo-stage ${type} ${ocrScanning ? 'scanning' : ''}`}
          style={previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined}
        >
          {ocrScanning && <div className="cm-ocr-laser-beam" aria-hidden="true" />}

          <header className="cm-capture-top">
            <button
              type="button"
              className="cm-pill-btn"
              onClick={() => {
                setImage(null);
                setStep('camera');
              }}
            >
              Hủy
            </button>
            <div className="cm-capture-top-right">
              {image && (
                <button
                  type="button"
                  className="cm-pill-btn"
                  onClick={() => setPendingCropFile(image)}
                  title="Cắt hoặc xoay lại ảnh"
                >
                  <Crop size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                  Cắt ảnh
                </button>
              )}
              <span className="cm-quota-badge">
                <SquarePen size={13} /> 3/3
              </span>
            </div>
          </header>

          {/* Translucent ("mờ mờ") Frosted Glass Entry Box at Bottom of Photo */}
          <div
            className={`cm-entry-card frosted-glass ${type} ${ocrAutoFilled ? 'ocr-pop' : ''}`}
            onClick={() => setKeypadOpen(true)}
          >
            <div className="cm-amount-row">
              <span className={`cm-amount-sign ${type}`}>{type === 'expense' ? '−' : '+'}</span>
              <span className="cm-amount-display">{formattedDisplay}</span>
              <span className="cm-amount-currency">đ</span>
            </div>

            <div
              className="cm-detail-input-wrap"
              onClick={e => {
                e.stopPropagation();
                setKeypadOpen(false);
              }}
            >
              <span className="cm-detail-angle">∠</span>
              <input
                type="text"
                className="cm-detail-input"
                value={note}
                onFocus={() => setKeypadOpen(false)}
                onChange={event => {
                  setError('');
                  setNote(event.target.value);
                }}
                placeholder={listening ? '🎙️ Đang nghe...' : 'Thêm chi tiết'}
                onKeyDown={event => {
                  if (event.key === 'Enter') void saveTransaction(false);
                }}
              />
            </div>
          </div>
        </div>

        {/* "[🔍 Tự động nhận diện]" Pill Right Below Photo */}
        <div className="cm-ocr-bar-below">
          <button
            type="button"
            className={`cm-auto-detect-pill ${ocrScanning ? 'scanning' : ''}`}
            onClick={() => {
              if (ocrCandidates.length > 1) {
                setShowCandidates(v => !v);
              } else if (image) {
                void triggerOcrScan(image, true);
              }
            }}
          >
            <ScanText size={13} className={ocrScanning ? 'spin' : ''} />
            <span>
              {ocrScanning
                ? 'Đang nhận diện số...'
                : ocrCandidates.length > 1
                  ? `Tự động nhận diện (${ocrCandidates.length} số)`
                  : 'Tự động nhận diện'}
            </span>
          </button>

          {showCandidates && ocrCandidates.length > 0 && (
            <div className="cm-ocr-candidates-row">
              {ocrCandidates.map(val => (
                <button
                  key={val}
                  type="button"
                  className={`cm-ocr-candidate-chip ${rawNumericAmount === val ? 'active' : ''}`}
                  onClick={() => {
                    setExpr(String(val));
                    setShowCandidates(false);
                    if (navigator.vibrate) navigator.vibrate(25);
                  }}
                >
                  {val.toLocaleString('en-US')}đ
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Category & Wallet Select Pills */}
        <div className="cm-Select-pills">
          <label className="cm-select-pill">
            <ShoppingCart size={15} />
            <select value={category} onChange={event => setCategory(event.target.value)}>
              {categories.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>

          <label className="cm-select-pill">
            <ReceiptText size={15} />
            <select value={walletId} onChange={event => setWalletId(event.target.value)}>
              {wallets.map(wallet => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
        </div>

        {/* Expense / Income Switcher */}
        <div className="cm-type-switcher">
          <button
            type="button"
            className={`cm-type-btn expense ${type === 'expense' ? 'active' : ''}`}
            onClick={() => switchType('expense')}
            aria-label="Khoản chi"
          >
            <ArrowUpRight size={18} />
          </button>
          <button
            type="button"
            className={`cm-type-btn income ${type === 'income' ? 'active' : ''}`}
            onClick={() => switchType('income')}
            aria-label="Khoản thu"
          >
            <ArrowDownLeft size={18} />
          </button>
        </div>

        {/* Date Pill & Blue Floating Mic Button */}
        <div className="cm-date-mic-row">
          <button
            type="button"
            className="cm-date-pill"
            onClick={() => {
              if (dateInputRef.current?.showPicker) {
                dateInputRef.current.showPicker();
              } else {
                dateInputRef.current?.focus();
              }
            }}
          >
            <CalendarDays size={15} />
            <span>{displayDate}</span>
            <ChevronDown size={14} />
            <input
              ref={dateInputRef}
              type="date"
              className="cm-hidden-date"
              value={dateKey}
              onChange={event => {
                if (event.target.value) setDateKey(event.target.value);
              }}
            />
          </button>

          <button
            type="button"
            className={`cm-floating-mic-btn ${listening ? 'listening' : ''}`}
            onClick={startVoiceInput}
            aria-label="Nhập bằng giọng nói"
            title="Nhập bằng giọng nói"
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        </div>

        {error && <div className="cm-capture-error">{error}</div>}

        {/* BUILT-IN CALCULATOR KEYPAD (Matches Screenshot 100%) */}
        {keypadOpen ? (
          <div className="cm-calc-grid">
            <button type="button" className="cm-calc-key op-clear" onClick={() => handleKeyPress('C')}>
              C
            </button>
            <button type="button" className="cm-calc-key op-tint" onClick={() => handleKeyPress('/')}>
              ÷
            </button>
            <button type="button" className="cm-calc-key op-tint" onClick={() => handleKeyPress('*')}>
              ×
            </button>
            <button
              type="button"
              className="cm-calc-key"
              onClick={() => handleKeyPress('BACK')}
              aria-label="Xoá lùi"
            >
              <Delete size={19} />
            </button>

            <button type="button" className="cm-calc-key" onClick={() => handleKeyPress('7')}>
              7
            </button>
            <button type="button" className="cm-calc-key" onClick={() => handleKeyPress('8')}>
              8
            </button>
            <button type="button" className="cm-calc-key" onClick={() => handleKeyPress('9')}>
              9
            </button>
            <button type="button" className="cm-calc-key op-tint" onClick={() => handleKeyPress('-')}>
              −
            </button>

            <button type="button" className="cm-calc-key" onClick={() => handleKeyPress('4')}>
              4
            </button>
            <button type="button" className="cm-calc-key" onClick={() => handleKeyPress('5')}>
              5
            </button>
            <button type="button" className="cm-calc-key" onClick={() => handleKeyPress('6')}>
              6
            </button>
            <button type="button" className="cm-calc-key op-tint" onClick={() => handleKeyPress('+')}>
              +
            </button>

            <button type="button" className="cm-calc-key" onClick={() => handleKeyPress('1')}>
              1
            </button>
            <button type="button" className="cm-calc-key" onClick={() => handleKeyPress('2')}>
              2
            </button>
            <button type="button" className="cm-calc-key" onClick={() => handleKeyPress('3')}>
              3
            </button>
            <button
              type="button"
              className={`cm-calc-key done-tall ${type}`}
              disabled={saving}
              onClick={() => {
                if (hasOperator) {
                  setExpr(String(evaluateExpression(expr)));
                } else {
                  void saveTransaction(false);
                }
              }}
            >
              {saving ? (
                <LoaderCircle size={22} className="spin" />
              ) : (
                <>
                  <Check size={22} strokeWidth={2.5} />
                  <span>{hasOperator ? '=' : 'Xong'}</span>
                </>
              )}
            </button>

            <button type="button" className="cm-calc-key zero-wide" onClick={() => handleKeyPress('0')}>
              0
            </button>
            <button type="button" className="cm-calc-key" onClick={() => handleKeyPress('000')}>
              000
            </button>
          </div>
        ) : (
          <div className="cm-action-row">
            <div className="cm-action-item">
              <button
                type="button"
                className="cm-circle-action secondary"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Chọn ảnh từ album"
              >
                <Share size={20} />
              </button>
              <span>Share</span>
            </div>

            <button
              type="button"
              className="cm-circle-action primary"
              disabled={saving}
              onClick={() => void saveTransaction(false)}
              aria-label="Lưu giao dịch"
            >
              {saving ? <LoaderCircle size={26} className="spin" /> : <Check size={28} strokeWidth={2.5} />}
            </button>

            <div className="cm-action-item">
              <button
                type="button"
                className="cm-circle-action add-more"
                disabled={saving}
                onClick={() => {
                  if (rawNumericAmount > 0) {
                    void saveTransaction(true);
                  } else {
                    setStep('camera');
                  }
                }}
                aria-label="Lưu và chụp thêm"
              >
                <Plus size={22} />
              </button>
              <span>Thêm</span>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="visually-hidden"
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) setPendingCropFile(file);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatShortDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  return `${date.getDate()} thg ${date.getMonth() + 1}, ${date.getFullYear()}`;
}
