import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        safety: '#C1440E',
        people: '#5B9E3F',
        earnings: '#169BD5',
        compliance: '#8064A2',
        rust: { DEFAULT: '#B5502F', dark: '#8C3D22', light: '#D97D57' },
        cream: { DEFAULT: '#F6EEDF', border: '#E4D2AE' },
        ink: { DEFAULT: '#2A2118', light: '#5C5044' },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
