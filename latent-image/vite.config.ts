import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { hmr: false },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 12000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
} as never);
