/**
 * Terminal Size Hook
 *
 * Detects terminal dimensions and warns about small terminals
 * REACTIVE: Updates when terminal is resized
 */

import { useState, useEffect, useCallback } from 'react';
import { useStdout } from 'ink';

export interface TerminalSize {
  columns: number;
  rows: number;
  isTooSmall: boolean;
  isNarrow: boolean;
  isShort: boolean;
  isVeryShort: boolean;
  recommendedSize: string;
  sizeKey: string; // For forcing re-render on significant size change
}

const MIN_COLUMNS = 80; // Warn only on extremely narrow terminals
const MIN_ROWS = 20; // Warn only on extremely short terminals
const BIGTEXT_MIN_ROWS = 40; // BigText visibility threshold (needs lots of space)
const RECOMMENDED_COLUMNS = 120;
const RECOMMENDED_ROWS = 40;

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();

  const [size, setSize] = useState({
    columns: stdout.columns || 80,
    rows: stdout.rows || 24,
  });

  useEffect(() => {
    const handleResize = () => {
      // Clear screen on resize to prevent ghosting
      process.stdout.write('\x1B[2J\x1B[0f');

      setSize({
        columns: stdout.columns || 80,
        rows: stdout.rows || 24,
      });
    };

    // Listen for resize events
    stdout.on('resize', handleResize);

    // Cleanup
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  const isNarrow = size.columns < MIN_COLUMNS;
  const isShort = size.rows < MIN_ROWS;
  const isVeryShort = size.rows < BIGTEXT_MIN_ROWS;
  const isTooSmall = isNarrow || isShort;

  // Create a key based on size category (not exact pixels) to prevent constant re-renders
  const sizeKey = `${Math.floor(size.columns / 20)}-${Math.floor(size.rows / 5)}`;

  return {
    columns: size.columns,
    rows: size.rows,
    isTooSmall,
    isNarrow,
    isShort,
    isVeryShort,
    recommendedSize: `${RECOMMENDED_COLUMNS}x${RECOMMENDED_ROWS}`,
    sizeKey,
  };
}
