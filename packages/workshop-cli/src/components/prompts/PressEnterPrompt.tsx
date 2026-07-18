import React from 'react';
import { Box, Text, useInput } from 'ink';

interface PressEnterPromptProps {
  message: string;
  onPress: () => void;
}

export const PressEnterPrompt: React.FC<PressEnterPromptProps> = ({
  message,
  onPress
}) => {
  useInput((input, key) => {
    if (key.return) {
      onPress();
    }
  });

  return (
    <Box marginY={1}>
      <Text color="green">❯ </Text>
      <Text bold color="cyan">{message}</Text>
      <Text dimColor> (Enter)</Text>
    </Box>
  );
};
