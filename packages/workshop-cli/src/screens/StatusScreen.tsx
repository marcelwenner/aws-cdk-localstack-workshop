import React from 'react';
import { Box, Text, useInput } from 'ink';
import { workshopConfig } from '../core/config/workshop.config.js';

interface StatusScreenProps {
  currentPhase: number;
  completedPhases: number[];
  startTime: string;
  onBack: () => void;
}

export const StatusScreen: React.FC<StatusScreenProps> = ({
  currentPhase,
  completedPhases,
  startTime,
  onBack
}) => {
  const start = new Date(startTime);
  const elapsed = Math.floor((Date.now() - start.getTime()) / 1000 / 60);
  const hours = Math.floor(elapsed / 60);
  const elapsedLabel = hours > 0 ? `${hours}h ${elapsed % 60}min` : `${elapsed}min`;

  const totalPhases = workshopConfig.phases.length;
  const donePhases = completedPhases.length;
  const progressBar = '█'.repeat(donePhases) + '░'.repeat(Math.max(0, totalPhases - donePhases));

  // Handle keyboard input
  useInput((input, key) => {
    if (key.return || key.escape || input.toLowerCase() === 'q') {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        📊 Workshop Status
      </Text>

      <Box marginY={1} flexDirection="column">
        <Text>
          Gestartet: <Text color="green">{start.toLocaleString('de-DE')}</Text>
        </Text>
        <Text>
          Verstrichene Zeit: <Text color="cyan">{elapsedLabel}</Text>
        </Text>
        <Text>
          Fortschritt: <Text color="green">{progressBar}</Text> <Text color="white" bold>{donePhases}</Text><Text dimColor>/{totalPhases} Phasen</Text>
        </Text>
      </Box>

      <Text bold color="yellow">
        Phasen:
      </Text>

      <Box flexDirection="column" marginY={1}>
        {workshopConfig.phases.map(phase => {
          const isDone = completedPhases.includes(phase.id);
          const isCurrent = currentPhase === phase.id;
          const status = isDone ? '✅' : isCurrent ? '🔄' : '⏸️ ';

          return (
            <Text key={phase.id} color={isCurrent ? 'cyan' : isDone ? undefined : 'gray'} bold={isCurrent} dimColor={!isDone && !isCurrent}>
              {status} Phase {phase.id}: {phase.name}{isCurrent ? '  ← du bist hier' : ''}
            </Text>
          );
        })}
      </Box>

      <Text dimColor>
        [Enter/q] Zurück
      </Text>
    </Box>
  );
};
