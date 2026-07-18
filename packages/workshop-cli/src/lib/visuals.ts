/**
 * Visual Utilities for Mission Control Dashboard
 *
 * Progress bars, status colors, and visual indicators
 * for the "nuclear power plant" dashboard feel.
 */

/**
 * Get a smooth progress bar using block characters.
 *
 * @param current - Current value (e.g., queue depth)
 * @param max - Maximum value for 100%
 * @param width - Character width of the bar (default 20, use 8 for compact mode)
 * @returns Progress bar string like "████████░░░░░░░░░░░░"
 */
export function getProgressBar(current: number, max: number, width = 20): string {
  if (max <= 0) return '░'.repeat(width);

  const ratio = Math.min(current / max, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Get status color based on utilization percentage.
 *
 * @param current - Current value
 * @param max - Maximum value
 * @returns Color string: green (0-50%), yellow (50-80%), red (80%+)
 */
export function getStatusColor(current: number, max: number): string {
  if (max <= 0) return 'gray';

  const ratio = current / max;

  if (ratio >= 0.8) return 'red';
  if (ratio >= 0.5) return 'yellow';
  return 'green';
}

/**
 * Get a progress bar with "in flight" indicator.
 * Shows: [processed][in-flight][empty]
 *
 * @param depth - Current queue depth (waiting)
 * @param inFlight - Messages currently being processed
 * @param max - Maximum capacity
 * @param width - Character width of the bar (default 20, use 8 for compact mode)
 * @returns Progress bar with cyan in-flight section like "████▓▓░░░░░░░░░░░░░░"
 */
export function getInFlightBar(
  depth: number,
  inFlight: number,
  max: number,
  width = 20
): string {
  if (max <= 0) return '░'.repeat(width);

  const total = depth + inFlight;
  const depthRatio = Math.min(depth / max, 1);
  const inFlightRatio = Math.min(inFlight / max, 1 - depthRatio);

  const depthChars = Math.round(depthRatio * width);
  const inFlightChars = Math.round(inFlightRatio * width);
  const emptyChars = width - depthChars - inFlightChars;

  // █ = waiting in queue, ▓ = in flight, ░ = empty
  return '█'.repeat(depthChars) + '▓'.repeat(inFlightChars) + '░'.repeat(emptyChars);
}

/**
 * Arrow animation frames for flow visualization.
 */
export const ARROW_FRAMES = ['──▶', '═─▶', '══▶', '═─▶'] as const;

/**
 * ASCII spinner frames for loading states.
 */
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/**
 * Format duration in milliseconds to human readable.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string like "1.2s" or "150ms"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
