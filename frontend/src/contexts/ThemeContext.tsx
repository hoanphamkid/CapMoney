import { createContext, useContext } from 'react';
import type { HomeTheme } from '../components/HomeThemePicker';

type ThemeContextValue = {
  theme: HomeTheme;
  setTheme: (theme: HomeTheme) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside AppShell.');
  return value;
}
