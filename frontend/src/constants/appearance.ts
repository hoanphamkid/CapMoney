export type ColorMode = 'light' | 'dark';
export type AppearanceMode = ColorMode | 'theme';
export const APPEARANCE_RESTORED = 'capmoney:appearance-restored';
export const MAX_WALLPAPER_DATA_LENGTH = 450_000;

type Palette = {
  bg: string; glow: string; panel: string; tint: string; line: string;
  ink: string; muted: string; accent: string; 'on-accent': string;
  danger: string; success: string; warning: string;
};

type Theme = {
  id: string;
  label: string;
  defaultMode: ColorMode;
  hue: number;
  lightAccent: string;
  darkAccent: string;
  original?: Partial<Palette>;
};

export const HOME_THEMES = [
  { id: 'classic', label: 'Mặc định', defaultMode: 'dark', hue: 216, lightAccent: '#245491', darkAccent: '#91bbff', original: {
    bg: '#12141b', glow: '#2a3549', panel: '#17181d', tint: '#30415a', line: '#485b76', ink: '#f4f5f8', muted: '#9ba5bc', 'on-accent': '#13223a',
  } },
  { id: 'sleepy-cat', label: 'Mèo Ngủ', defaultMode: 'light', hue: 28, lightAccent: '#954e32', darkAccent: '#ffc39e', original: {
    bg: '#fff5e7', glow: '#ffdcaf', panel: '#fffaf3', tint: '#f6e1cc', line: '#e4c5a8', ink: '#462c24', muted: '#755a4d', 'on-accent': '#fff9f2',
  } },
  { id: 'strawberry', label: 'Dâu Sữa', defaultMode: 'light', hue: 336, lightAccent: '#a23964', darkAccent: '#ffafd0', original: {
    bg: '#fff1f5', glow: '#ffd3e0', panel: '#fffbfc', tint: '#fbe0e9', line: '#edc1d1', ink: '#512739', muted: '#785466', 'on-accent': '#fff8fa',
  } },
  { id: 'matcha', label: 'Matcha', defaultMode: 'light', hue: 82, lightAccent: '#46662e', darkAccent: '#c2e697', original: {
    bg: '#f3f6e7', glow: '#d8e9b9', panel: '#fcfdf5', tint: '#e4edcf', line: '#cad7ac', ink: '#303c25', muted: '#52624a', 'on-accent': '#fcfff5',
  } },
  { id: 'lavender', label: 'Oải Hương', defaultMode: 'light', hue: 265, lightAccent: '#68439c', darkAccent: '#d9baff', original: {
    bg: '#f5f1ff', glow: '#dfd4fb', panel: '#fdfaff', tint: '#eae1fa', line: '#d4c6ee', ink: '#392b50', muted: '#615275', 'on-accent': '#fff9ff',
  } },
  { id: 'moonlight', label: 'Trăng Sao', defaultMode: 'dark', hue: 250, lightAccent: '#514298', darkAccent: '#e0bcff', original: {
    bg: '#15132a', glow: '#332c58', panel: '#211d38', tint: '#30294a', line: '#4e426d', ink: '#fff4fd', muted: '#c7badc', 'on-accent': '#291735',
  } },
  { id: 'ocean', label: 'Đại Dương', defaultMode: 'light', hue: 199, lightAccent: '#17617f', darkAccent: '#9bdef6' },
  { id: 'amber', label: 'Hổ Phách', defaultMode: 'light', hue: 42, lightAccent: '#795309', darkAccent: '#ffda83' },
  { id: 'slate', label: 'Khói Xám', defaultMode: 'dark', hue: 218, lightAccent: '#475569', darkAccent: '#c7d2df' },
  { id: 'jade', label: 'Ngọc Lam', defaultMode: 'light', hue: 165, lightAccent: '#106251', darkAccent: '#8fe4cb' },
  { id: 'terracotta', label: 'Gạch Nung', defaultMode: 'light', hue: 13, lightAccent: '#9a482f', darkAccent: '#ffb7a0' },
  { id: 'orchid', label: 'Lan Tím', defaultMode: 'dark', hue: 298, lightAccent: '#803473', darkAccent: '#efb4e6' },
] as const satisfies readonly Theme[];

export type HomeTheme = typeof HOME_THEMES[number]['id'];

export function resolveColorMode(mode: AppearanceMode, theme: HomeTheme): ColorMode {
  return mode === 'theme' ? HOME_THEMES.find(item => item.id === theme)!.defaultMode : mode;
}

export function themePalette(theme: HomeTheme, mode: ColorMode): Palette {
  const { hue, lightAccent, darkAccent, original, defaultMode }: Theme = HOME_THEMES.find(item => item.id === theme)!;
  const base: Palette = mode === 'dark' ? {
    bg: `hsl(${hue} 29% 10%)`, glow: `hsl(${hue} 34% 24%)`, panel: `hsl(${hue} 22% 15%)`,
    tint: `hsl(${hue} 24% 23%)`, line: `hsl(${hue} 21% 35%)`, ink: `hsl(${hue} 24% 96%)`,
    muted: `hsl(${hue} 16% 75%)`, accent: darkAccent, 'on-accent': `hsl(${hue} 37% 14%)`,
    danger: '#ffaaa0', success: '#8ce6ad', warning: '#ffd482',
  } : {
    bg: `hsl(${hue} 48% 95%)`, glow: `hsl(${hue} 64% 86%)`, panel: `hsl(${hue} 50% 99%)`,
    tint: `hsl(${hue} 44% 92%)`, line: `hsl(${hue} 30% 78%)`, ink: `hsl(${hue} 34% 19%)`,
    muted: `hsl(${hue} 18% 36%)`, accent: lightAccent, 'on-accent': '#ffffff',
    danger: '#a13d35', success: '#256749', warning: '#815310',
  };
  return mode === defaultMode ? { ...base, ...original } : base;
}

export function themeVariables(palette: Palette): Record<`--home-${keyof Palette}`, string> {
  return Object.fromEntries(Object.entries(palette).map(([name, value]) => [`--home-${name}`, value])) as Record<`--home-${keyof Palette}`, string>;
}

export const WALLPAPER_FILTERS = [
  { id: 'original', label: 'Ảnh gốc', css: 'none' },
  { id: 'warm', label: 'Ấm', css: 'sepia(.42) saturate(1.22)' },
  { id: 'cool', label: 'Lạnh', css: 'saturate(.8) hue-rotate(16deg)' },
  { id: 'mono', label: 'Đen trắng', css: 'grayscale(1)' },
  { id: 'soft', label: 'Dịu', css: 'contrast(.82) saturate(.72) brightness(1.08)' },
  { id: 'vivid', label: 'Rực rỡ', css: 'saturate(1.55) contrast(1.08)' },
  { id: 'blur', label: 'Làm mờ', css: 'blur(8px)' },
] as const;

export type Wallpaper = { src: string; filter: typeof WALLPAPER_FILTERS[number]['id'] };

export function wallpaperFilter(id: Wallpaper['filter']) {
  return WALLPAPER_FILTERS.find(filter => filter.id === id)?.css ?? 'none';
}
