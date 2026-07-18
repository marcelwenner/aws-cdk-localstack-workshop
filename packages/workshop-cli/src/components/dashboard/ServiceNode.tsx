import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

export type ServiceStatus = 'idle' | 'active' | 'running' | 'error';

export interface ServiceNodeProps {
  /** Service name displayed at top */
  name: string;
  /** Icon/emoji for the service */
  icon: string;
  /** Current status */
  status: ServiceStatus;
  /** Optional subtitle (e.g., "[ZZZ]" for active worker) */
  subtitle?: string;
  /** Width of the box */
  width?: number;
  /** Animation speed in ms (lower = faster) */
  animationSpeed?: number;
}

// Animation frames for the activity indicator (spinning/working effect)
const ACTIVITY_FRAMES = ['[●  ]', '[ ● ]', '[  ●]', '[ ● ]'];

// Border characters for pulse effect
const BORDER_STYLES: Record<ServiceStatus, 'single' | 'double' | 'round'> = {
  idle: 'single',
  active: 'double',
  running: 'double',  // Same as active but different color
  error: 'single',
};

/**
 * ServiceNode - A service box with animated effects
 *
 * Features:
 * - Pulses when active (border animation)
 * - Activity indicator animation [.] -> [z] -> [Z] -> [zZz]
 * - Red border when error
 * - Configurable animation speed for demo mode
 */
export const ServiceNode: React.FC<ServiceNodeProps> = ({
  name,
  icon,
  status,
  subtitle,
  width = 11,
  animationSpeed = 150,
}) => {
  const [frame, setFrame] = useState(0);
  const [borderPulse, setBorderPulse] = useState(false);

  // Activity animation when active or running
  useEffect(() => {
    if (status !== 'active' && status !== 'running') {
      setFrame(0);
      return;
    }

    const interval = setInterval(() => {
      setFrame(f => (f + 1) % ACTIVITY_FRAMES.length);
    }, animationSpeed);

    return () => clearInterval(interval);
  }, [status, animationSpeed]);

  // Border pulse animation when active or running
  useEffect(() => {
    if (status !== 'active' && status !== 'running') {
      setBorderPulse(false);
      return;
    }

    const interval = setInterval(() => {
      setBorderPulse(p => !p);
    }, animationSpeed * 2);

    return () => clearInterval(interval);
  }, [status, animationSpeed]);

  // Determine colors based on status
  const getBorderColor = (): string => {
    switch (status) {
      case 'active':
        return borderPulse ? 'green' : 'cyan';
      case 'running':
        return borderPulse ? 'yellow' : 'cyan';  // Yellow pulse = running
      case 'error':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getTextColor = (): string => {
    switch (status) {
      case 'active':
        return 'white';
      case 'running':
        return 'yellow';  // Yellow = running
      case 'error':
        return 'red';
      default:
        return 'gray';
    }
  };

  // Get display subtitle (animated or static)
  const displaySubtitle = (status === 'active' || status === 'running')
    ? ACTIVITY_FRAMES[frame]
    : subtitle || '';

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      width={width}
      borderStyle={BORDER_STYLES[status]}
      borderColor={getBorderColor()}
      paddingX={1}
    >
      <Text color={getTextColor()} bold={status === 'active' || status === 'running'}>
        {name}
      </Text>
      <Text>{icon}</Text>
      {displaySubtitle && (
        <Text color={status === 'running' ? 'yellow' : status === 'active' ? 'cyan' : 'gray'} dimColor={status === 'idle'}>
          {displaySubtitle}
        </Text>
      )}
    </Box>
  );
};

export default ServiceNode;
