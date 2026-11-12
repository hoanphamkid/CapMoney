import { Check, Clock, CloudDownload, CloudUpload, History, LoaderCircle, MonitorSmartphone, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../services/api';
import { createBackup, getSyncDevice, listBackups, localBackupInfo, recoverDeviceSettings, restoreBackup, type AccountBackup, type BackupHistory } from '../services/backupApi';

function dateTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return 'Hãy đăng nhập tài khoản trên máy chủ để đồng bộ. Tài khoản chỉ lưu trong trình duyệt chưa thể chia sẻ bản sao.';
  if (error instanceof ApiError && error.code === 'NOT_FOUND') return 'Máy chủ chưa có chức năng bản sao. Hãy cập nhật và khởi động lại backend.';
  return error instanceof Error ? error.message : 'Không thể đồng bộ. Hãy thử lại.';
}

export function SyncPage() {
  const { user } = useAuth();
  const [device] = useState(getSyncDevice);
  const [local, setLocal] = useState(() => localBackupInfo(user!.email));
  const [history, setHistory] = useState<BackupHistory | null>(null);
  const [selected, setSelected] = useState<AccountBackup | null>(null);
  const [source, setSource] = useState<'server' | 'device'>(local?.transactions ? 'device' : 'server');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() => new URLSearchParams(location.search).has('updated') ? 'Đã lưu bản sao và cập nhật dữ liệu thành công.' : '');
  const working = useRef(false);
  const currentEmail = user!.email;

  const refresh = useCallback(async (quiet = false) => {
    if (working.current) return;
    if (!quiet) setLoading(true);
    try {
      await recoverDeviceSettings(currentEmail);
      const deviceData = localBackupInfo(currentEmail);
      setLocal(deviceData);
      if (!deviceData) setSource('server');
      const result = await listBackups();
      setHistory(old => quiet && old && old.backups.length > 20 ? {
        ...result,
        backups: [...result.backups, ...old.backups.filter(backup => !result.backups.some(fresh => fresh.id === backup.id))],
        nextCursor: old.nextCursor,
      } : result);
      setError('');
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [currentEmail]);

  useEffect(() => {
    void refresh();
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(true); };
    const timer = window.setInterval(onFocus, 15000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [refresh]);

  const create = async () => {
    working.current = true;
    setBusy(source === 'device' ? 'Đang tải dữ liệu thiết bị lên web và tạo bản sao…' : 'Đang tạo bản sao trên web…');
    setError(''); setNotice('');
    try {
      await createBackup(currentEmail, label, source);
      setHistory(await listBackups());
      setLabel('');
      setNotice('Đã tạo bản sao. Trên thiết bị còn lại, mở Đồng bộ và chọn bản này để lưu.');
    } catch (err) { setError(errorMessage(err)); }
    finally { working.current = false; setBusy(''); }
  };

  const restore = async () => {
    if (!selected) return;
    working.current = true; setError(''); setNotice(''); setBusy('Đang chuẩn bị bản sao…');
    try {
      const result = await restoreBackup(currentEmail, selected.id, setBusy);
      window.location.replace(`/app/sync?updated=${encodeURIComponent(result.appliedAt)}`);
    } catch (err) { setError(errorMessage(err)); working.current = false; setBusy(''); }
  };

  const loadMore = async () => {
    if (!history?.nextCursor) return;
    working.current = true; setBusy('Đang tải thêm bản sao…');
    try {
      const result = await listBackups(history.nextCursor);
      setHistory(old => old ? { ...result, backups: [...old.backups, ...result.backups] } : result);
    } catch (err) { setError(errorMessage(err)); }
    finally { working.current = false; setBusy(''); }
  };

  return (
    <div className="feature-page cm-sync-page" aria-busy={Boolean(busy)}>
      <div className="page-heading"><div><p className="eyebrow dark">DỮ LIỆU TRÊN MỌI THIẾT BỊ</p><h1>Đồng bộ & bản sao</h1><p className="page-subtitle">Tạo trên điện thoại, lưu trên laptop — hoặc ngược lại.</p></div></div>
      <section className="panel cm-sync-intro">
        <MonitorSmartphone size={28} /><div><strong>{device.deviceName}</strong><p>{currentEmail}</p><small>Không cần mở hai thiết bị cùng lúc: điện thoại tải bản gốc lên trước, máy tính đăng nhập cùng tài khoản sau đó để lấy về. Ngày giờ hiển thị GMT+7.</small></div>
      </section>
      {notice && <div className="page-alert success" role="status"><Check size={16} />{notice}</div>}
      {error && <div className="cm-sync-error" role="alert"><p>{error}</p><button type="button" onClick={() => void refresh()} disabled={Boolean(busy)}>Thử lại</button><Link to="/login">Đăng nhập</Link></div>}
      <section className="panel cm-sync-create">
        <h2><CloudUpload size={20} /> Tạo bản sao</h2>
        <p>Lưu ví, giao dịch, ảnh hóa đơn, lịch nhắc, hạn mức, hũ tiết kiệm, sổ nợ và cài đặt thành một phiên bản mới.</p>
        {local && <label className="select-field"><span>Nguồn dữ liệu</span><select value={source} disabled={Boolean(busy)} onChange={e => setSource(e.target.value as 'server' | 'device')}><option value="server">Dữ liệu trên web + cài đặt thiết bị</option><option value="device">Dữ liệu lưu trên thiết bị này ({local.transactions} giao dịch)</option></select></label>}
        <label className="select-field"><span>Tên bản sao (tùy chọn)</span><input maxLength={80} value={label} disabled={Boolean(busy)} onChange={e => setLabel(e.target.value)} placeholder="Ví dụ: Điện thoại sau khi nhập chi tiêu" /></label>
        <button type="button" className="cm-sync-primary" disabled={Boolean(busy) || loading || !history} onClick={() => void create()}><CloudUpload size={18} /> Tạo bản sao lên web</button>
      </section>
      <section className="panel cm-sync-history">
        <div className="cm-sync-section-head"><h2><History size={20} /> Lịch sử bản sao</h2><button type="button" aria-label="Làm mới bản sao" disabled={Boolean(busy) || loading} onClick={() => void refresh()}><RefreshCw size={17} /></button></div>
        <div className="cm-sync-last-update"><Clock size={16} /><div><strong>Lần cập nhật gần nhất trên thiết bị này</strong><p>{history?.lastApplied ? dateTime(history.lastApplied.appliedAt) : 'Chưa lưu bản sao nào trên thiết bị này'}</p></div></div>
        {history?.backups[0] && <p className="cm-sync-latest">Bản sao mới nhất trên web: {dateTime(history.backups[0].createdAt)}</p>}
        {loading && <p className="cm-sync-loading"><LoaderCircle className="spin" size={18} /> Đang tải lịch sử…</p>}
        {!loading && history?.backups.length === 0 && <p className="cm-sync-empty">Chưa có bản sao. Tạo bản đầu tiên trên thiết bị có dữ liệu bạn muốn giữ.</p>}
        <div className="cm-sync-version-list">
          {history?.backups.map((backup, index) => <button type="button" key={backup.id} className={`cm-sync-version ${selected?.id === backup.id ? 'selected' : ''}`} aria-pressed={selected?.id === backup.id} disabled={Boolean(busy)} onClick={() => { setSelected(backup); setError(''); }}>
            <span className="cm-sync-version-top"><strong>{backup.label || 'Bản sao tài khoản'}</strong>{index === 0 && <em>Mới nhất</em>}</span>
            <time dateTime={backup.createdAt}>{dateTime(backup.createdAt)}</time>
            <span>{backup.deviceName}{backup.deviceId === device.deviceId ? ' · Thiết bị này' : ''}</span>
            <small>{backup.walletCount} ví · {backup.transactionCount} giao dịch · {backup.reminderCount} lịch nhắc · {(backup.sizeBytes / 1024).toFixed(0)} KB</small>
            {backup.kind === 'before_restore' && <small className="cm-sync-safety">Tự lưu trước khi khôi phục</small>}
            {history.lastApplied?.backupId === backup.id && <small className="cm-sync-applied"><Check size={13} /> Đã áp dụng trên thiết bị này</small>}
            {selected?.id === backup.id && <span className="cm-sync-selection">Đã chọn bản này</span>}
          </button>)}
        </div>
        {history?.nextCursor && <button type="button" className="settings-action" disabled={Boolean(busy)} onClick={() => void loadMore()}>Xem các bản cũ hơn</button>}
      </section>
      {selected && <section className="panel cm-sync-restore"><h2><CloudDownload size={20} /> Lưu bản sao đã chọn</h2><strong>{selected.label || dateTime(selected.createdAt)}</strong><p>Thay dữ liệu tài khoản trên web và cài đặt thiết bị này bằng bản đã chọn. Dữ liệu hiện tại được tự tạo bản sao trước khi thay. Thiết bị khác tải lại trang để thấy dữ liệu mới.</p><button type="button" className="cm-sync-primary" disabled={Boolean(busy)} onClick={() => void restore()}><CloudDownload size={18} /> Lưu bản sao & cập nhật</button></section>}
      {history && history.activities.length > 0 && <section className="panel cm-sync-activity"><h2>Lịch sử cập nhật</h2>{history.activities.map(event => <div key={event.id}><Check size={15} /><span><strong>{event.deviceName}</strong><time dateTime={event.appliedAt}>{dateTime(event.appliedAt)}</time></span></div>)}<small>20 lần cập nhật gần nhất</small></section>}
      {busy && <div className="cm-sync-progress" role="status" aria-live="polite"><LoaderCircle className="spin" size={24} /><strong>{busy}</strong><small>Vui lòng giữ trang này mở.</small></div>}
    </div>
  );
}
