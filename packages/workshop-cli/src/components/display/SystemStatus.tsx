import React from 'react';
import { Box, Text } from 'ink';

export interface SystemStatusProps {
  dockerRunning?: boolean;
  localstackRunning?: boolean;
  postgresRunning?: boolean;
  compact?: boolean;
}

/**
 * System health status component
 * Shows status of Docker, LocalStack, and PostgreSQL
 */
export const SystemStatus: React.FC<SystemStatusProps> = ({
  dockerRunning = true,
  localstackRunning = true,
  postgresRunning = true,
  compact = false
}) => {
  const getStatusIcon = (running: boolean) => running ? '✅' : '❌';
  const getStatusColor = (running: boolean) => running ? 'green' : 'red';

  if (compact) {
    return (
      <Box>
        <Text>Docker: </Text>
        <Text color={getStatusColor(dockerRunning)}>{getStatusIcon(dockerRunning)}</Text>
        <Text> | LocalStack: </Text>
        <Text color={getStatusColor(localstackRunning)}>{getStatusIcon(localstackRunning)}</Text>
        <Text> | DB: </Text>
        <Text color={getStatusColor(postgresRunning)}>{getStatusIcon(postgresRunning)}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🔧 System Status
        </Text>
      </Box>
      <Box flexDirection="column">
        <Box>
          <Text color={getStatusColor(dockerRunning)}>
            {getStatusIcon(dockerRunning)} Docker
          </Text>
        </Box>
        <Box>
          <Text color={getStatusColor(localstackRunning)}>
            {getStatusIcon(localstackRunning)} LocalStack
          </Text>
        </Box>
        <Box>
          <Text color={getStatusColor(postgresRunning)}>
            {getStatusIcon(postgresRunning)} PostgreSQL
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
