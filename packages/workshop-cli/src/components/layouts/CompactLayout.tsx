import React from 'react';
import { Box, Text } from 'ink';

export interface CompactLayoutProps {
  children: React.ReactNode;
  currentPhase: number;
  phaseTitle?: string;
  completedPhases: number[];
  startTime?: string;
  dockerRunning?: boolean;
  localstackRunning?: boolean;
  postgresRunning?: boolean;
  watcherState?: {
    watching: boolean;
    lastChange?: string;
    changeCount: number;
  };
}

/**
 * Compact 4-line footer layout
 * Non-blocking mode that shows key info without monopolizing terminal
 *
 * Structure:
 * - Main content (children)
 * - 4-line footer with:
 *   1. Phase + Docker/LocalStack status
 *   2. Status + Postgres/Mode hint
 *   3. Watcher + Timestamp
 *   4. Help hint
 */
export const CompactLayout: React.FC<CompactLayoutProps> = ({
  children,
  currentPhase,
  phaseTitle,
  completedPhases,
  startTime,
  dockerRunning = false,
  localstackRunning = false,
  postgresRunning = false,
  watcherState,
}) => {
  const formatTime = () => {
    return new Date().toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getStatusText = () => {
    if (!watcherState?.watching) return 'Idle';
    if (watcherState.changeCount > 0) return `${watcherState.changeCount} changes detected`;
    return 'Watching...';
  };

  return (
    <Box flexDirection="column">
      {/* Main content renders first (above footer) */}
      <Box flexGrow={1} flexDirection="column">
        {children}
      </Box>

      {/* 4-line footer */}
      <Box
        flexDirection="column"
        marginTop={1}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
      >
        {/* Line 1: Phase + Docker/LocalStack */}
        <Box justifyContent="space-between">
          <Text>
            <Text bold color="cyan">Phase {currentPhase}/6:</Text> {phaseTitle || 'Loading...'}
          </Text>
          <Text>
            {dockerRunning ? (
              <Text color="green">✓ Docker</Text>
            ) : (
              <Text color="red">✗ Docker</Text>
            )}
            {` │ `}
            {localstackRunning ? (
              <Text color="green">✓ LocalStack</Text>
            ) : (
              <Text color="red">✗ LocalStack</Text>
            )}
          </Text>
        </Box>

        {/* Line 2: Status + Postgres/Mode hint */}
        <Box justifyContent="space-between">
          <Text>
            <Text dimColor>Status:</Text> {getStatusText()}
          </Text>
          <Text>
            {postgresRunning ? (
              <Text color="green">✓ Postgres</Text>
            ) : (
              <Text color="red">✗ Postgres</Text>
            )}
            {` │ `}
            <Text dimColor>[m] Full UI</Text>
          </Text>
        </Box>

        {/* Line 3: Watcher + Timestamp */}
        <Box justifyContent="space-between">
          <Text>
            <Text dimColor>Completed:</Text> {completedPhases.length}/6 phases
          </Text>
          <Text dimColor>Last update: {formatTime()}</Text>
        </Box>

        {/* Line 4: Help hint */}
        <Box>
          <Text dimColor italic>
            💡 Press 'm' to toggle full dashboard
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
