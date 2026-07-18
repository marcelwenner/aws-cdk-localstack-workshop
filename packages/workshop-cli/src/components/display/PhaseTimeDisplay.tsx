import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { PhaseTime } from '../../core/state/workshop-state.js';

export interface PhaseTimeDisplayProps {
  /** Current active phase */
  currentPhase: number;
  /** All phase times from state */
  phaseTimes: Record<number, PhaseTime>;
  /** Compact mode (single line) */
  compact?: boolean;
  /** Show history of previous phases */
  showHistory?: boolean;
}

/**
 * Format seconds into human-readable time (e.g., "5m 32s")
 */
function formatTime(seconds: number | undefined | null): string {
  if (seconds == null || seconds === 0) return '--';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Calculate elapsed seconds from a start timestamp
 */
function getElapsedSeconds(startedAt: string): number {
  const started = new Date(startedAt);
  return Math.floor((Date.now() - started.getTime()) / 1000);
}

/**
 * Phase time display component.
 * Shows live timer for current phase and history of completed phases.
 */
export const PhaseTimeDisplay: React.FC<PhaseTimeDisplayProps> = ({
  currentPhase,
  phaseTimes,
  compact = false,
  showHistory = true,
}) => {
  const [elapsed, setElapsed] = useState(0);
  const currentPhaseTime = phaseTimes[currentPhase];

  // Live timer update every second
  useEffect(() => {
    if (!currentPhaseTime?.startedAt || currentPhaseTime.completedAt) {
      return;
    }

    // Initial calculation
    setElapsed(getElapsedSeconds(currentPhaseTime.startedAt));

    const interval = setInterval(() => {
      setElapsed(getElapsedSeconds(currentPhaseTime.startedAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [currentPhaseTime?.startedAt, currentPhaseTime?.completedAt]);

  // Compact mode: single line showing current phase time
  if (compact) {
    const timeStr = currentPhaseTime?.completedAt
      ? formatTime(currentPhaseTime.duration)
      : formatTime(elapsed);

    return (
      <Box>
        <Text dimColor>Phase {currentPhase}: </Text>
        <Text color="cyan">{timeStr}</Text>
      </Box>
    );
  }

  // Get completed phases for history
  const completedPhases = Object.entries(phaseTimes)
    .filter(([phase, time]) => parseInt(phase) < currentPhase && time.completedAt)
    .sort(([a], [b]) => parseInt(a) - parseInt(b));

  // Calculate total time across all phases
  const totalSeconds = completedPhases.reduce((sum, [, time]) => sum + (time.duration || 0), 0) + elapsed;

  return (
    <Box flexDirection="column">
      {/* Current phase timer */}
      <Box>
        <Text color="cyan" bold>⏱ </Text>
        <Text bold>Phase {currentPhase}: </Text>
        <Text color="cyan" bold>{formatTime(elapsed)}</Text>
      </Box>

      {/* Phase history */}
      {showHistory && completedPhases.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>📊 Deine Zeiten:</Text>
          {completedPhases.map(([phase, time]) => (
            <Box key={phase} paddingLeft={2}>
              <Text dimColor>
                Phase {phase}: {formatTime(time.duration)}
              </Text>
            </Box>
          ))}
          {completedPhases.length > 0 && (
            <Box paddingLeft={2} marginTop={1}>
              <Text dimColor>────────────</Text>
            </Box>
          )}
          <Box paddingLeft={2}>
            <Text dimColor>Gesamt: {formatTime(totalSeconds)}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};

/**
 * Format time with leading zeros for sexy display
 */
function formatTimeSexy(seconds: number): { minutes: string; secs: string } {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return {
    minutes: m.toString().padStart(2, '0'),
    secs: s.toString().padStart(2, '0'),
  };
}

/**
 * Compact timer for sidebar
 * Only renders when a timer is actually running for the current phase
 */
export const CompactPhaseTimer: React.FC<{
  currentPhase: number;
  phaseTimes: Record<number, PhaseTime>;
}> = ({ currentPhase, phaseTimes }) => {
  const [elapsed, setElapsed] = useState(0);
  const currentPhaseTime = phaseTimes[currentPhase];

  useEffect(() => {
    if (!currentPhaseTime?.startedAt || currentPhaseTime.completedAt) {
      return;
    }

    setElapsed(getElapsedSeconds(currentPhaseTime.startedAt));

    const interval = setInterval(() => {
      setElapsed(getElapsedSeconds(currentPhaseTime.startedAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [currentPhaseTime?.startedAt, currentPhaseTime?.completedAt]);

  // Don't render if no timer exists for this phase
  if (!currentPhaseTime?.startedAt) {
    return null;
  }

  const displaySeconds = currentPhaseTime.completedAt
    ? (currentPhaseTime.duration || 0)
    : elapsed;

  const { minutes, secs } = formatTimeSexy(displaySeconds);

  return (
    <Box>
      <Text color="white" bold>{minutes}</Text>
      <Text color="gray">m </Text>
      <Text color="white" bold>{secs}</Text>
      <Text color="gray">s</Text>
    </Box>
  );
};

export default PhaseTimeDisplay;
