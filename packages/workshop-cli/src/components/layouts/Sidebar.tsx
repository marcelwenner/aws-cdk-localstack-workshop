import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { PhaseProgressList, ProgressBar } from '../display/PhaseProgressList.js';
import { CompactPhaseTimer } from '../display/PhaseTimeDisplay.js';
import type { PhaseTime } from '../../core/state/workshop-state.js';

export interface SidebarProps {
  currentPhase: number;
  completedPhases: number[];
  startTime?: string;
  phaseTimes?: Record<number, PhaseTime>;
  /** Progress within current phase (0-100) */
  currentPhaseProgress?: number;
  watcherState?: {
    watching: boolean;
    lastChange?: string;
    changeCount: number;
    active?: boolean;
  };
}

/**
 * Format elapsed time since start (supports hours)
 */
function formatElapsed(startTime: string): string {
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  return `${minutes}m`;
}

/**
 * Format phase time (supports hours)
 */
function formatPhaseTime(phaseTimes: Record<number, PhaseTime>, currentPhase: number): string {
  const phaseTime = phaseTimes[currentPhase];
  if (!phaseTime?.startedAt) return '0m';

  const start = new Date(phaseTime.startedAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);

  // Minute granularity: a seconds display changes the frame every second,
  // which forces a full repaint of the whole layout (Ink rewrites the
  // frame on any output change)
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  return `${minutes}m`;
}

/**
 * Left sidebar component with clean UI
 */
export const Sidebar: React.FC<SidebarProps> = ({
  currentPhase,
  completedPhases,
  startTime,
  phaseTimes,
  currentPhaseProgress = 0,
  watcherState,
}) => {
  const [elapsed, setElapsed] = useState('0m');
  const [phaseElapsed, setPhaseElapsed] = useState('0m');

  // Update elapsed time every second (for seconds display)
  useEffect(() => {
    if (!startTime) return;

    const update = () => {
      setElapsed(formatElapsed(startTime));
      if (phaseTimes && currentPhase > 0) {
        setPhaseElapsed(formatPhaseTime(phaseTimes, currentPhase));
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime, phaseTimes, currentPhase]);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} height="100%">
      {/* Phase List */}
      <PhaseProgressList
        currentPhase={currentPhase}
        completedPhases={completedPhases}
        currentPhaseProgress={currentPhaseProgress}
      />

      {/* Divider */}
      <Box marginTop={1}>
        <Text color="gray">{'─'.repeat(22)}</Text>
      </Box>

      {/* Time Section */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="yellow">Zeit</Text>
        <Box marginTop={1} flexDirection="column">
          <Box justifyContent="space-between">
            <Text dimColor>Session</Text>
            <Text color="white">{elapsed}</Text>
          </Box>

          {phaseTimes && currentPhase > 0 && (
            <Box justifyContent="space-between">
              <Text dimColor>Phase {currentPhase}</Text>
              <Text color="cyan">{phaseElapsed}</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Deploy Status - nur einfache Watching Anzeige, Details sind in DeploymentPipeline */}
      {watcherState?.active && (
        <Box flexDirection="column" marginTop={1}>
          <Box marginBottom={1}>
            <Text color="gray">{'─'.repeat(22)}</Text>
          </Box>

          <Box>
            <Text color={watcherState.watching ? 'green' : 'gray'}>
              {watcherState.watching ? '👁 ' : '○ '}
            </Text>
            <Text color={watcherState.watching ? 'green' : 'gray'}>
              {watcherState.watching ? 'Watching' : 'Paused'}
            </Text>
          </Box>

          {watcherState.changeCount > 0 && (
            <Box>
              <Text dimColor>
                {watcherState.changeCount} Deploy{watcherState.changeCount !== 1 ? 's' : ''}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Spacer - push rest to bottom */}
      <Box flexGrow={1} />

      {/* Divider before progress */}
      <Box marginBottom={1}>
        <Text color="gray">{'─'.repeat(22)}</Text>
      </Box>

      {/* Progress Bar at bottom */}
      <ProgressBar
        completedPhases={completedPhases}
        currentPhaseProgress={currentPhaseProgress}
      />

      {/* Hotkey hint */}
      <Box marginTop={1}>
        <Text dimColor>[?] Hilfe</Text>
      </Box>
    </Box>
  );
};
