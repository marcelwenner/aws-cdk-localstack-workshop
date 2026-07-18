import React from 'react';
import { Box, Text } from 'ink';

interface SuccessMessageProps {
  message: string;
  details?: string[];
}

export const SuccessMessage: React.FC<SuccessMessageProps> = ({
  message,
  details
}) => {
  return (
    <Box flexDirection="column" marginY={1} borderStyle="round" borderColor="green" padding={1}>
      <Text bold color="green">
        🎉 {message}
      </Text>

      {details && details.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {details.map((detail) => (
            <Text key={`success-${detail.slice(0, 30)}`} color="green">
              ✓ {detail}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
};
