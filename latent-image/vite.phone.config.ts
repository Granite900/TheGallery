import { defineConfig } from 'vite';

// Builds the Android companion's web bundle (wrapped by Capacitor).
export default defineConfig({
  root: 'phone',
  base: './',
  server: { hmr: false, fs: { allow: ['..'] } },
  build: {
    outDir: '../dist-phone',
    emptyOutDir: true,
    target: 'es2020',
  },
});
