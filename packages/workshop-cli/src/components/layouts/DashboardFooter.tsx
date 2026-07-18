import React from 'react';
import { Box, Text } from 'ink';
import { SystemStatus } from '../display/SystemStatus.js';

export interface DashboardFooterProps {
  dockerRunning?: boolean;
  localstackRunning?: boolean;
  postgresRunning?: boolean;
}

/**
 * Fixed footer component for the dashboard
 * Stable design with keyboard shortcuts and system status
 */
export const DashboardFooter: React.FC<DashboardFooterProps> = ({
  dockerRunning = true,
  localstackRunning = true,
  postgresRunning = true
}) => {
  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      borderLeft={false}
      borderRight={false}
      borderBottom={false}
      width="100%"
      justifyContent="space-between"
      paddingX={2}
    >
      <Box>
        <Text dimColor>Keys: [q]uit | [L]ogs | [s]tatus | [m] Compact</Text>
      </Box>
      <Box>
        <SystemStatus
          dockerRunning={dockerRunning}
          localstackRunning={localstackRunning}
          postgresRunning={postgresRunning}
          compact
        />
      </Box>
    </Box>
  );
};
