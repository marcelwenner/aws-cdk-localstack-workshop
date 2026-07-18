import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface LoadingSpinnerProps {
  message: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message }) => {
  return (
    <Box marginY={1}>
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
      <Text> {message}</Text>
    </Box>
  );
};
