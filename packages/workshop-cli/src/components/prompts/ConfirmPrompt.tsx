import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';

interface ConfirmPromptProps {
  message: string;
  defaultValue?: boolean;
  onConfirm: (value: boolean) => void;
}

export const ConfirmPrompt: React.FC<ConfirmPromptProps> = ({
  message,
  defaultValue = true,
  onConfirm
}) => {
  const items = [
    { label: '✓ Ja', value: 'yes' },
    { label: '✗ Nein', value: 'no' },
  ];

  // If default is false, swap the order
  if (!defaultValue) {
    items.reverse();
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color="cyan">
        {message}
      </Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={item => onConfirm(item.value === 'yes')}
        />
      </Box>
    </Box>
  );
};
