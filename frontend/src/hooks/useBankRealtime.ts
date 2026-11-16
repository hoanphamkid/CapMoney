import { useEffect } from 'react';
import { authenticatedRequest, realtimeUrl } from '../services/api';

export type BankEvent = { id: string; amount: number; type: 'income' | 'expense' };
export const BANK_DATA_CHANGED = 'capmoney:bank-data-changed';

export function useBankRealtime(onTransaction: (event: BankEvent) => void) {
  useEffect(() => {
    let stopped = false;
    let stream: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const seen = new Set<string>();
    const changed = () => window.dispatchEvent(new Event(BANK_DATA_CHANGED));
    const connect = () => {
      if (stopped) return;
      stream = new EventSource(realtimeUrl, { withCredentials: true });
      stream.addEventListener('ready', changed);
      stream.addEventListener('bank-transaction', event => {
        try {
          const tx = JSON.parse((event as MessageEvent).data) as BankEvent;
          if (!tx.id || !Number.isFinite(tx.amount) || !['income', 'expense'].includes(tx.type) || seen.has(tx.id)) return;
          seen.add(tx.id);
          if (seen.size > 500) seen.delete(seen.values().next().value!);
          changed();
          onTransaction(tx);
        } catch { /* Ignore malformed events and reconnect normally. */ }
      });
      stream.addEventListener('reconnect', () => {
        stream?.close();
        timer = setTimeout(connect, 250);
      });
      stream.onerror = () => {
        stream?.close();
        timer = setTimeout(() => {
          // Reuse the normal session renewal when an access cookie expires.
          void authenticatedRequest('/auth/me').catch(() => {}).finally(connect);
        }, 5000);
      };
    };
    connect();
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'capmoney:bank-data-changed') changed();
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.close();
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, [onTransaction]);
}
