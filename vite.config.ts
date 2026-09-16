/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Solver tests run in node; UI tests opt into jsdom with a
    // `@vitest-environment jsdom` comment.
    setupFiles: ['./src/test-setup.ts'],
  },
});
