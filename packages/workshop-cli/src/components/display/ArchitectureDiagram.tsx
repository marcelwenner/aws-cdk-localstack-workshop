/**
 * ArchitectureDiagram - Live Architecture Visualization
 *
 * Shows the serverless architecture with live metrics:
 * [Trigger] -> [Starter] -> [Queue] -> [Worker] -> [DB]
 *                            |
 *                          [DLQ]
 *
 * Supports normal and compact mode for small terminals
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import type { ArchitectureMetrics, QueueStatus } from '../../hooks/useArchitectureMetrics.js';
import { getProgressBar, getInFlightBar, ARROW_FRAMES } from '../../lib/visuals.js';

export interface ArchitectureDiagramProps {
  phase: number;
  metrics: ArchitectureMetrics;
  compact?: boolean;
  lastAction?: string;
}

/**
 * Get color based on queue status
 */
function getStatusColor(status: QueueStatus): string {
  switch (status) {
    case 'online': return 'green';
    case 'offline': return 'gray';
    case 'error': return 'red';
    case 'loading': return 'yellow';
    default: return 'white';
  }
}

/**
 * Get color for queue depth (green -> yellow -> red)
 */
function getDepthColor(depth: number): string {
  if (depth === 0) return 'green';
  if (depth < 10) return 'cyan';
  if (depth < 50) return 'yellow';
  return 'red';
}

/**
 * Smooth progress bar for queue depth with inFlight indicator.
 * Uses █▓░ characters for high-resolution visualization.
 */
interface SmoothQueueBarProps {
  depth: number;
  inFlight?: number;
  maxDepth?: number;
  compact?: boolean;
}

function SmoothQueueBar({ depth, inFlight = 0, maxDepth = 100, compact = false }: SmoothQueueBarProps) {
  const width = compact ? 8 : 20;
  const color = getDepthColor(depth);

  // Use inFlight bar if we have in-flight messages
  if (inFlight > 0) {
    const bar = getInFlightBar(depth, inFlight, maxDepth, width);
    return (
      <Text>
        <Text color={color}>{bar.replace(/▓/g, '')}</Text>
        <Text color="cyan">{bar.includes('▓') ? '▓'.repeat(bar.split('▓').length - 1) : ''}</Text>
        <Text dimColor>{bar.replace(/[█▓]/g, '')}</Text>
      </Text>
    );
  }

  // Simple progress bar
  const bar = getProgressBar(depth, maxDepth, width);
  return (
    <Text>
      <Text color={color}>{bar.replace(/░/g, '')}</Text>
      <Text dimColor>{bar.replace(/█/g, '')}</Text>
    </Text>
  );
}

/**
 * Service box component
 */
interface ServiceBoxProps {
  icon: string;
  label: string;
  status?: QueueStatus;
  active?: boolean;
  value?: number | string;
  color?: string;
}

const ServiceBox: React.FC<ServiceBoxProps> = ({
  icon,
  label,
  status = 'online',
  active = false,
  value,
  color,
}) => {
  const boxColor = color || (status === 'offline' ? 'gray' : active ? 'green' : 'white');
  const isOffline = status === 'offline';

  return (
    <Box flexDirection="column" alignItems="center">
      <Text color={boxColor}>[ {icon} ]</Text>
      <Text color={isOffline ? 'gray' : 'white'} dimColor={isOffline}>
        {label}
        {value !== undefined && <Text color={getDepthColor(typeof value === 'number' ? value : 0)}> {value}</Text>}
      </Text>
      {isOffline && <Text color="yellow"></Text>}
    </Box>
  );
};

/**
 * Animated arrow between services with cycling frames.
 * Blinks when inFlight > 0 to show active processing!
 */
