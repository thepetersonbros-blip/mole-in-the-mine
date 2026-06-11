import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/client',
  base: './',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 8192
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      },
      '/healthz': 'http://localhost:3000'
    }
  }
});
