import { useState, useEffect } from 'react';
import { useInput, useApp } from 'ink';

interface ExitHandlerOptions {
  /** Whether this handler should be active (default: true) */
  isActive?: boolean;
}

/**
 * Hook to handle graceful exit with Ctrl+C confirmation
 * Requires two Ctrl+C presses to exit (guards against accidental exit)
 */
export function useExitHandler(options: ExitHandlerOptions = {}) {
  const { isActive = true } = options;
  const { exit } = useApp();
  const [exitWarning, setExitWarning] = useState(false);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (exitWarning) {
        // Second Ctrl+C - actually exit
        exit();
      } else {
        // First Ctrl+C - show warning
        setExitWarning(true);
      }
    }
  }, { isActive });

  // Reset warning after 2 seconds
  useEffect(() => {
    if (exitWarning) {
      const timer = setTimeout(() => {
        setExitWarning(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [exitWarning]);

  return { exitWarning };
}
