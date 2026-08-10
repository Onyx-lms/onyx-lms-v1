import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff', 100: '#d9e6ff', 500: '#3b6fe0',
          600: '#2b57c4', 700: '#22459b', 900: '#162c63',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
