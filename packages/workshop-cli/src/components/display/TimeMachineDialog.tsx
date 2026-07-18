/**
 * TimeMachineDialog - Confirmation Dialog for Phase Reset
 *
 * Shows a warning dialog before resetting a phase to its starting state.
 * Informs user that current code will be saved before reset.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';

export interface TimeMachineDialogProps {
  phase: number;
  onConfirm: () => void;
  onCancel: () => void;
  isRestoring?: boolean;
}

export const TimeMachineDialog: React.FC<TimeMachineDialogProps> = ({
  phase,
  onConfirm,
  onCancel,
  isRestoring = false,
}) => {
  useInput((input, key) => {
    if (isRestoring) return; // Disable input during restore

    if (key.return) {
      onConfirm();
    }
    if (key.escape) {
      onCancel();
    }
  });

  if (isRestoring) {
    return (
      <Box
        borderStyle="round"
        borderColor="cyan"
        padding={1}
        flexDirection="column"
        alignItems="center"
      >
        <Text bold color="cyan">Warping through time...</Text>
        <Box marginY={1}>
          <Text>Phase {phase} wird zurückgesetzt</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor="yellow"
      padding={1}
      flexDirection="column"
    >
      <Text bold color="yellow">Time Machine</Text>
      <Box marginY={1} flexDirection="column">
        <Text>Möchtest du Phase {phase} komplett zurücksetzen?</Text>
        <Text dimColor>Alle Änderungen seit Phasen-Start gehen verloren.</Text>
        <Text dimColor>(Dein Code wird vorher gesichert)</Text>
      </Box>
      <Box gap={2}>
        <Text>
          <Text color="green" bold>[Enter]</Text>
          <Text> Warp starten</Text>
        </Text>
        <Text>
          <Text color="gray" bold>[Esc]</Text>
          <Text> Abbrechen</Text>
        </Text>
      </Box>
    </Box>
  );
};
