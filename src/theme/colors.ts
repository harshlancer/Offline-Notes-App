export type ThemeMode = 'dark' | 'light';

export const DARK_COLORS = {
  bg: '#0D0D0D',
  surface: '#1A1A1A',
  surfaceUp: '#222222',
  surfaceHigh: '#262626',
  surfaceElevated: '#202020',
  border: 'rgba(255,255,255,0.06)',
  borderMed: 'rgba(255,255,255,0.10)',
  borderFocus: 'rgba(255,255,255,0.15)',
  accent: '#9D8FE8',
  accentDim: 'rgba(157,143,232,0.12)',
  accentSoft: 'rgba(157,143,232,0.18)',
  accentText: '#C3B9FF',
  text: '#E8E8E8',
  textSec: '#A0A0B2',
  textMuted: '#666678',
  textFaint: '#8A8A98',
  danger: '#8F404C',
  dangerDim: 'rgba(143,64,76,0.12)',
  dangerText: '#D78C97',
  white: '#FFFFFF',
};

export const LIGHT_COLORS = {
  bg: '#F6F4FB',
  surface: '#FFFFFF',
  surfaceUp: '#F1EEF8',
  surfaceHigh: '#E8E2F4',
  surfaceElevated: '#FFFFFF',
  border: 'rgba(26,20,38,0.08)',
  borderMed: 'rgba(26,20,38,0.12)',
  borderFocus: 'rgba(124,107,214,0.28)',
  accent: '#7C6BD6',
  accentDim: 'rgba(124,107,214,0.10)',
  accentSoft: 'rgba(124,107,214,0.18)',
  accentText: '#6E59DC',
  text: '#1A1426',
  textSec: '#5F5870',
  textMuted: '#8A8398',
  textFaint: '#716A80',
  danger: '#B24C60',
  dangerDim: 'rgba(178,76,96,0.12)',
  dangerText: '#A44359',
  white: '#FFFFFF',
};

export const COLORS = DARK_COLORS;

export type AppColors = typeof DARK_COLORS;

export const getThemeColors = (mode: ThemeMode): AppColors =>
  mode === 'light' ? LIGHT_COLORS : DARK_COLORS;

export const RADIUS = {
  sm: 10,
  md: 12,
  lg: 16,
  pill: 999,
};

export const NOTE_COLORS = [
  '#9D8FE8',
  '#5A8A6A',
  '#8A6040',
  '#7060A0',
  '#7A6830',
  '#3A7080',
  '#804060',
  '#4A4A60',
];

// Muted pastel palette — low saturation, calm, premium (Notion / Apple Freeform tone)
export const BUBBLE_COLORS = [
  '#C5D5E8', // slate blue
  '#C2D5C4', // sage green
  '#E8C8C9', // dusty rose
  '#EDE3C4', // warm amber
  '#D5C8E8', // soft lavender
  '#EDD5C5', // peach cream
  '#C4D9D9', // muted teal
  '#D6E5C6', // soft lime
  '#E8CCDA', // muted mauve
  '#C8DDD3', // cool mint
];
