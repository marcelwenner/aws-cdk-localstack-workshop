import React from 'react';
import { Box, Text } from 'ink';

export interface DashboardHeaderProps {
  currentPhase: number;
  phaseTitle?: string;
}

/**
 * Fixed header component for the dashboard
 * Simplified, stable design without gradient complexity
 */
export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  currentPhase,
  phaseTitle
}) => {
  return (
    <Box
      borderStyle="single"
      borderColor="blue"
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      width="100%"
      justifyContent="space-between"
      paddingX={2}
    >
      <Box>
        <Text bold color="blue">🎓 AWS CDK & LocalStack</Text>
      </Box>

      <Box>
        <Text dimColor>Phase {currentPhase}</Text>
        {phaseTitle && (
          <>
            <Text color="gray"> │ </Text>
            <Text bold color="magenta">{phaseTitle}</Text>
          </>
        )}
      </Box>
    </Box>
  );
};
