import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';

export interface QueueVisualizationProps {
  /** Current queue depth */
  depth: number;
  /** Messages currently being processed */
  inFlight: number;
  /** Maximum queue capacity for percentage calculation */
  maxCapacity?: number;
  /** Width of the sparkline */
  barWidth?: number;
  /** Animation speed in ms */
  animationSpeed?: number;
  /** Compact mode */
  compact?: boolean;
}

// Sparkline characters from empty to full
const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Build a sparkline string from a history of values.
 * Scales to the max value seen in the window (min 1 to avoid div by zero).
 */
function buildSparkline(history: number[], width: number): string {
  const window = history.slice(-width);
  // Left-pad with zeros so the line always fills the full width
  const padded = Array(Math.max(0, width - window.length)).fill(0).concat(window);
  const max = Math.max(1, ...padded);
  return padded
    .map(v => {
      if (v <= 0) return SPARK_CHARS[0];
      const idx = Math.min(
        SPARK_CHARS.length - 1,
        Math.max(1, Math.round((v / max) * (SPARK_CHARS.length - 1)))
      );
      return SPARK_CHARS[idx];
    })
    .join('');
}

/**
 * QueueVisualization - Animated queue depth visualization
 *
 * Features:
 * - Live sparkline of the queue depth history (fills as messages arrive)
 * - In-flight indicator
 * - Color changes based on load (green -> yellow -> red)
 * - Pulsing animation when processing
 */
export const QueueVisualization: React.FC<QueueVisualizationProps> = ({
  depth,
  inFlight,
  maxCapacity = 100,
  barWidth = 14,
  animationSpeed = 500,
  compact = false,
}) => {
  const [pulse, setPulse] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const depthRef = useRef(depth);
  depthRef.current = depth;

  // Sample depth once per second so the sparkline scrolls continuously
  useEffect(() => {
    const interval = setInterval(() => {
      setHistory(h => [...h.slice(-(barWidth * 2)), depthRef.current]);
    }, 1000);
    return () => clearInterval(interval);
  }, [barWidth]);

  // Pulse animation when processing
  useEffect(() => {
    if (inFlight === 0) {
      setPulse(false);
      return;
    }

    const interval = setInterval(() => {
      setPulse(p => !p);
    }, animationSpeed);

    return () => clearInterval(interval);
  }, [inFlight, animationSpeed]);

  // Determine color based on load
  const fillPercent = Math.min(100, (depth / maxCapacity) * 100);
  const getBarColor = (): string => {
    if (fillPercent >= 80) return 'red';
    if (fillPercent >= 50) return 'yellow';
    if (depth > 0) return 'green';
    return 'gray';
  };

  const sparkline = buildSparkline(history, barWidth);

  // Border color based on activity
  const borderColor = inFlight > 0 ? (pulse ? 'cyan' : 'green') : depth > 0 ? 'green' : 'gray';

  if (compact) {
    return (
      <Box gap={1}>
        <Text color={getBarColor()}>{sparkline}</Text>
        <Text color="white">{depth}</Text>
        {inFlight > 0 && <Text color="cyan">({inFlight}»)</Text>}
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      borderStyle="single"
      borderColor={borderColor}
      paddingX={1}
      width={18}
    >
      <Text bold color={depth > 0 || inFlight > 0 ? 'white' : 'gray'}>QUEUE</Text>
      <Text color={getBarColor()}>{sparkline}</Text>
      <Box gap={1}>
        <Text color="white" bold>{depth}</Text>
        {inFlight > 0 && (
          <Text color={pulse ? 'cyan' : 'green'}>
            ({inFlight}»)
          </Text>
        )}
      </Box>
    </Box>
  );
};

export default QueueVisualization;
