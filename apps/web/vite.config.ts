import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Keep the bundle usable on older Android WebViews/Chrome builds used by event phones.
    // ES modules remain available there, while newer syntax is transpiled to a safer baseline.
    target: ['es2019', 'safari13'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Keep local development on the same relative `/api` URLs as production. The browser talks
    // only to Vite and Vite forwards to Nest, avoiding CORS drift and "Failed to fetch" logins.
    proxy: {
      '/api': {
        target: process.env.DEV_API_ORIGIN ?? 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
});
