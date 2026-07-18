import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.tsx'], // Changed to .tsx for Ink/React
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  silent: true, // Suppress all output except errors
  // Explizit Tests ausschließen
  ignoreWatch: [
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/__tests__/**',
    '**/*.spec.ts',
  ],
  // Suppress warnings for dynamic imports
  esbuildOptions(options) {
    options.logLevel = 'error'; // Only show errors, not warnings
    options.jsx = 'automatic'; // Enable JSX
  },
});
