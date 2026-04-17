/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', '"PingFang SC"', '"Source Han Sans SC"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // 所有主题 token 以 CSS 变量形式发布，切换风格 = 切换 <html data-theme>
        stage:  'var(--color-stage)',
        panel:  'var(--color-panel)',
        ink:    'var(--color-ink)',
        warmth: 'var(--color-warmth)',
        ember:  'var(--color-ember)',
        kiss:   'var(--color-kiss)',
        hintA:  'var(--color-hintA)',
        hintB:  'var(--color-hintB)',
        hintC:  'var(--color-hintC)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        soft: 'var(--shadow-soft)',
      },
      animation: {
        'pulse-soft': 'pulse 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
