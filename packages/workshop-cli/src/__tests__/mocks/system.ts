import { vi } from 'vitest';

export const mockExecAsync = vi.fn();
export const mockExecSync = vi.fn();

vi.mock('child_process', () => ({
  exec: (
    cmd: string,
    cb: (error: Error | null, result: { stdout: string; stderr: string }) => void
  ) => mockExecAsync(cmd, cb),
  execSync: (cmd: string) => mockExecSync(cmd),
}));

// Docker container status helpers
export function mockDockerRunning() {
  mockExecAsync.mockImplementation((_cmd, cb) => {
    cb(null, { stdout: 'running', stderr: '' });
  });
}

export function mockDockerStopped() {
  mockExecAsync.mockImplementation((_cmd, cb) => {
    cb(null, { stdout: '', stderr: '' });
  });
}

export function mockDockerError() {
  mockExecAsync.mockImplementation((_cmd, cb) => {
    cb(new Error('Docker not found'), { stdout: '', stderr: 'Docker not found' });
  });
}
