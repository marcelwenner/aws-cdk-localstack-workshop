/**
 * Log Formatter Utilities
 *
 * JSON log parsing and colorized output for the Matrix-style log viewer.
 */

import React from 'react';
import { Text, Box } from 'ink';

/**
 * Parsed log entry structure.
 */
export interface ParsedLog {
  timestamp?: string;
  level?: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  event?: string;
  message?: string;
  raw: string;
  isJson: boolean;
}

/**
 * Parse a log line, attempting JSON first.
 */
export function parseLogLine(message: string): ParsedLog {
  const trimmed = message.trim();

  // Try JSON parsing
  try {
    const parsed = JSON.parse(trimmed);

    // Extract common log fields
    const level = extractLevel(parsed);
    const timestamp = parsed.timestamp || parsed.time || parsed.ts;
    const event = parsed.event || parsed.msg || parsed.message;

    return {
      timestamp: formatTimestamp(timestamp),
      level,
      event: String(event || ''),
      message: trimmed,
      raw: trimmed,
      isJson: true,
    };
  } catch {
    // Not JSON - try to extract level from plaintext
    const level = extractLevelFromText(trimmed);
    return {
      level,
      message: trimmed,
      raw: trimmed,
      isJson: false,
    };
  }
}

/**
 * Extract log level from parsed JSON.
 */
function extractLevel(parsed: Record<string, unknown>): ParsedLog['level'] {
  // Check explicit level field first
  const levelField = parsed.level || parsed.severity || parsed.lvl;
  if (levelField) {
    const levelStr = String(levelField).toUpperCase();

    if (levelStr.includes('ERROR') || levelStr.includes('ERR')) return 'ERROR';
    if (levelStr.includes('WARN')) return 'WARN';
    if (levelStr.includes('INFO')) return 'INFO';
    if (levelStr.includes('DEBUG') || levelStr.includes('TRACE')) return 'DEBUG';
  }

  // Infer level from event field (for Lambda structured logs)
  const eventField = parsed.event;
  if (eventField) {
    const eventStr = String(eventField).toUpperCase();

    // Error events
    if (eventStr.includes('ERROR') || eventStr.includes('FAILED') || eventStr.includes('EXCEPTION')) {
      return 'ERROR';
    }
    // Warning events
    if (eventStr.includes('WARN') || eventStr.includes('RETRY') || eventStr.includes('TIMEOUT')) {
      return 'WARN';
    }
    // All other structured events are INFO
    return 'INFO';
  }

  return undefined;
}

/**
 * Extract log level from plaintext.
 */
function extractLevelFromText(text: string): ParsedLog['level'] {
  const upper = text.toUpperCase();

  if (upper.includes('[ERROR]') || upper.includes('ERROR:')) return 'ERROR';
  if (upper.includes('[WARN]') || upper.includes('WARNING:')) return 'WARN';
  if (upper.includes('[INFO]') || upper.includes('INFO:')) return 'INFO';
  if (upper.includes('[DEBUG]')) return 'DEBUG';

  return undefined;
}

/**
 * Format timestamp for display.
 */
function formatTimestamp(ts: unknown): string | undefined {
  if (!ts) return undefined;

  // ISO timestamp
  if (typeof ts === 'string') {
    const date = new Date(ts);
    if (!isNaN(date.getTime())) {
      return date.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }
    return ts;
  }

  // Unix timestamp (seconds, milliseconds, or nanoseconds)
  if (typeof ts === 'number') {
    let ms: number;
    if (ts > 1e15) {
      // Nanoseconds (Go/Rust) - divide by 1e6
      ms = ts / 1e6;
    } else if (ts > 1e12) {
      // Milliseconds
      ms = ts;
    } else {
      // Seconds
      ms = ts * 1000;
    }
    return new Date(ms).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  return undefined;
}

/**
 * Get styling for log level.
 */
export function getLevelStyle(level: ParsedLog['level']): {
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
} {
  switch (level) {
    case 'ERROR':
      return { backgroundColor: 'red', color: 'white', bold: true };
    case 'WARN':
      return { color: 'yellow', bold: true };
    case 'INFO':
      return { color: 'blue' };
    case 'DEBUG':
      return { color: 'gray' };
    default:
      return {};
  }
}

/**
 * Get color for event type (for Lambda structured logs).
 */
function getEventColor(event: string): string {
  const upper = event.toUpperCase();

  // Success/completion events - green
  if (upper.includes('COMPLETE') || upper.includes('SUCCESS') || upper.includes('DONE')) {
    return 'green';
  }
  // Processing/in-progress events - cyan
  if (upper.includes('PROCESSING') || upper.includes('EXECUTING') || upper.includes('STARTING')) {
    return 'cyan';
  }
  // Reschedule/retry events - yellow
  if (upper.includes('RESCHEDULE') || upper.includes('RETRY') || upper.includes('WAITING')) {
    return 'yellow';
  }
  // Error events - red
  if (upper.includes('ERROR') || upper.includes('FAILED') || upper.includes('EXCEPTION')) {
    return 'red';
  }

  return 'white';
}

/**
 * JsonLogLine Component
 *
 * Renders a single log line with JSON parsing and level-based coloring.
 */
interface JsonLogLineProps {
  message: string;
  width?: number;
}

export const JsonLogLine: React.FC<JsonLogLineProps> = ({ message, width }) => {
  const parsed = parseLogLine(message);
  const style = getLevelStyle(parsed.level);

  // JSON log: show formatted with event coloring
  if (parsed.isJson) {
    const eventColor = parsed.event ? getEventColor(parsed.event) : undefined;

    return (
      <Box flexWrap="wrap" width={width}>
        {/* Timestamp */}
        {parsed.timestamp && (
          <Text dimColor>{parsed.timestamp} </Text>
        )}

        {/* Event badge (colorized) */}
        {parsed.event && (
          <Text color={eventColor} bold>
            {parsed.event}
          </Text>
        )}

        {/* Additional JSON data (simplified) */}
        {parsed.isJson && parsed.raw && formatJsonData(parsed.raw, parsed.event) && (
          <Text dimColor wrap="wrap">
            {` ${formatJsonData(parsed.raw, parsed.event)}`}
          </Text>
        )}
      </Box>
    );
  }

  // Plaintext: color based on detected level
  return (
    <Box flexWrap="wrap" width={width}>
      <Text
        color={style.color}
        backgroundColor={style.backgroundColor}
        bold={style.bold}
        dimColor={!parsed.level}
        wrap="wrap"
      >
        {parsed.raw}
      </Text>
    </Box>
  );
};

/**
 * Format JSON data for display (remove redundant fields).
 */
function formatJsonData(raw: string, event?: string): string {
  try {
    const parsed = JSON.parse(raw);
    // Remove fields that are already shown
    delete parsed.event;
    delete parsed.timestamp;
    delete parsed.time;
    delete parsed.ts;
    delete parsed.level;
    delete parsed.severity;
    delete parsed.msg;
    delete parsed.message;

    const remaining = Object.entries(parsed);
    if (remaining.length === 0) return '';

    // Format as key=value pairs
    return remaining.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
  } catch {
    return '';
  }
}

export default JsonLogLine;
