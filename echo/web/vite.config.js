import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4100', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