const Arrow: React.FC<{
  active?: boolean;
  animated?: boolean;
  frameIndex?: number;
  inFlight?: number;
}> = ({
  active,
  animated,
  frameIndex = 0,
  inFlight = 0,
}) => {
  // Blink effect when messages are in-flight (being processed)
  const isProcessing = inFlight > 0;
  const blinkOn = isProcessing && frameIndex % 4 < 2; // Slower blink for visibility

  // Color logic: processing = blinking green/cyan, active = cyan, inactive = gray
  let color = active ? 'cyan' : 'gray';
  if (isProcessing) {
    color = blinkOn ? 'green' : 'cyan';
  }

  const arrow = (animated && active) || isProcessing
    ? ARROW_FRAMES[frameIndex % ARROW_FRAMES.length]
    : '──▶';

  return <Text color={color} bold={isProcessing}> {arrow} </Text>;
};

/**
 * DLQ indicator with blinking alarm when messages present.
 */
const DlqIndicator: React.FC<{ depth: number; blink?: boolean }> = ({ depth, blink = false }) => {
  const hasMessages = depth > 0;
  const showRed = hasMessages && (!blink || blink);

  return (
    <Box flexDirection="column" alignItems="center">
      <Text dimColor>│</Text>
      <Text dimColor>▼</Text>
      <Text
        color={hasMessages ? 'white' : 'gray'}
        backgroundColor={showRed && hasMessages ? 'red' : undefined}
        bold={hasMessages}
      >
        [ 💀 ]
      </Text>
      <Text
        color={hasMessages ? 'red' : 'gray'}
        bold={hasMessages}
      >
        DLQ {depth}
      </Text>
    </Box>
  );
};

/**
 * Compact single-line view for small terminals with smooth progress bar.
 */
