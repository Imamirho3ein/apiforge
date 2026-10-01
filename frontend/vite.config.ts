import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const backendProxy: ProxyOptions = {
  target: 'http://localhost:8000',
  changeOrigin: true,
  ws: true,
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': backendProxy,
      '/gateway': backendProxy,
      '/ws': backendProxy,
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the charting library out of the app chunk: it is only needed
        // once the dashboard mounts.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query', 'zustand'],
          charts: ['recharts'],
        },
      },
    },
  },
});
