import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { safety: '#E67E22', people: '#5B9E3F', earnings: '#169BD5', compliance: '#8064A2' } } },
  plugins: [],
} satisfies Config;
