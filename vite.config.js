import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Forward /api/* to the Express proxy so the browser never sees the token.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
