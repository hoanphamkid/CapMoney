import { useEffect, useState } from 'react';

const preferenceKey = 'capmoney_work_pay_v1';
const defaultPrices = { phoPrice: 50_000, milkTeaPrice: 35_000 };

function referencePrice(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function readReferencePrices(email: string) {
  try {
    const stored = localStorage.getItem(preferenceKey);
    const preferences = stored ? JSON.parse(stored) : null;
    if (email && preferences?.version === 1 && preferences.ownerEmail === email.trim().toLowerCase()) {
      return {
        phoPrice: referencePrice(preferences.phoPrice, defaultPrices.phoPrice),
        milkTeaPrice: referencePrice(preferences.milkTeaPrice, defaultPrices.milkTeaPrice),
      };
    }
  } catch { /* Use the default prices when the saved preferences are unavailable. */ }
  return defaultPrices;
}

export function useSpendingReferencePrices(email: string) {
  const [prices, setPrices] = useState(() => readReferencePrices(email));
  useEffect(() => {
    const refresh = () => setPrices(readReferencePrices(email));
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === preferenceKey) refresh();
    };
    refresh();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [email]);
  return prices;
}
