import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';

export interface SelectOption {
  label: string;
  value: string;
}

interface ModernSelectProps {
  options: SelectOption[];
  onSelect: (value: string) => void;
  title?: string;
}

// Custom indicator: Ersetzt das default ">" von ink-select-input
const IndicatorComponent = () => null;

// Das ist die Magie: Wie sieht EINE Zeile aus?
const ItemComponent = ({ isSelected, label }: { isSelected?: boolean; label: string }) => {
  return (
    <Box>
      <Text color={isSelected ? 'blue' : 'gray'} bold={isSelected}>
        {isSelected ? '❯ ' : '  '}
        {label}
      </Text>
    </Box>
  );
};

export const ModernSelect: React.FC<ModernSelectProps> = ({
  options,
  onSelect,
  title = "AKTIONEN"
}) => {
  const items = options.map(opt => ({
    label: opt.label,
    value: opt.value,
    key: opt.value
  }));

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} paddingY={0}>
      {/* Header */}
      <Box paddingTop={1}>
        <Text bold dimColor>{title}</Text>
      </Box>

      {/* Die Liste */}
      <Box flexDirection="column" paddingY={1}>
        <SelectInput
          items={items}
          onSelect={(item) => onSelect(item.value)}
          itemComponent={ItemComponent}
          indicatorComponent={IndicatorComponent}
        />
      </Box>

      {/* Footer Hint */}
      <Box paddingBottom={1}>
        <Text dimColor>(↑/↓ • Enter)</Text>
      </Box>
    </Box>
  );
};
