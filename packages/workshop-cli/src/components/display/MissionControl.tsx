/**
 * MissionControl - Control Panel for Dashboard
 *
 * Provides action buttons to trigger test scenarios:
 * [1] Standard Run - 10 tables
 * [2] Stress Test - 100 tables
 * [3] Chaos - Error injection for DLQ demo
 *
 * Features:
 * - Button status animation (🚀 → ⏳ → ✅)
 * - ASCII spinner during execution
 * - Double border for control panel look
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { SPINNER_FRAMES } from '../../lib/visuals.js';

export type MissionAction = 'run' | 'stress' | 'chaos';

/**
 * Action execution status for button state.
 */
export type ActionStatus = 'idle' | 'starting' | 'running' | 'sent' | 'error';

export interface MissionControlProps {
  /** Available actions for this phase */
  actions?: MissionAction[];
  /** Currently running action */
  runningAction?: MissionAction | null;
  /** Status of the running action */
  actionStatus?: ActionStatus;
  /** Last action result message */
  statusMessage?: string;
  /** Compact mode for small terminals */
  compact?: boolean;
  /** Disabled state (e.g., during action) */
  disabled?: boolean;
}

interface ActionConfig {
  key: string;
  label: string;
  description: string;
  icon: string;
}

const actionConfigs: Record<MissionAction, ActionConfig> = {
  run: {
    key: '1',
    label: 'Standard Run',
    description: '10 Tabellen',
    icon: '🚀',
  },
  stress: {
    key: '2',
    label: 'Stress Test',
    description: '100 Tabellen',
    icon: '🔥',
  },
  chaos: {
    key: '3',
    label: 'Chaos',
    description: 'Error → DLQ',
    icon: '💀',
  },
};

/**
 * Get icon based on action status.
 */
function getStatusIcon(status: ActionStatus, defaultIcon: string, spinnerFrame: number): string {
  switch (status) {
    case 'starting':
      return SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];
    case 'running':
      return SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];
    case 'sent':
      return '✅';
    case 'error':
      return '❌';
    default:
      return defaultIcon;
  }
}

/**
 * Get status label for button.
 */
function getStatusLabel(status: ActionStatus, defaultLabel: string): string {
  switch (status) {
    case 'starting':
      return 'Starting...';
    case 'running':
      return 'Running...';
    case 'sent':
      return 'Sent!';
    case 'error':
      return 'Error';
    default:
      return defaultLabel;
  }
}

/**
 * Compact single-line control panel with animated spinner.
 */
const CompactControl: React.FC<MissionControlProps> = ({
  actions = ['run', 'stress', 'chaos'],
  runningAction,
  actionStatus = 'idle',
  disabled,
}) => {
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  // Spinner animation
  useEffect(() => {
    if (actionStatus === 'starting' || actionStatus === 'running') {
      const interval = setInterval(() => {
        setSpinnerFrame(f => (f + 1) % SPINNER_FRAMES.length);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [actionStatus]);

  return (
    <Box gap={2}>
      {actions.map(action => {
        const config = actionConfigs[action];
        const isRunning = runningAction === action;
        const isDisabled = disabled || (runningAction !== null && !isRunning);
        const currentStatus = isRunning ? actionStatus : 'idle';

        return (
          <Text key={action} color={isDisabled ? 'gray' : 'white'}>
            <Text color={isRunning ? 'cyan' : isDisabled ? 'gray' : 'yellow'} bold={!isDisabled}>
              [{config.key}]
            </Text>
            <Text dimColor={isDisabled}>
               {getStatusIcon(currentStatus, config.icon, spinnerFrame)} 
              {isRunning ? getStatusLabel(currentStatus, config.label) : config.label}
            </Text>
          </Text>
        );
      })}
      <Text>
        <Text color="gray" bold>[ESC]</Text>
        <Text dimColor>{` Back`}</Text>
      </Text>
    </Box>
  );
};

/**
 * Full control panel with descriptions and double border.
 */
const FullControl: React.FC<MissionControlProps> = ({
  actions = ['run', 'stress', 'chaos'],
  runningAction,
  actionStatus = 'idle',
  statusMessage,
  disabled,
}) => {
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  // Spinner animation
  useEffect(() => {
    if (actionStatus === 'starting' || actionStatus === 'running') {
      const interval = setInterval(() => {
        setSpinnerFrame(f => (f + 1) % SPINNER_FRAMES.length);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [actionStatus]);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      paddingX={1}
    >
      <Text bold color="cyan">🎮 Mission Control</Text>

      <Box marginTop={1} gap={3}>
        {actions.map(action => {
          const config = actionConfigs[action];
          const isRunning = runningAction === action;
          const isDisabled = disabled || (runningAction !== null && !isRunning);
          const currentStatus = isRunning ? actionStatus : 'idle';

          // Status-based colors
          const buttonColor = isRunning
            ? (actionStatus === 'sent' ? 'green' : actionStatus === 'error' ? 'red' : 'cyan')
            : (isDisabled ? 'gray' : 'yellow');

          return (
            <Box key={action} flexDirection="column">
              <Text color={isDisabled ? 'gray' : 'white'}>
                <Text color={buttonColor} bold={!isDisabled}>
                  [{config.key}]
                </Text>
                <Text dimColor={isDisabled}>
                   {getStatusIcon(currentStatus, config.icon, spinnerFrame)} 
                  {isRunning ? getStatusLabel(currentStatus, config.label) : config.label}
                </Text>
              </Text>
              <Text dimColor color={isDisabled ? 'gray' : undefined}>
                    {config.description}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Status message */}
      {statusMessage && (
        <Box marginTop={1}>
          <Text color={actionStatus === 'error' ? 'red' : 'cyan'}>→ {statusMessage}</Text>
        </Box>
      )}

      {/* Back hint */}
      <Box marginTop={1}>
        <Text dimColor>
          <Text color="gray" bold>[ESC]</Text>{` Zurück zum Workshop`}
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Main MissionControl component
 */
export const MissionControl: React.FC<MissionControlProps> = (props) => {
  if (props.compact) {
    return <CompactControl {...props} />;
  }
  return <FullControl {...props} />;
};
