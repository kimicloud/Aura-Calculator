import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}'],
  theme: { extend: { colors: {
    aura: { DEFAULT: '#A100FF', light: '#C86BFA', deep: '#7A2FFF', mist: '#E9D5FF' },
    ink: { 900: '#0B0B0F', 800: '#13131A', 700: '#1B1B24' } } } },
  plugins: [],
} satisfies Config;
