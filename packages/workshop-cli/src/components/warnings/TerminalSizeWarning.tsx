/**
 * Terminal Size Warning
 *
 * Shows helpful message when terminal is too small
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface TerminalSizeWarningProps {
  currentSize: string;
  recommendedSize: string;
  isNarrow: boolean;
  isShort: boolean;
}

export const TerminalSizeWarning: React.FC<TerminalSizeWarningProps> = ({
  currentSize,
  recommendedSize,
  isNarrow,
  isShort,
}) => {
  return (
    <Box flexDirection="column">
      <Text bold color="yellow">⚠️  Terminal zu klein</Text>
      <Text>Aktuell: <Text color="red">{currentSize}</Text> | Min: <Text color="green">{recommendedSize}</Text></Text>

      <Box marginY={1} />

      <Text bold color="cyan">Schnellfix (VS Code):</Text>
      <Text dimColor>• Strg+B (Sidebar schließen) → mehr Platz</Text>
      <Text dimColor>• Terminal maximieren (Rechtsklick)</Text>
      <Text dimColor>• External Terminal: iTerm2, Warp</Text>

      <Box marginY={1} />
      <Text dimColor>Enter = Fortfahren | Ctrl+C = Beenden</Text>
    </Box>
  );
};
