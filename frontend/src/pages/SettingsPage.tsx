import { ArrowLeft, Bell, Camera, Check, ChevronRight, CloudUpload, Crown, Download, Globe2, KeyRound, LoaderCircle, LogOut, Monitor, Pencil, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, authenticatedRequest } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useAppTheme } from '../contexts/ThemeContext';
import { HOME_THEMES, HomeThemePicker } from '../components/HomeThemePicker';
import { AccountAvatar } from '../components/AccountAvatar';
import { ProCheckout } from '../components/ProCheckout';
import { bankPushEnabled, disableBankPush, enableBankPush, getBankPushConfig, isHomeScreenApp, type BankPushConfig } from '../services/bankNotifications';
import { ALL_CATEGORY_LABELS } from '../constants/categories';
import { PRO_SETTINGS_PATH } from '../constants/pro';
import { encodeAvatar } from '../services/avatarImage';
import './settings-page.css';

const settingsSections = {
  profile: 'Hồ sơ cá nhân',
  pro: 'CapMoney Pro',
  appearance: 'Giao diện và khu vực',
  notifications: 'Thông báo',
  install: 'Thêm vào màn hình chính',
  password: 'Đổi mật khẩu',
  sessions: 'Thiết bị đăng nhập',
  data: 'Xuất dữ liệu',
} as const;

type SettingsSection = keyof typeof settingsSections;

