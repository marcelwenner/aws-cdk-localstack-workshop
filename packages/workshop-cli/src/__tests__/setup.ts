import { vi } from 'vitest';

// Mock child_process für alle Tests
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: vi.fn((cmd, opts, cb) => {
      // Handle both (cmd, cb) and (cmd, opts, cb) signatures
      const callback = typeof opts === 'function' ? opts : cb;
      if (callback) {
        callback(null, { stdout: '', stderr: '' });
      }
      return { stdout: '', stderr: '' };
    }),
    execSync: vi.fn(() => ''),
  };
});

// Mock AWS SDK Clients
vi.mock('@aws-sdk/client-lambda');
vi.mock('@aws-sdk/client-sqs');
vi.mock('@aws-sdk/client-cloudwatch-logs');
