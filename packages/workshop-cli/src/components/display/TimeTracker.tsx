import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

export interface TimeTrackerProps {
  startTime?: string;
  compact?: boolean;
}

/**
 * Live time tracker component
 * Shows elapsed time since workshop start with live updates
 */
export const TimeTracker: React.FC<TimeTrackerProps> = ({
  startTime,
  compact = false
}) => {
  const [elapsedTime, setElapsedTime] = useState('0m 0s');

  useEffect(() => {
    if (!startTime) {
      setElapsedTime('0m 0s');
      return;
    }

    const updateElapsed = () => {
      const start = new Date(startTime);
      const now = new Date();
      const diffMs = now.getTime() - start.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffSecs = Math.floor((diffMs % 60000) / 1000);
      setElapsedTime(`${diffMins}m ${diffSecs}s`);
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  if (compact) {
    return <Text color="white">{elapsedTime}</Text>;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text bold color="magenta">Zeit</Text>
      </Box>
      <Text dimColor>{elapsedTime}</Text>
    </Box>
  );
};