export function SettingsPage() {
  const { user, profile, logout, updateProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const section = (Object.keys(settingsSections) as SettingsSection[]).find(key => key === searchParams.get('section'));
  const heading = useRef<HTMLHeadingElement>(null);
  const { theme, setTheme } = useAppTheme();
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [currency, setCurrency] = useState(profile?.currency ?? 'VND');
  const [timezone, setTimezone] = useState(profile?.timezone ?? 'Asia/Ho_Chi_Minh');
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarDraft, setAvatarDraft] = useState<string | null>();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('capmoney-theme') !== 'light');
  const [remindRecord, setRemindRecord] = useState(() => localStorage.getItem('capmoney-remind-record') !== 'false');
  const [remindBill, setRemindBill] = useState(() => localStorage.getItem('capmoney-remind-bill') !== 'false');
  const [sessions, setSessions] = useState<Array<{ id: string; deviceName: string; lastActiveAt: string; current: boolean }>>([]);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [bankPush, setBankPush] = useState(false);
  const [bankPushBusy, setBankPushBusy] = useState(true);
  const [bankPushConfig, setBankPushConfig] = useState<BankPushConfig | null>(null);
  const [bankPushTestBusy, setBankPushTestBusy] = useState(false);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    heading.current?.focus();
    setNotice('');
    setError('');
    if (section !== 'password') {
      setCurrentPassword('');
      setNewPassword('');
    }
  }, [section]);

  useEffect(() => {
    let disposed = false;
    void Promise.all([bankPushEnabled(), getBankPushConfig()]).then(([enabled, config]) => {
      if (!disposed) { setBankPush(enabled); setBankPushConfig(config); }
    })
      .catch(() => {}).finally(() => { if (!disposed) setBankPushBusy(false); });
    return () => { disposed = true; };
  }, []);

  const toggleBankPush = async () => {
    setBankPushBusy(true); setError(''); setNotice('');
    try {
      if (bankPush) await disableBankPush(); else {
        // Keep permission.request() as the first async operation after the
        // tap; this is required by Safari/iOS. The helper loads VAPID config
        // after the permission prompt when the initial probe is still pending.
        await enableBankPush(bankPushConfig ?? undefined);
      }
      setBankPush(!bankPush);
      setNotice(bankPush ? 'Đã tắt thông báo MB Bank trên thiết bị này.' : 'Đã bật thông báo tiền vào và tiền ra MB Bank trên thiết bị này.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không thể thay đổi thông báo MB Bank.');
    } finally { setBankPushBusy(false); }
  };

  const sendBankPushTest = async () => {
    setBankPushTestBusy(true); setError(''); setNotice('');
    try {
      const result = await authenticatedRequest<{ sent: number; removed: number; failed: number; devices: number }>('/notifications/test', { method: 'POST' });
      if (result.sent > 0) setNotice('Đã gửi thông báo thử. Kiểm tra Notification Center trên iPhone.');
      else if (result.removed > 0) setError('Subscription trên thiết bị đã hết hạn. Hãy tắt rồi bật lại thông báo.');
      else if (result.devices === 0) setError('Thiết bị này chưa đăng ký nhận thông báo. Hãy tắt rồi bật lại công tắc MB Bank.');
      else if (result.failed > 0) setError('Apple từ chối subscription hiện tại. Hãy tắt rồi bật lại công tắc MB Bank để tạo subscription mới.');
      else setError('Máy chủ chưa gửi được thông báo tới thiết bị này. Hãy kiểm tra VAPID và quyền thông báo trên iPhone.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không thể gửi thông báo thử.');
    } finally { setBankPushTestBusy(false); }
  };

  useEffect(() => {
    void api.sessions()
      .then(result => setSessions(result.sessions))
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark-theme', darkMode);
    localStorage.setItem('capmoney-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const saveProfile = async (fields: 'profile' | 'appearance') => {
    if (!user || saving || avatarBusy) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await updateProfile({
        name: fields === 'profile' ? name : user.name,
        phone: fields === 'profile' ? phone : user.phone ?? '',
        locale: profile?.locale ?? 'vi-VN',
        currency: fields === 'appearance' ? currency : profile?.currency ?? 'VND',
        timezone: fields === 'appearance' ? timezone : profile?.timezone ?? 'Asia/Ho_Chi_Minh',
        avatarUrl: fields === 'profile' ? avatarDraft : undefined,
      });
      if (fields === 'profile') setAvatarDraft(undefined);
      setNotice(fields === 'profile' ? 'Đã lưu hồ sơ.' : 'Đã lưu tiền tệ và múi giờ.');
    } catch {
      setError('Không thể lưu thay đổi.');
    } finally {
      setSaving(false);
    }
  };

  const selectAvatar = async (file: File) => {
    setAvatarBusy(true);
    setError('');
    setNotice('');
    try {
      setAvatarDraft(await encodeAvatar(file));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể xử lý ảnh đại diện.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const savePassword = async () => {
    setNotice('');
    if (newPassword.length < 8) {
      setError('Mật khẩu mới cần ít nhất 8 ký tự.');
      return;
    }
    setPasswordSaving(true);
    setError('');
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setNotice('Đã đổi mật khẩu thành công.');
    } catch {
      setError('Mật khẩu hiện tại không đúng hoặc mật khẩu mới chưa hợp lệ.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    setError('');
    setNotice('');
    try {
      const result = await api.transactions();
      const csv = [
        'Ngày,Loại,Số tiền,Danh mục,Ghi chú',
        ...result.transactions.map(row =>
          [row.dateKey, row.type, row.amount, ALL_CATEGORY_LABELS[row.categoryId] ?? 'Khác', JSON.stringify(row.note)].join(','),
        ),
      ].join('\n');
      const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `capmoney-transactions-${todayKey()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice('Đã xuất file CSV lịch sử giao dịch.');
    } catch {
      setError('Không thể xuất dữ liệu.');
    } finally {
      setExporting(false);
    }
  };

  const logoutOtherDevices = async () => {
    setSessionsBusy(true);
    setError('');
    setNotice('');
    try {
      await api.logoutOthers();
      setSessions(items => items.filter(session => session.current));
      setNotice('Đã đăng xuất các thiết bị khác.');
    } catch {
      setError('Không thể đăng xuất các thiết bị khác.');
    } finally {
      setSessionsBusy(false);
    }
  };

  const installed = isHomeScreenApp();
  const themeLabel = HOME_THEMES.find(item => item.id === theme)?.label;
  const displayName = user?.name || 'Người dùng CapMoney';
  const avatarPreview = avatarDraft === undefined ? profile?.avatarUrl : avatarDraft;
  const hasPro = user?.proEnabled === true;

  return (
    <div className="cm-settings">
      <header className="cm-settings-header">
        {section && (
          <button
            type="button"
            className="cm-settings-back"
            aria-label="Quay lại danh sách cài đặt"
            onClick={() => {
              if (location.state?.fromSettings) navigate(-1);
              else navigate('/app/settings', { replace: true });
            }}
          >
            <ArrowLeft size={22} aria-hidden="true" />
          </button>
        )}
        <h1 ref={heading} tabIndex={-1}>{section ? settingsSections[section] : 'Cài đặt'}</h1>
      </header>

      <div className="cm-settings-messages">
        {error && <p className="cm-settings-message is-error" role="alert">{error}</p>}
        {notice && <p className="cm-settings-message" role="status"><Check size={18} aria-hidden="true" />{notice}</p>}
      </div>

      {!section && (
        <>
          <Link className="cm-settings-identity" to="?section=profile" state={{ fromSettings: true }} aria-label={`Chỉnh sửa hồ sơ của ${displayName}`}>
            <AccountAvatar className="cm-settings-avatar" name={displayName} src={profile?.avatarUrl} />
            <span className="cm-settings-copy">
              <strong>{displayName}</strong>
              <small>{user?.email}</small>
            </span>
            <Pencil size={18} aria-hidden="true" />
          </Link>
          <ProLink active={hasPro} />

          <SettingsGroup title="Tùy chọn">
            <SettingsLink section="appearance" icon={<Globe2 size={19} />} detail={themeLabel} />
            <SettingsLink section="notifications" icon={<Bell size={19} />} detail="MB Bank và nhắc nhở" />
            <SettingsLink section="install" icon={<Smartphone size={19} />} detail={installed ? 'Đã cài đặt' : undefined} />
          </SettingsGroup>
          <SettingsGroup title="Tài khoản và bảo mật">
            <SettingsLink section="password" icon={<KeyRound size={19} />} />
            <SettingsLink section="sessions" icon={<ShieldCheck size={19} />} />
          </SettingsGroup>
          <SettingsGroup title="Dữ liệu">
            <SettingsLink to="/app/sync" title="Đồng bộ và bản sao" icon={<CloudUpload size={19} />} />
            <SettingsLink section="data" icon={<Download size={19} />} detail="Lịch sử giao dịch CSV" />
          </SettingsGroup>
          <button
            type="button"
            className="cm-settings-button is-danger"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <LogOut size={18} aria-hidden="true" /> Đăng xuất
          </button>
        </>
      )}

      {section === 'profile' && (
        <>
        <form className="cm-settings-detail" onSubmit={event => { event.preventDefault(); void saveProfile('profile'); }}>
          <div className="cm-profile-photo">
            <AccountAvatar className="cm-settings-avatar cm-profile-avatar" name={name} src={avatarPreview} />
            <div>
              <strong>Ảnh đại diện</strong>
              <input
                type="file"
                accept="image/*"
                aria-label="Tệp ảnh đại diện"
                ref={avatarInput}
                hidden
                onChange={event => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) void selectAvatar(file);
                }}
              />
              <div className="cm-profile-photo-actions">
                <button type="button" className="cm-settings-button" disabled={saving || avatarBusy} onClick={() => avatarInput.current?.click()}>
                  <Camera size={16} aria-hidden="true" /> {avatarBusy ? 'Đang xử lý…' : avatarPreview ? 'Đổi ảnh' : 'Chọn ảnh'}
                </button>
                {avatarPreview && <button type="button" className="cm-settings-button is-danger" disabled={saving || avatarBusy} onClick={() => setAvatarDraft(profile?.avatarUrl ? null : undefined)}>Gỡ ảnh</button>}
              </div>
            </div>
          </div>
          <label className="cm-settings-field">
            Họ tên
            <input value={name} disabled={saving} onChange={event => setName(event.target.value)} autoComplete="name" required />
          </label>
          <label className="cm-settings-field">
            Số điện thoại
            <input type="tel" value={phone} disabled={saving} onChange={event => setPhone(event.target.value)} autoComplete="tel" placeholder="Chưa cập nhật" />
          </label>
          <button className="cm-settings-button is-primary" disabled={!user || saving || avatarBusy}>
            {saving ? 'Đang lưu…' : 'Lưu hồ sơ'}
          </button>
        </form>
        <ProLink active={hasPro} />
        </>
      )}

      {section === 'pro' && <ProCheckout />}

      {section === 'appearance' && (
        <>
          <div className="cm-settings-list">
            <button
              type="button"
              className="cm-settings-row"
              aria-haspopup="dialog"
              aria-expanded={themePickerOpen}
              onClick={() => setThemePickerOpen(true)}
            >
              <span className="cm-settings-copy"><strong>Chủ đề màu</strong><small>{themeLabel}</small></span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <SettingsSwitch label="Giao diện tối" checked={darkMode} onClick={() => setDarkMode(value => !value)} />
          </div>
          <form className="cm-settings-detail" onSubmit={event => { event.preventDefault(); void saveProfile('appearance'); }}>
            <label className="cm-settings-field">
              Đơn vị tiền tệ
              <select value={currency} disabled={saving} onChange={event => setCurrency(event.target.value)}>
                <option value="VND">VND — Việt Nam đồng</option>
                <option value="USD">USD — Đô la Mỹ</option>
              </select>
            </label>
            <label className="cm-settings-field">
              Múi giờ
              <select value={timezone} disabled={saving} onChange={event => setTimezone(event.target.value)}>
                <option value="Asia/Ho_Chi_Minh">Việt Nam (GMT+7)</option>
                <option value="Asia/Bangkok">Bangkok (GMT+7)</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <button className="cm-settings-button is-primary" disabled={!user || saving || avatarBusy}>
              {saving ? 'Đang lưu…' : 'Lưu khu vực'}
            </button>
          </form>
          {themePickerOpen && <HomeThemePicker selected={theme} onSelect={setTheme} onClose={() => setThemePickerOpen(false)} />}
        </>
      )}

      {section === 'notifications' && (
        <>
          <SettingsGroup title="MB Bank">
            <SettingsSwitch label="Thông báo tiền vào và tiền ra MB Bank" checked={bankPush} busy={bankPushBusy} onClick={() => void toggleBankPush()} />
          </SettingsGroup>
          <div className="cm-settings-detail">
            <p role="status">
              {bankPushBusy ? 'Đang kiểm tra thông báo…' : bankPushConfig?.enabled
                ? 'Máy chủ đã sẵn sàng gửi thông báo.'
                : 'Chưa xác nhận máy chủ có thể gửi thông báo.'}
            </p>
            {!installed && <p>Trên iPhone hoặc iPad, hãy mở CapMoney từ biểu tượng đã thêm vào màn hình chính để bật thông báo.</p>}
            <button type="button" className="cm-settings-button" disabled={!bankPush || bankPushBusy || bankPushTestBusy} onClick={() => void sendBankPushTest()}>
              <Bell size={17} aria-hidden="true" /> {bankPushTestBusy ? 'Đang gửi…' : 'Gửi thông báo thử'}
            </button>
          </div>
          <SettingsGroup title="Nhắc nhở">
            <SettingsSwitch label="Ghi chép giao dịch hằng ngày" checked={remindRecord} onClick={() => {
              setRemindRecord(!remindRecord);
              localStorage.setItem('capmoney-remind-record', String(!remindRecord));
            }} />
            <SettingsSwitch label="Lịch thanh toán hóa đơn" checked={remindBill} onClick={() => {
              setRemindBill(!remindBill);
              localStorage.setItem('capmoney-remind-bill', String(!remindBill));
            }} />
          </SettingsGroup>
        </>
      )}

      {section === 'install' && (
        <div className="cm-settings-detail">
          {installed ? <p>CapMoney đang chạy từ màn hình chính.</p> : (
            <ol className="cm-settings-steps">
              <li>Mở CapMoney trong Safari trên iPhone hoặc iPad.</li>
              <li>Nhấn <strong>Chia sẻ</strong>, rồi chọn <strong>Thêm vào Màn hình chính</strong>.</li>
              <li>Nhấn <strong>Thêm</strong> và mở CapMoney từ biểu tượng mới.</li>
            </ol>
          )}
        </div>
      )}

      {section === 'password' && (
        <form className="cm-settings-detail" onSubmit={event => { event.preventDefault(); void savePassword(); }}>
          <label className="cm-settings-field">
            Mật khẩu hiện tại
            <input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required />
          </label>
          <label className="cm-settings-field">
            Mật khẩu mới
            <input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={8} placeholder="Ít nhất 8 ký tự" required />
          </label>
          <button className="cm-settings-button is-primary" disabled={passwordSaving || !currentPassword || !newPassword}>
            {passwordSaving ? 'Đang lưu…' : 'Đổi mật khẩu'}
          </button>
        </form>
      )}

      {section === 'sessions' && (
        <>
          <div className="cm-settings-list">
            {sessions.length ? sessions.map(session => (
              <div className="cm-settings-row" key={session.id}>
                <span className="cm-settings-icon"><Monitor size={19} aria-hidden="true" /></span>
                <span className="cm-settings-copy">
                  <strong>{session.deviceName || 'Trình duyệt'}</strong>
                  <small>{session.current ? 'Thiết bị hiện tại' : new Date(session.lastActiveAt).toLocaleDateString('vi-VN')}</small>
                </span>
              </div>
            )) : <p className="cm-settings-empty">Không có thiết bị để hiển thị.</p>}
          </div>
          <button className="cm-settings-button" type="button" disabled={sessionsBusy || !sessions.some(session => !session.current)} onClick={() => void logoutOtherDevices()}>
            <LogOut size={18} aria-hidden="true" /> {sessionsBusy ? 'Đang đăng xuất…' : 'Đăng xuất thiết bị khác'}
          </button>
        </>
      )}

      {section === 'data' && (
        <div className="cm-settings-detail">
          <p>Tải lịch sử giao dịch của bạn dưới dạng CSV.</p>
          <button className="cm-settings-button is-primary" type="button" disabled={exporting} onClick={() => void exportData()}>
            <Download size={18} aria-hidden="true" /> {exporting ? 'Đang xuất…' : 'Tải file CSV'}
          </button>
        </div>
      )}
    </div>
  );
}

function ProLink({ active }: { active: boolean }) {
  return (
    <Link className="cm-settings-pro-link" to={PRO_SETTINGS_PATH} state={{ fromSettings: true }}>
      <span className="cm-pro-icon"><Crown size={21} aria-hidden="true" /></span>
      <span className="cm-settings-copy">
        <strong>{active ? 'CapMoney Pro' : 'Mở khóa Pro'}</strong>
        <small>{active ? 'Đã kích hoạt' : 'Trải nghiệm tất cả tiện ích'}</small>
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </Link>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cm-settings-group">
      <h2>{title}</h2>
      <div className="cm-settings-list">{children}</div>
    </section>
  );
}

type SettingsLinkProps = { icon: ReactNode; detail?: string } & (
  { section: SettingsSection; to?: never; title?: never } |
  { section?: never; to: string; title: string }
);

function SettingsLink({ section, to, title, icon, detail }: SettingsLinkProps) {
  return (
    <Link className="cm-settings-row" to={to ?? `?section=${section}`} state={section ? { fromSettings: true } : undefined}>
      <span className="cm-settings-icon" aria-hidden="true">{icon}</span>
      <span className="cm-settings-copy">
        <strong>{section ? settingsSections[section] : title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </Link>
  );
}

function SettingsSwitch({ label, checked, busy, onClick }: { label: string; checked: boolean; busy?: boolean; onClick: () => void }) {
  return (
    <button className="cm-settings-row" type="button" role="switch" aria-checked={checked} aria-busy={busy} disabled={busy} onClick={onClick}>
      <span className="cm-settings-copy"><strong>{label}</strong></span>
      {busy ? <LoaderCircle size={20} className="spin" aria-hidden="true" /> : <span className="cm-settings-switch" aria-hidden="true" />}
    </button>
  );
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
