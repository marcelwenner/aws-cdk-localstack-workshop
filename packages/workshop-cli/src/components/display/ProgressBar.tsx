import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

export interface ProgressBarProps {
  /** Progress percentage (0-100) */
  percent: number;
  /** Width in characters (default: 20) */
  width?: number;
  /** Show percentage text (default: true) */
  showPercent?: boolean;
  /** Enable pulsing animation when running (default: false) */
  animated?: boolean;
  /** Color for filled portion (default: green) */
  color?: string;
  /** Label to show before the bar */
  label?: string;
  /** Compact mode (smaller bar) */
  compact?: boolean;
}

/**
 * Animated progress bar component for deployment steps.
 * Features:
 * - Smooth fill animation
 * - Pulsing effect when animated
 * - Customizable colors and width
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  percent,
  width = 20,
  showPercent = true,
  animated = false,
  color = 'green',
  label,
  compact = false,
}) => {
  const [pulse, setPulse] = useState(false);

  // Pulsing animation for running state
  useEffect(() => {
    if (!animated || percent >= 100) return;

    const interval = setInterval(() => {
      setPulse(p => !p);
    }, 500);

    return () => clearInterval(interval);
  }, [animated, percent]);

  // Calculate filled/empty widths
  const effectiveWidth = compact ? Math.floor(width * 0.6) : width;
  const filled = Math.round((percent / 100) * effectiveWidth);
  const empty = effectiveWidth - filled;

  // Characters
  const filledChar = '█';
  const emptyChar = '░';

  // Determine color based on pulse state
  const barColor = pulse ? 'cyan' : color;

  return (
    <Box>
      {label && (
        <Text>
          {label.padEnd(compact ? 6 : 8)}
        </Text>
      )}
      <Text color="gray">[</Text>
      <Text color={barColor}>{filledChar.repeat(filled)}</Text>
      <Text color="gray">{emptyChar.repeat(empty)}</Text>
      <Text color="gray">]</Text>
      {showPercent && (
        <Text dimColor> {percent.toString().padStart(3)}%</Text>
      )}
    </Box>
  );
};

// =============================================================================
// Pseudo-Progress Animation Helper
// =============================================================================

export interface PseudoProgressOptions {
  /** Callback when progress updates */
  onProgress: (percent: number) => void;
  /** Maximum percent before completion (default: 80) */
  maxPercent?: number;
  /** Update interval in ms (default: 100) */
  interval?: number;
  /** Speed factor (higher = faster, default: 0.1) */
  speed?: number;
}

/**
 * Start a pseudo-progress animation that asymptotically approaches maxPercent.
 * Returns a cleanup function that completes the progress to 100%.
 *
 * Usage:
 * ```
 * const complete = animatePseudoProgress({ onProgress: setPercent });
 * // ... when task finishes ...
 * complete(); // Jumps to 100%
 * ```
 */
export function animatePseudoProgress(options: PseudoProgressOptions): () => void {
  const {
    onProgress,
    maxPercent = 80,
    interval = 100,
    speed = 0.1,
  } = options;

  let percent = 0;
  let running = true;

  const timer = setInterval(() => {
    if (!running) return;

    // Asymptotic approach: fast at start, slow near end
    const remaining = maxPercent - percent;
    const increment = Math.max(0.5, remaining * speed);
    percent = Math.min(maxPercent, percent + increment);

    onProgress(Math.round(percent));
  }, interval);

  // Return cleanup function that completes to 100%
  return () => {
    running = false;
    clearInterval(timer);
    onProgress(100);
  };
}

export default ProgressBar;
