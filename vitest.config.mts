import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

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
        // API routes are excluded from coverage metrics because:
        // 1. Route handlers are thin wrappers that delegate to services (which ARE covered)
        // 2. Testing HTTP concerns (status codes, headers) is done via integration tests
        // 3. Rate limiting tests exist in app/api/**/__tests__/ but measuring line
        //    coverage on route handlers provides limited insight
        // Tests still run for API routes - this only affects coverage reporting.
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
