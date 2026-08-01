import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Workspace packages (@docsgraph/*) are resolved via normal pnpm
// workspace symlinking — no custom aliasing needed since each package's
// package.json points `main`/`types` directly at its TS source.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
