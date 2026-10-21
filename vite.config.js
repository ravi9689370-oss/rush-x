import { defineConfig } from 'vite';

// base './' => relative asset URLs, works on GitHub Pages subpaths AND Capacitor
export default defineConfig({
  base: './',
  appType: 'spa',
  build: {
    outDir: 'dist',
    target: 'es2019',
    assetsInlineLimit: 0,
    sourcemap: false
  },
  server: {
    host: true,
    port: 5173
  }
});
