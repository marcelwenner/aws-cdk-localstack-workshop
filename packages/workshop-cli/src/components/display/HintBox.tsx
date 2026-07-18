import React from 'react';
import { Box, Text } from 'ink';

interface HintBoxProps {
  hints: string[];
  level?: number;
}

export const HintBox: React.FC<HintBoxProps> = ({ hints, level = 1 }) => {
  return (
    <Box flexDirection="column" marginY={1} borderStyle="round" borderColor="yellow" padding={1}>
      <Text bold color="yellow">
        💡 Hint {level}:
      </Text>

      <Box flexDirection="column" marginTop={1}>
        {hints.map((hint, index) => (
          <Text key={`hintbox-${hint.slice(0, 20)}`} color="yellow">
            {index + 1}. {hint}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
