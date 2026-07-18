import React from 'react';
import { Box, Text } from 'ink';
import { useTerminalDimensions } from '../../hooks/useTerminalDimensions.js';
import { DashboardHeader } from './DashboardHeader.js';
import { Sidebar } from './Sidebar.js';
import { DashboardFooter } from './DashboardFooter.js';
import type { PhaseTime } from '../../core/state/workshop-state.js';

export interface DashboardLayoutProps {
  children: React.ReactNode;
  currentPhase: number;
  phaseTitle?: string;
  completedPhases: number[];
  startTime?: string;
  phaseTimes?: Record<number, PhaseTime>;
  currentPhaseProgress?: number;
  dockerRunning?: boolean;
  localstackRunning?: boolean;
  postgresRunning?: boolean;
  watcherState?: {
    watching: boolean;
    lastChange?: string;
    changeCount: number;
  };
}

/**
 * Main fullscreen dashboard layout
 * Uses altScreen mode for true fullscreen experience
 *
 * Structure:
 * - Header (3 rows, fixed)
 * - Body (flexible height)
 *   - Sidebar (32 chars fixed width)
 *   - Main Content (flexGrow: 1)
 * - Footer (3 rows, fixed)
 */
export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  currentPhase,
  phaseTitle,
  completedPhases,
  startTime,
  phaseTimes,
  currentPhaseProgress,
  dockerRunning,
  localstackRunning,
  postgresRunning,
  watcherState,
}) => {
  const { width, height } = useTerminalDimensions();

  // 1. Safety Check: Wenn das Terminal zu klein ist, zeige Warnung statt kaputtes Layout
  if (width < 70 || height < 20) {
    return (
      <Box height={height} width={width} flexDirection="column" justifyContent="center" alignItems="center" borderStyle="double" borderColor="red">
        <Text color="yellow" bold>⚠️  Terminal zu klein</Text>
        <Text>Bitte vergrößern: {width}x{height} (Min: 70x20)</Text>
      </Box>
    );
  }

  return (
    // overflow=hidden: Inhalt darf NIE höher malen als die Box - sonst
    // erreicht Inks Output die Terminalhöhe und Ink fällt in den
    // Vollbild-Clear-Modus zurück (= Flackern bei jedem Tick)
    <Box flexDirection="column" width={width} height={height} overflow="hidden">
      {/* HEADER: Fixe Höhe, schrumpft nicht */}
      <Box height={3} flexShrink={0}>
        <DashboardHeader currentPhase={currentPhase} phaseTitle={phaseTitle} />
      </Box>

      {/* BODY: Füllt den Rest, minHeight=0 verhindert Overflow-Explosion */}
      <Box flexGrow={1} minHeight={0} flexDirection="row">

        {/* SIDEBAR: Fixe Breite */}
        <Box
          width={32}
          flexShrink={0}
          borderStyle="single"
          borderColor="gray"
          borderTop={false}
          borderBottom={false}
          borderLeft={false}
          borderRight={true}
        >
          <Sidebar
            currentPhase={currentPhase}
            completedPhases={completedPhases}
            startTime={startTime}
            phaseTimes={phaseTimes}
            currentPhaseProgress={currentPhaseProgress}
            watcherState={watcherState}
          />
        </Box>

        {/* MAIN CONTENT: Flexibel, Padding */}
        <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
          {children}
        </Box>
      </Box>

      {/* FOOTER: Fixe Höhe */}
      <Box height={3} flexShrink={0}>
        <DashboardFooter
          dockerRunning={dockerRunning}
          localstackRunning={localstackRunning}
          postgresRunning={postgresRunning}
        />
      </Box>
    </Box>
  );
};
