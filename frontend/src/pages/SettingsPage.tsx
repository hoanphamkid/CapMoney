import { Bell, Check, CloudUpload, Download, FileText, Globe2, KeyRound, LoaderCircle, LogOut, Save, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type MeResponse } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MeResponse['profile']>(null);
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [currency, setCurrency] = useState('VND');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
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

  useEffect(() => {
    void Promise.all([api.me(), api.sessions()])
      .then(([me, sessionResult]) => {
        setProfile(me.profile);
        setName(me.user.name);
        setPhone(me.user.phone);
        setCurrency(me.profile?.currency ?? 'VND');
        setTimezone(me.profile?.timezone ?? 'Asia/Ho_Chi_Minh');
        setSessions(sessionResult.sessions);
      })
      .catch(() => setError('Không tải được cài đặt tài khoản.'));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark-theme', darkMode);
    localStorage.setItem('capmoney-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const saveProfile = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await api.updateMe({
        name,
        phone,
        locale: profile?.locale ?? 'vi-VN',
        currency,
        timezone,
      });
      setProfile(result.profile);
      await refreshUser();
      setNotice('Đã cập nhật thông tin cá nhân.');
    } catch {
      setError('Không thể lưu thông tin cá nhân.');
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    if (newPassword.length < 8) {
      setError('Mật khẩu mới cần ít nhất 8 ký tự.');
      return;
    }
    setPasswordSaving(true);
    setError('');
    setNotice('');
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
    try {
      const result = await api.transactions();
      const csv = [
        'Ngày,Loại,Số tiền,Danh mục,Ghi chú',
        ...result.transactions.map(row =>
          [row.dateKey, row.type, row.amount, categoryLabel(row.categoryId), JSON.stringify(row.note)].join(','),
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
    }
  };

  return (
    <div className="feature-page settings-page settings-redesign">
      <div className="page-heading settings-hero">
        <div className="settings-hero-copy">
          <p className="eyebrow dark">KHÔNG GIAN CỦA BẠN</p>
          <h1>Cài đặt của bạn</h1>
          <p className="page-subtitle">Một vài lựa chọn nhỏ để CapMoney vừa vặn với cách bạn quản lý tiền.</p>
          <div className="settings-hero-status"><span /><strong>Dữ liệu riêng tư</strong><small>Đồng bộ an toàn trên các thiết bị</small></div>
        </div>
        <div className="settings-hero-profile">
          <span className="settings-hero-avatar">{(name || 'C').charAt(0).toUpperCase()}</span>
          <div><strong>{name || 'Người dùng CapMoney'}</strong><small>{user?.email || 'Tài khoản CapMoney'}</small></div>
        </div>
      </div>

      {notice && (
        <div className="page-alert success">
          <Check size={15} /> {notice}
        </div>
      )}
      {error && <div className="page-alert">{error}</div>}

      <div className="settings-layout">
        <div className="settings-main">
          <section className="settings-card panel">
            <SettingsHeading icon={<CloudUpload size={17} />} title="Đồng bộ & bản sao" description="Chuyển dữ liệu giữa điện thoại và laptop, xem ngày giờ cập nhật và chọn phiên bản muốn khôi phục." />
            <button className="settings-action" onClick={() => navigate('/app/sync')}><CloudUpload size={16} /> Mở lịch sử bản sao</button>
          </section>
          <section className="settings-card panel">
            <SettingsHeading
              icon={<UserRound size={17} />}
              title="Tài khoản cá nhân"
              description="Thông tin này dùng để hiển thị lời chào và nhận diện không gian của bạn."
            />
            <div className="settings-profile">
              <span className="large-avatar">{name.charAt(0).toUpperCase() || 'C'}</span>
              <div>
                <strong>{name || 'Người dùng CapMoney'}</strong>
                <small>{user?.email}</small>
              </div>
            </div>
            <div className="settings-fields">
              <label className="select-field">
                <span>Họ tên</span>
                <input value={name} onChange={event => setName(event.target.value)} placeholder="Nhập họ tên" />
              </label>
              <label className="select-field">
                <span>Số điện thoại</span>
                <input value={phone} onChange={event => setPhone(event.target.value)} placeholder="Chưa cập nhật" />
              </label>
            </div>
            <button className="settings-save" disabled={saving} onClick={() => void saveProfile()}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Lưu thông tin
            </button>
          </section>

          <section className="settings-card panel">
            <SettingsHeading
              icon={<Globe2 size={17} />}
              title="Hiển thị và tiền tệ"
              description="Cách ngày giờ và số tiền được hiển thị trong ứng dụng."
            />
            <div className="settings-fields">
              <label className="select-field">
                <span>Đơn vị tiền tệ</span>
                <select value={currency} onChange={event => setCurrency(event.target.value)}>
                  <option value="VND">VND — Việt Nam đồng</option>
                  <option value="USD">USD — Đô la Mỹ</option>
                </select>
              </label>
              <label className="select-field">
                <span>Múi giờ</span>
                <select value={timezone} onChange={event => setTimezone(event.target.value)}>
                  <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</option>
                  <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                  <option value="UTC">UTC</option>
                </select>
              </label>
            </div>
            <div className="appearance-row">
              <span className="settings-row-icon">
                <Sun size={16} />
              </span>
              <span>
                <strong>Giao diện tối</strong>
                <small>Tối ưu hiển thị dịu mắt theo phong cách CapMoney.</small>
              </span>
              <button
                type="button"
                className={`toggle ${darkMode ? 'on' : ''}`}
                aria-label="Bật hoặc tắt giao diện tối"
                onClick={() => setDarkMode(value => !value)}
              >
                <i />
              </button>
            </div>
          </section>

          <section className="settings-card panel">
            <SettingsHeading
              icon={<KeyRound size={17} />}
              title="Bảo mật"
              description="Đổi mật khẩu định kỳ để bảo vệ dữ liệu tài chính."
            />
            <div className="settings-fields">
              <label className="select-field">
                <span>Mật khẩu hiện tại</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={event => setCurrentPassword(event.target.value)}
                  placeholder="Nhập mật khẩu hiện tại"
                />
              </label>
              <label className="select-field">
                <span>Mật khẩu mới</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={event => setNewPassword(event.target.value)}
                  placeholder="Ít nhất 8 ký tự"
                />
              </label>
            </div>
            <button
              className="settings-save"
              disabled={passwordSaving || !currentPassword || !newPassword}
              onClick={() => void savePassword()}
            >
              {passwordSaving ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />} Đổi mật khẩu
            </button>
          </section>
        </div>

        <aside className="settings-side">
          <section className="settings-card panel">
            <SettingsHeading
              icon={<Bell size={17} />}
              title="Thông báo"
              description="Bật hoặc tắt các nhắc nhở thông minh trong ứng dụng."
            />
            <button
              type="button"
              className="settings-check-btn"
              onClick={() => {
                const next = !remindRecord;
                setRemindRecord(next);
                localStorage.setItem('capmoney-remind-record', String(next));
                setNotice('Đã lưu tùy chọn thông báo.');
              }}
            >
              <span className={`check-box ${remindRecord ? 'checked' : ''}`}>
                {remindRecord && <Check size={13} />}
              </span>
              <span>Nhắc ghi chép giao dịch hàng ngày</span>
            </button>
            <button
              type="button"
              className="settings-check-btn"
              onClick={() => {
                const next = !remindBill;
                setRemindBill(next);
                localStorage.setItem('capmoney-remind-bill', String(next));
                setNotice('Đã lưu tùy chọn thông báo.');
              }}
            >
              <span className={`check-box ${remindBill ? 'checked' : ''}`}>
                {remindBill && <Check size={13} />}
              </span>
              <span>Nhắc lịch thanh toán hóa đơn</span>
            </button>
          </section>

          <section className="settings-card panel">
            <SettingsHeading
              icon={<FileText size={17} />}
              title="Dữ liệu cá nhân"
              description="Tải xuống bản sao toàn bộ lịch sử giao dịch của bạn."
            />
            <button className="settings-action" onClick={() => void exportData()}>
              <Download size={15} /> Xuất CSV giao dịch
            </button>
          </section>

          <section className="settings-card panel">
            <SettingsHeading
              icon={<ShieldCheck size={17} />}
              title="Phiên đăng nhập"
              description={`${sessions.length} thiết bị đang hoạt động.`}
            />
            {sessions.slice(0, 3).map(session => (
              <div className="session-row" key={session.id}>
                <span className="session-dot" />
                <span>
                  <strong>{session.deviceName || 'Trình duyệt'}</strong>
                  <small>{session.current ? 'Thiết bị hiện tại' : new Date(session.lastActiveAt).toLocaleDateString('vi-VN')}</small>
                </span>
              </div>
            ))}
            <button
              className="settings-action muted"
              onClick={async () => {
                await api.logoutOthers();
                setNotice('Đã đăng xuất các thiết bị khác.');
                const result = await api.sessions();
                setSessions(result.sessions);
              }}
            >
              <LogOut size={15} /> Đăng xuất thiết bị khác
            </button>
          </section>

          <button
            className="logout-settings"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <LogOut size={15} /> Đăng xuất tài khoản
          </button>
        </aside>
      </div>
    </div>
  );
}

function SettingsHeading({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="settings-heading">
      <span>{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function categoryLabel(value: string) {
  return (
    ({
      food: 'Ăn uống',
      shopping: 'Mua sắm',
      transport: 'Di chuyển',
      entertainment: 'Giải trí',
      bills: 'Hóa đơn',
      health: 'Sức khỏe',
      salary: 'Lương',
      bonus: 'Thưởng',
      investment: 'Đầu tư',
      gift: 'Được tặng',
      other: 'Khác',
      transfer: 'Chuyển tiền',
    } as Record<string, string>)[value] ?? 'Khác'
  );
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
