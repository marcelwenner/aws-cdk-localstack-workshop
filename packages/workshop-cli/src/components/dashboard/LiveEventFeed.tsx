import React from 'react';
import { Box, Text } from 'ink';

export type EventType = 'sent' | 'processing' | 'completed' | 'failed' | 'dlq' | 'action';

export interface MessageEvent {
  id: string;
  timestamp: Date;
  type: EventType;
  message: string;
  duration?: number; // ms
  error?: string;
}

export interface LiveEventFeedProps {
  /** Events to display */
  events: MessageEvent[];
  /** Maximum events to show */
  maxEvents?: number;
  /** Title */
  title?: string;
  /** Compact mode */
  compact?: boolean;
  /** Fixed width (keeps the box stable while events stream in) */
  width?: number;
}

// Icons and colors for each event type
const EVENT_CONFIG: Record<EventType, { icon: string; color: string }> = {
  sent: { icon: '[**]', color: 'yellow' },
  processing: { icon: '[▶]', color: 'cyan' },
  completed: { icon: '[✓]', color: 'green' },
  failed: { icon: '[✗]', color: 'red' },
  dlq: { icon: '[!!]', color: 'red' },
  action: { icon: '[→]', color: 'magenta' },
};

/**
 * Format timestamp as HH:MM:SS
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format duration in seconds
 */
function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * LiveEventFeed - Scrolling event timeline
 *
 * Features:
 * - Shows recent events with timestamps
 * - Color-coded icons for different event types
 * - Duration display for completed events
 * - Error messages for failed events
 */
export const LiveEventFeed: React.FC<LiveEventFeedProps> = ({
  events,
  maxEvents = 5,
  title = 'LIVE EVENTS',
  compact = false,
  width,
}) => {
  // Take most recent events
  const displayEvents = events.slice(-maxEvents).reverse();

  if (compact) {
    return (
      <Box flexDirection="column">
        {displayEvents.map(event => {
          const config = EVENT_CONFIG[event.type];
          return (
            <Box key={event.id} gap={1}>
              <Text dimColor>{formatTime(event.timestamp).slice(-5)}</Text>
              <Text color={config.color}>{config.icon}</Text>
              <Text color={event.type === 'dlq' || event.type === 'failed' ? 'red' : 'white'}>
                {event.message.slice(0, 30)}
              </Text>
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      width={width}
    >
      <Box justifyContent="space-between" gap={2} marginBottom={1}>
        <Text bold color="white">{title}</Text>
        <Text dimColor>{events.length} events</Text>
      </Box>

      {displayEvents.length === 0 ? (
        <Text dimColor>Keine Events</Text>
      ) : (
        displayEvents.map(event => {
          const config = EVENT_CONFIG[event.type];
          const isDanger = event.type === 'dlq' || event.type === 'failed';

          return (
            <Box key={event.id} gap={1}>
              <Text dimColor>{formatTime(event.timestamp)}</Text>
              <Text color={config.color} bold={isDanger}>
                {config.icon}
              </Text>
              <Text color={isDanger ? 'red' : 'white'}>
                {event.message}
              </Text>
              {event.duration && (
                <Text dimColor>
                  {'─'.repeat(Math.max(1, 40 - event.message.length))} {formatDuration(event.duration)}
                </Text>
              )}
              {event.error && (
                <Text color="red" dimColor>
                   ({event.error})
                </Text>
              )}
            </Box>
          );
        })
      )}
    </Box>
  );
};

/**
 * Create a new event with auto-generated ID
 */
let eventIdCounter = 0;
export function createEvent(
  type: EventType,
  message: string,
  options?: { duration?: number; error?: string }
): MessageEvent {
  return {
    id: `evt-${++eventIdCounter}`,
    timestamp: new Date(),
    type,
    message,
    ...options,
  };
}

export default LiveEventFeed;
