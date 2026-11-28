import { createContext, useContext, useEffect, useLayoutEffect, useState, type PropsWithChildren } from 'react';
import { APPEARANCE_RESTORED, HOME_THEMES, MAX_WALLPAPER_DATA_LENGTH, resolveColorMode, themePalette, themeVariables, WALLPAPER_FILTERS, type AppearanceMode, type ColorMode, type HomeTheme, type Wallpaper } from '../constants/appearance';

const modeKey = 'capmoney-theme';
const themeKey = 'capmoney-home-theme';
const wallpaperKey = 'capmoney-wallpaper-v1';

type Appearance = { theme: HomeTheme; mode: AppearanceMode; wallpaper: Wallpaper | null };

type ThemeContextValue = Appearance & {
  colorMode: ColorMode;
  setTheme: (theme: HomeTheme) => void;
  setMode: (mode: AppearanceMode) => void;
  setWallpaper: (wallpaper: Wallpaper | null) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readAppearance(): Appearance {
  const appearance: Appearance = { theme: 'classic', mode: 'theme', wallpaper: null };
  try {
    const savedMode = localStorage.getItem(modeKey);
    if (savedMode === 'light' || savedMode === 'dark') appearance.mode = savedMode;
    const savedTheme = localStorage.getItem(themeKey);
    appearance.theme = HOME_THEMES.find(theme => theme.id === savedTheme)?.id ?? 'classic';
    const rawWallpaper = localStorage.getItem(wallpaperKey);
    const wallpaper = rawWallpaper ? JSON.parse(rawWallpaper) : null;
    if (typeof wallpaper?.src === 'string' && wallpaper.src.startsWith('data:image/jpeg;base64,')
      && wallpaper.src.length <= MAX_WALLPAPER_DATA_LENGTH && WALLPAPER_FILTERS.some(filter => filter.id === wallpaper.filter)) {
      appearance.wallpaper = wallpaper;
    }
  } catch { /* A saved appearance can be unavailable in private browsing or after a storage reset. */ }
  return appearance;
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [appearance, setAppearance] = useState(readAppearance);
  const { theme, mode } = appearance;
  const colorMode = resolveColorMode(mode, theme);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const palette = themePalette(theme, colorMode);
    root.dataset.colorMode = colorMode;
    root.classList.toggle('dark-theme', colorMode === 'dark');
    for (const [name, value] of Object.entries(themeVariables(palette))) root.style.setProperty(name, value);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.bg);
  }, [theme, colorMode]);

  useEffect(() => {
    const refresh = () => setAppearance(readAppearance());
    const onStorage = (event: StorageEvent) => {
      if (!event.key || [modeKey, themeKey, wallpaperKey].includes(event.key)) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(APPEARANCE_RESTORED, refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(APPEARANCE_RESTORED, refresh);
    };
  }, []);

  const value: ThemeContextValue = {
    ...appearance,
    colorMode,
    setMode(next) {
      setAppearance(current => ({ ...current, mode: next }));
      try { localStorage.setItem(modeKey, next); } catch { /* Retain the current view. */ }
    },
    setTheme(next) {
      setAppearance(current => ({ ...current, theme: next }));
      try { localStorage.setItem(themeKey, next); } catch { /* Retain the current view. */ }
    },
    setWallpaper(next) {
      if (next) localStorage.setItem(wallpaperKey, JSON.stringify(next));
      else localStorage.removeItem(wallpaperKey);
      setAppearance(current => ({ ...current, wallpaper: next }));
    },
  };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider.');
  return value;
}
