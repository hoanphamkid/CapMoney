import { useCallback, useEffect, useState } from 'react';
import { loadWorkPay, saveWorkPay, WORK_PAY_EVENT, WORK_PAY_KEY, type ShiftId } from '../utils/workPay';

export function useWorkPay(email: string) {
  const [config, setConfig] = useState(() => loadWorkPay(email));
  useEffect(() => {
    const refresh = () => setConfig(loadWorkPay(email));
    const onStorage = (event: StorageEvent) => { if (!event.key || event.key === WORK_PAY_KEY) refresh(); };
    refresh();
    window.addEventListener(WORK_PAY_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(WORK_PAY_EVENT, refresh); window.removeEventListener('storage', onStorage); };
  }, [email]);
  const selectShift = useCallback((selectedShift: ShiftId) => saveWorkPay({ ...loadWorkPay(email), selectedShift }), [email]);
  return { config, selectShift };
}
