import { useEffect, useRef } from 'react';
import { BANK_DATA_CHANGED } from './useBankRealtime';

// Refresh bank transactions while the page is visible and when returning from the bank app.
export function useAutoRefresh(refresh: () => Promise<unknown>, intervalMs = 10000) {
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; });
  useEffect(() => {
    let busy = false;
    let pending = false;
    let disposed = false;
    const run = async (force = false) => {
      if (disposed || (!force && document.visibilityState !== 'visible')) return;
      if (busy) { pending = true; return; }
      busy = true;
      try { await latest.current(); } catch { /* Keep the last successful data and retry next time. */ }
      finally {
        busy = false;
        if (pending && !disposed) { pending = false; void run(true); }
      }
    };
    const timer = window.setInterval(() => void run(), intervalMs);
    const onFocus = () => void run();
    const onBankChange = () => void run(true);
    window.addEventListener('focus', onFocus);
    window.addEventListener(BANK_DATA_CHANGED, onBankChange);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(BANK_DATA_CHANGED, onBankChange);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [intervalMs]);
}