const CompactView: React.FC<ArchitectureDiagramProps> = ({ metrics, lastAction }) => {
  const { queue, workerActive, connectionStatus } = metrics;
  const isOffline = connectionStatus === 'disconnected';

  // DLQ blink state for compact view
  const [dlqBlink, setDlqBlink] = useState(false);

  useEffect(() => {
    if (queue.dlqDepth > 0) {
      const interval = setInterval(() => {
        setDlqBlink(b => !b);
      }, 500);
      return () => clearInterval(interval);
    } else {
      setDlqBlink(false);
    }
  }, [queue.dlqDepth]);

  if (isOffline) {
    return (
      <Box>
        <Text dimColor>── </Text>
        <Text color="yellow"> LocalStack offline</Text>
        <Text dimColor> ──</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>── </Text>
        <Text color="cyan">[MS]</Text>
        <Text color={workerActive ? 'green' : 'gray'}>›</Text>
        <Text>[</Text>
        <SmoothQueueBar depth={queue.depth} inFlight={queue.inFlight} compact />
        <Text color={getDepthColor(queue.depth)}>{queue.depth}</Text>
        <Text>]</Text>
        <Text color={workerActive ? 'green' : 'gray'}>›</Text>
        <Text color={workerActive ? 'green' : 'white'}>[{workerActive ? '⚙️' : '💤'}]</Text>
        <Text dimColor>›</Text>
        <Text color="cyan">[🛢️]</Text>
        {queue.dlqDepth > 0 && (
          <Text
            color="white"
            backgroundColor={dlqBlink ? 'red' : undefined}
            bold
          >
             DLQ:💀{queue.dlqDepth}
          </Text>
        )}
        <Text dimColor> ──</Text>
      </Box>
      {lastAction && (
        <Text color="cyan" dimColor>→ {lastAction}</Text>
      )}
    </Box>
  );
};

/**
 * Full architecture diagram with animations.
 */
const FullView: React.FC<ArchitectureDiagramProps> = ({ phase, metrics, lastAction }) => {
  const { queue, workerActive, connectionStatus } = metrics;
  const isOffline = connectionStatus === 'disconnected';

  // Animation state for arrows and DLQ blink
  const [frameIndex, setFrameIndex] = useState(0);
  const [dlqBlink, setDlqBlink] = useState(false);

  // Dynamic animation speed based on queue load
  const animationSpeed = useMemo(() => {
    if (queue.inFlight > 10) return 50;   // Sehr schnell bei hoher Last
    if (queue.inFlight > 5) return 100;   // Schnell
    if (queue.inFlight > 0) return 200;   // Mittel
    return 500; // Idle - langsam
  }, [queue.inFlight]);

  // Arrow animation with dynamic speed
  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex(i => (i + 1) % ARROW_FRAMES.length);
    }, animationSpeed);
    return () => clearInterval(interval);
  }, [animationSpeed]);

  // DLQ blink animation (500ms cycle when DLQ has messages)
  useEffect(() => {
    if (queue.dlqDepth > 0) {
      const interval = setInterval(() => {
        setDlqBlink(b => !b);
      }, 500);
      return () => clearInterval(interval);
    } else {
      setDlqBlink(false);
    }
  }, [queue.dlqDepth]);

  // Phase 2: Simple GetTableList -> DB
  if (phase === 2) {
    return (
      <Box flexDirection="column" alignItems="center" paddingY={1}>
        <Box alignItems="center">
          <ServiceBox icon="📋" label="GetTableList" status={isOffline ? 'offline' : 'online'} />
          <Arrow active={!isOffline} />
          <ServiceBox icon="🛢️" label="DB" status={isOffline ? 'offline' : 'online'} />
        </Box>
        {lastAction && (
          <Box marginTop={1}>
            <Text color="cyan">→ {lastAction}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // Phase 3+: Full architecture with Queue
  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      {/* Main flow */}
      <Box alignItems="center">
        <ServiceBox
          icon="👆"
          label="Trigger"
          status={isOffline ? 'offline' : 'online'}
        />
        <Arrow active={!isOffline} frameIndex={frameIndex} />
        <ServiceBox
          icon="⚡"
          label="Starter"
          status={isOffline ? 'offline' : 'online'}
        />
        <Arrow active={!isOffline} animated frameIndex={frameIndex} />
        <Box flexDirection="column" alignItems="center">
          <Text color={isOffline ? 'gray' : getDepthColor(queue.depth)}>[ 📥 ]</Text>
          <Box>
            <Text color={isOffline ? 'gray' : 'white'}>Q </Text>
            <SmoothQueueBar depth={queue.depth} inFlight={queue.inFlight} />
            <Text color={getDepthColor(queue.depth)}> {queue.depth}</Text>
            {queue.inFlight > 0 && <Text color="cyan">/{queue.inFlight}</Text>}
          </Box>
          {queue.status === 'offline' && <Text color="yellow"></Text>}
        </Box>
        <Arrow
          active={workerActive}
          animated
          frameIndex={frameIndex}
          inFlight={queue.inFlight}
        />
        <ServiceBox
          icon={workerActive ? '⚙️' : '💤'}
          label="Worker"
          status={isOffline ? 'offline' : queue.status}
          active={workerActive}
          color={workerActive ? 'green' : undefined}
        />
        <Arrow active={workerActive} inFlight={queue.inFlight} />
        <ServiceBox
          icon="🛢️"
          label="DB"
          status={isOffline ? 'offline' : 'online'}
        />
      </Box>

      {/* DLQ branch with blinking alarm */}
      <Box marginTop={1} alignItems="center">
        <Text>                              </Text>
        <DlqIndicator depth={queue.dlqDepth} blink={dlqBlink} />
      </Box>

      {/* Status message */}
      {lastAction && (
        <Box marginTop={1}>
          <Text color="cyan">→ {lastAction}</Text>
        </Box>
      )}

      {/* Connection warning */}
      {isOffline && (
        <Box marginTop={1}>
          <Text color="yellow"> LocalStack nicht erreichbar</Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Main ArchitectureDiagram component
 */
export const ArchitectureDiagram: React.FC<ArchitectureDiagramProps> = (props) => {
  if (props.compact) {
    return <CompactView {...props} />;
  }
  return <FullView {...props} />;
};
