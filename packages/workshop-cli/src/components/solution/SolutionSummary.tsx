/**
 * SolutionSummary Component
 *
 * Shows a summary before applying the solution
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SolutionFile } from '../../lib/file-operations.js';

export interface SolutionSummaryProps {
  files: SolutionFile[];
  targetPackage: string;
}

export const SolutionSummary: React.FC<SolutionSummaryProps> = ({
  files,
  targetPackage,
}) => {
  return (
    <Box flexDirection="column" marginY={1}>
      {/* Warning header */}
      <Box marginBottom={1}>
        <Text bold color="yellow">
          ⚠️  Lösung anwenden?
        </Text>
      </Box>

      {/* Summary box */}
      <Box flexDirection="column" borderStyle="double" borderColor="yellow" padding={1}>
        <Box marginBottom={1}>
          <Text>
            Dies wird <Text bold color="yellow">{files.length} Dateien</Text> überschreiben in:
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text color="cyan" bold>
            📦 {targetPackage}
          </Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Die folgenden Dateien werden ersetzt:</Text>
          {files.map((file) => (
            <Box key={file.path} marginLeft={2}>
              <Text dimColor>• {file.path}</Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Info message */}
      <Box marginTop={1} borderStyle="round" borderColor="blue" padding={1}>
        <Box flexDirection="column">
          <Text bold color="blue">
            💡 Was passiert:
          </Text>
          <Text>
            • Deine aktuellen Dateien werden überschrieben
          </Text>
          <Text>
            • Die Phase wird als abgeschlossen markiert
          </Text>
          <Text>
            • Du kannst zur nächsten Phase weitergehen
          </Text>
        </Box>
      </Box>

      {/* Warning footer */}
      <Box marginTop={1}>
        <Text dimColor italic>
          ⚠️  Diese Aktion kann nicht rückgängig gemacht werden
        </Text>
      </Box>
    </Box>
  );
};
