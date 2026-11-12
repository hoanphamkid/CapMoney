import { useEffect, useRef } from 'react';

// Refresh bank transactions while the page is visible and when returning from the bank app.
export function useAutoRefresh(refresh: () => Promise<unknown>, intervalMs = 10000) {
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; });
  useEffect(() => {
    let busy = false;
    const run = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try { await latest.current(); } catch { /* Keep the last successful data and retry next time. */ }
      finally { busy = false; }
    };
    const timer = window.setInterval(() => void run(), intervalMs);
    const onFocus = () => void run();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [intervalMs]);
}
