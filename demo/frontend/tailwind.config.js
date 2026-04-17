/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"PingFang SC"', '"Source Han Sans SC"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        stage:  '#0b0b0f',
        panel:  '#15151d',
        ink:    '#1f1f2a',
        warmth: '#f4cf83',
        ember:  '#ff5a5f',
        kiss:   '#ffb3c0',
        hintA:  '#f9a8d4',
        hintB:  '#c4b5fd',
        hintC:  '#fcd34d',
      },
      boxShadow: {
        card: '0 18px 48px -16px rgba(255, 91, 95, 0.35)',
        soft: '0 8px 32px -8px rgba(0, 0, 0, 0.45)',
      },
      animation: {
        'pulse-soft': 'pulse 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
