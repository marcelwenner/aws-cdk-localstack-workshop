import React from 'react';
import { ModernSelect, SelectOption } from './ModernSelect.js';

interface SelectPromptProps {
  message: string;
  choices: SelectOption[];
  onSelect: (value: string) => void;
}

export const SelectPrompt: React.FC<SelectPromptProps> = ({
  message,
  choices,
  onSelect
}) => {
  return (
    <ModernSelect
      title={message.toUpperCase()} // Titel in Uppercase sieht technischer aus
      options={choices}
      onSelect={onSelect}
    />
  );
};

// Re-export SelectOption for backwards compatibility
export type { SelectOption };
