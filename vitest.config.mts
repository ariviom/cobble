import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@': __dirname,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    coverage: {
      reporter: ['text', 'html'],
      include: ['app/**/*.{ts,tsx}'],
      exclude: [
        'app/api/**',
        'app/styles/**',
        'app/**/__tests__/**',
        'next.config.*',
        'postcss.config.*',
        'vitest.config.*',
        'vitest.setup.*',
      ],
    },
  },
});


