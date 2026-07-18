import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { workshopConfig } from '../../core/config/workshop.config.js';

export interface PhaseProgressListProps {
  currentPhase: number;
  completedPhases: number[];
  compact?: boolean;
  /** Progress within current phase (0-100) for finer granularity */
  currentPhaseProgress?: number;
  /** Show progress bar (default: false, moved to bottom of sidebar) */
  showProgressBar?: boolean;
}

// Phase short names for sidebar (must match workshop.config.ts phases!)
const PHASE_NAMES: Record<number, string> = {
  0: 'Intro',
  1: 'Lambda',      // GetTableListLambda verstehen
  2: 'Starter',     // MarkingStarterLambda
  3: 'Worker',      // LtsExecutorLambda & Worker Pattern
  4: 'Poller',      // StatusPollerLambda
  5: 'E2E',         // End-to-End Test
  6: 'Deletion',    // DeletionStarterLambda (Stretch)
};

/**
 * Enhanced phase progress list with sexy UI
 * Shows workshop phases with visual progress bar and animations
 */
export const PhaseProgressList: React.FC<PhaseProgressListProps> = ({
  currentPhase,
  completedPhases,
  compact = false,
  currentPhaseProgress = 0,
  showProgressBar = false,
}) => {
  const [pulse, setPulse] = useState(true);

  // Pulse animation for current phase
  useEffect(() => {
    const interval = setInterval(() => {
      setPulse(p => !p);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const phases = workshopConfig.phases.filter(p => p.id > 0); // Skip intro
  const totalPhases = phases.length;
  const completedCount = completedPhases.filter(p => p > 0).length;

  // Fine-grained progress
  const baseProgress = (completedCount / totalPhases) * 100;
  const currentPhaseContribution = (currentPhaseProgress / 100) * (100 / totalPhases);
  const progressPercent = Math.round(baseProgress + currentPhaseContribution);

  const getIcon = (phaseId: number) => {
    if (completedPhases.includes(phaseId)) return '✓';
    if (phaseId === currentPhase) return pulse ? '▶' : '›';
    return '○';
  };

  const getColor = (phaseId: number): string => {
    if (completedPhases.includes(phaseId)) return 'green';
    if (phaseId === currentPhase) return 'cyan';
    return 'gray';
  };

  return (
    <Box flexDirection="column">
      {/* Section Header */}
      <Box marginBottom={1}>
        <Text bold color="yellow">Phasen</Text>
      </Box>

      {/* Phase list with better spacing */}
      {phases.map((phase, index) => {
        const isCurrent = phase.id === currentPhase;
        const isCompleted = completedPhases.includes(phase.id);
        const phaseName = PHASE_NAMES[phase.id] || `P${phase.id}`;

        return (
          <Box key={`phase-${phase.id}`} marginBottom={index < phases.length - 1 ? 0 : 0}>
            <Box width={3}>
              <Text color={getColor(phase.id)} bold={isCurrent}>
                {getIcon(phase.id)}
              </Text>
            </Box>
            <Box width={2}>
              <Text color={isCurrent ? 'white' : isCompleted ? 'green' : 'gray'} bold={isCurrent}>
                {phase.id}
              </Text>
            </Box>
            <Box>
              <Text
                color={isCurrent ? 'cyan' : isCompleted ? 'green' : 'gray'}
                bold={isCurrent}
                dimColor={!isCurrent && !isCompleted}
              >
                {phaseName}
              </Text>
            </Box>
          </Box>
        );
      })}

      {/* Progress bar (optional, usually at bottom of sidebar) */}
      {showProgressBar && !compact && (
        <Box flexDirection="column" marginTop={1}>
          <Box justifyContent="space-between">
            <Text dimColor>Progress</Text>
            <Text color="cyan" bold>{progressPercent}%</Text>
          </Box>
          <Box>
            <Text color="green">{'█'.repeat(Math.floor(progressPercent / 5))}</Text>
            <Text color="gray">{'░'.repeat(20 - Math.floor(progressPercent / 5))}</Text>
          </Box>
        </Box>
      )}

      {/* Completion badge */}
      {completedCount === totalPhases && (
        <Box marginTop={1}>
          <Text color="green" bold>★ Komplett!</Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Standalone progress bar component for sidebar bottom
 */
export const ProgressBar: React.FC<{
  completedPhases: number[];
  currentPhaseProgress?: number;
}> = ({ completedPhases, currentPhaseProgress = 0 }) => {
  const phases = workshopConfig.phases.filter(p => p.id > 0);
  const totalPhases = phases.length;
  const completedCount = completedPhases.filter(p => p > 0).length;

  const baseProgress = (completedCount / totalPhases) * 100;
  const currentPhaseContribution = (currentPhaseProgress / 100) * (100 / totalPhases);
  const progressPercent = Math.round(baseProgress + currentPhaseContribution);

  const barWidth = 20;
  const filledWidth = Math.floor((progressPercent / 100) * barWidth);

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" marginBottom={0}>
        <Text color="yellow" bold>Progress</Text>
        <Text color="cyan" bold>{progressPercent}%</Text>
      </Box>
      <Box>
        <Text color="green">{'█'.repeat(filledWidth)}</Text>
        <Text color="gray">{'░'.repeat(barWidth - filledWidth)}</Text>
      </Box>
    </Box>
  );
};
