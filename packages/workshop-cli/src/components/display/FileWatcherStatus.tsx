import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

export interface FileWatcherStatusProps {
  watching: boolean;
  lastChange?: string;
  changeCount: number;
  compact?: boolean;
  active?: boolean; // Only show when user has activated (pressed [v])
}

/**
 * File watcher status indicator for Sidebar
 * Shows watching state and last file change
 */
export const FileWatcherStatus: React.FC<FileWatcherStatusProps> = ({
  watching,
  lastChange,
  changeCount,
  compact = false,
  active = false,
}) => {
  const [blink, setBlink] = useState(true);

  // Slow blink when watching and active (less jarring than spinner)
  useEffect(() => {
    if (!watching || !active) return;

    const interval = setInterval(() => {
      setBlink(b => !b);
    }, 1000); // 1 second blink

    return () => clearInterval(interval);
  }, [watching, active]);

  // Don't show anything if not active yet
  if (!active) {
    return null;
  }

  if (compact) {
    return (
      <Box>
        <Text color={watching ? 'green' : 'gray'}>
          {watching ? '● ' : '○ '}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text color={watching ? 'green' : 'gray'}>
          {watching ? (
            <>
              <Text color={blink ? 'green' : 'gray'}>●</Text>
              <Text bold color="green"> Watching</Text>
            </>
          ) : (
            <Text>○ Paused</Text>
          )}
        </Text>
      </Box>

      {watching && changeCount > 0 && (
        <Box flexDirection="column">
          <Text dimColor>
            Changes: {changeCount}
          </Text>
          {lastChange && (
            <Text dimColor>
              {lastChange.split('/').pop()?.substring(0, 20)}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
};
