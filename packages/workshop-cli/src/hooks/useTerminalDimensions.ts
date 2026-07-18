import { useStdout } from 'ink';
import { useState, useEffect } from 'react';

export interface TerminalDimensions {
  width: number;
  height: number;
}

/**
 * Eine Zeile unter der Terminalhöhe bleiben! Sobald Inks Output
 * >= stdout.rows ist, ersetzt Ink das inkrementelle Zeilen-Diffing durch
 * "kompletten Screen löschen + neu schreiben" bei JEDEM Render. Mit dem
 * sekündlich tickenden TimeTracker heißt das: Vollbild-Flackern in jeder
 * Shell (PowerShell, cmd, Windows Terminal).
 */
const INK_DIFF_HEADROOM = 1;

/**
 * Hook to track terminal dimensions and handle resize events
 * @returns Current terminal width and height (height minus diff headroom)
 */
export function useTerminalDimensions(): TerminalDimensions {
  const { stdout } = useStdout();
  const [dimensions, setDimensions] = useState<TerminalDimensions>({
    width: stdout.columns || 80,
    height: (stdout.rows || 24) - INK_DIFF_HEADROOM
  });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: stdout.columns || 80,
        height: (stdout.rows || 24) - INK_DIFF_HEADROOM
      });
    };

    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  return dimensions;
}
