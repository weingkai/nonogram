/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * GitHub Pages serves a project site from `/<repo>/`, not the root, so every asset URL
 * needs that prefix. The deploy workflow sets BASE_PATH from the repository name; local
 * dev and local builds stay at `/`.
 *
 * Runtime code must read `import.meta.env.BASE_URL` rather than hard-coding `/` — the
 * tesseract assets in `src/photo/ocr.ts` already do.
 */
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    // Solver and photo tests run in node; UI tests opt into jsdom with a
    // `@vitest-environment jsdom` comment.
    setupFiles: ['./src/test-setup.ts'],
  },
});
