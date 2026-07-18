import { render } from 'ink-testing-library';
import type { ReactElement } from 'react';

/**
 * Render a component with optional providers
 */
export function renderWithProviders(component: ReactElement) {
  return render(component);
}

/**
 * Simulate key press on stdin
 */
export function simulateKeyPress(stdin: { write: (key: string) => void }, key: string) {
  stdin.write(key);
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 1000,
  interval = 50
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('waitFor timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Common key codes for testing
 */
export const KEYS = {
  ENTER: '\r',
  ESCAPE: '\u001B',
  UP: '\u001B[A',
  DOWN: '\u001B[B',
  LEFT: '\u001B[D',
  RIGHT: '\u001B[C',
  TAB: '\t',
  SPACE: ' ',
  BACKSPACE: '\u007F',
};
