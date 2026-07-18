/**
 * LiveLogViewer - Clean Log Display
 *
 * Features:
 * - Scrollable panel with keyboard navigation (like ScrollableCodeView)
 * - Simple level-based coloring
 * - JSON logs formatted as key=value
 * - Filter by log level
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { LogEntry } from '../../hooks/useLiveLogStream.js';

/**
 * Filter types for log level filtering.
 */
export type LogFilter = 'ALL' | 'ERROR' | 'WARN' | 'INFO';

export interface LiveLogViewerProps {
  logs: LogEntry[];
  isStreaming: boolean;
  lambdaName?: string;
  error?: string;
  /** Controlled filter state (optional - uses internal state if not provided) */
  activeFilter?: LogFilter;
  /** Callback when filter changes (for persistence) */
  onFilterChange?: (filter: LogFilter) => void;
}

const FILTERS: LogFilter[] = ['ALL', 'ERROR', 'WARN', 'INFO'];

interface ParsedLog {
  timestamp?: string;
  level?: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  event?: string;
  data: Record<string, unknown>;
  raw: string;
  isJson: boolean;
}

/**
 * Parse a log line
 */
function parseLogLine(message: string): ParsedLog {
  // CloudWatch-Lambda-Zeilen sind tab-separiert. Ink misst \t als 1 Zeichen,
  // das Terminal rendert bis zu 8 - die Differenz sprengt das Layout und
  // lässt den ganzen Screen flackern. Tabs/CR deshalb IMMER ersetzen.
  const trimmed = message.replace(/\t/g, '  ').replace(/\r/g, '').trim();

  try {
    const parsed = JSON.parse(trimmed);
    const level = extractLevel(parsed);
    const timestamp = parsed.timestamp || parsed.time || parsed.ts;
    const event = parsed.event || parsed.msg || parsed.message;

    // Remove known fields from data
    const data = { ...parsed };
    delete data.timestamp;
    delete data.time;
    delete data.ts;
    delete data.event;
    delete data.msg;
    delete data.message;
    delete data.level;
    delete data.severity;

    return {
      timestamp: formatTimestamp(timestamp),
      level,
      event: event ? String(event) : undefined,
      data,
      raw: trimmed,
      isJson: true,
    };
  } catch {
    return {
      level: extractLevelFromText(trimmed),
      data: {},
      raw: trimmed,
      isJson: false,
    };
  }
}

function extractLevel(parsed: Record<string, unknown>): ParsedLog['level'] {
  const levelField = parsed.level || parsed.severity || parsed.lvl;
  if (levelField) {
    const levelStr = String(levelField).toUpperCase();
    if (levelStr.includes('ERROR') || levelStr.includes('ERR')) return 'ERROR';
    if (levelStr.includes('WARN')) return 'WARN';
    if (levelStr.includes('INFO')) return 'INFO';
    if (levelStr.includes('DEBUG')) return 'DEBUG';
  }

  const eventField = parsed.event;
  if (eventField) {
    const eventStr = String(eventField).toUpperCase();
    if (eventStr.includes('ERROR') || eventStr.includes('FAILED')) return 'ERROR';
    if (eventStr.includes('WARN') || eventStr.includes('RETRY')) return 'WARN';
    return 'INFO';
  }

  return undefined;
}

function extractLevelFromText(text: string): ParsedLog['level'] {
  const upper = text.toUpperCase();
  if (upper.includes('[ERROR]') || upper.includes('ERROR:')) return 'ERROR';
  if (upper.includes('[WARN]') || upper.includes('WARNING:')) return 'WARN';
  if (upper.includes('[INFO]') || upper.includes('INFO:')) return 'INFO';
  return undefined;
}

function formatTimestamp(ts: unknown): string | undefined {
  if (!ts) return undefined;

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

  if (typeof ts === 'number') {
    const ms = ts > 1e12 ? ts : ts * 1000;
    return new Date(ms).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  return undefined;
}

/**
 * Get color for log level
 */
function getLevelColor(level?: ParsedLog['level']): string {
  switch (level) {
    case 'ERROR': return 'red';
    case 'WARN': return 'yellow';
    case 'INFO': return 'blue';
    case 'DEBUG': return 'gray';
    default: return 'white';
  }
}

/**
 * Get color for a value based on content
 */
function getValueColor(value: string): string | undefined {
  const lower = value.toLowerCase();
  if (lower.includes('error') || lower.includes('failed')) return 'red';
  if (lower.includes('success') || lower.includes('complete')) return 'green';
  return undefined;
}

/**
 * Check if a key should be highlighted (special keys)
 */
function isSpecialKey(key: string): boolean {
  return key === 'releaseId';
}

/**
 * Single Log Line Component
 */
const LogLine: React.FC<{ log: ParsedLog }> = ({ log }) => {
  const levelColor = getLevelColor(log.level);

  // WICHTIG: genau EINE Terminal-Zeile pro Log (wrap="truncate-end").
  // Umbrechende oder überlaufende Zeilen zerstören Inks Cursor-Sync:
  // Rahmen zerreißt, Inhalt blutet in die Sidebar, alles flackert.
  if (log.isJson) {
    return (
      <Box flexShrink={0} width="100%">
        <Text wrap="truncate-end">
          {/* Timestamp */}
          {log.timestamp && (
            <Text dimColor>{log.timestamp} </Text>
          )}

          {/* Level badge */}
          {log.level && (
            <Text color={levelColor} bold>[{log.level.padEnd(5)}] </Text>
          )}

          {/* Event/message */}
          {log.event && (
            <Text color={getValueColor(log.event) || 'white'}>{log.event} </Text>
          )}

          {/* Data as key=value pairs */}
          {Object.entries(log.data).map(([key, value], i) => {
            const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
            const valueColor = getValueColor(valueStr);
            const special = isSpecialKey(key);
            return (
              <Text key={`data-${i}`}>
                <Text color={special ? 'yellow' : 'cyan'} bold={special}>{key}</Text>
                <Text dimColor>=</Text>
                <Text color={special ? 'yellow' : valueColor} bold={special} dimColor={!special && !valueColor}>{valueStr}</Text>
                <Text> </Text>
              </Text>
            );
          })}
        </Text>
      </Box>
    );
  }

  // Plain text - colorize based on content
  const textColor = getValueColor(log.raw) || levelColor;
  return (
    <Box flexShrink={0} width="100%">
      <Text color={textColor} wrap="truncate-end">{log.raw}</Text>
    </Box>
  );
};

/**
 * Main LiveLogViewer Component
 */
export const LiveLogViewer: React.FC<LiveLogViewerProps> = ({
  logs,
  isStreaming,
  lambdaName,
  error,
  activeFilter: controlledFilter,
  onFilterChange,
}) => {
  const [internalFilter, setInternalFilter] = useState<LogFilter>('ALL');
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);

  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows || 24;
  const maxVisibleLogs = Math.max(5, terminalHeight - 12); // Reserve space for chrome

  const activeFilter = controlledFilter ?? internalFilter;

  const setFilter = (filter: LogFilter) => {
    onFilterChange?.(filter);
    if (controlledFilter === undefined) {
      setInternalFilter(filter);
    }
    setScrollOffset(0);
    setAutoScroll(true);
  };

  // Parse and filter logs
  const filteredLogs = useMemo(() => {
    const parsed = logs.map(log => ({
      entry: log,
      // Use raw message for parsing (not formatted which has timestamp prefix)
      parsed: parseLogLine(log.message),
    }));

    if (activeFilter === 'ALL') return parsed;

    return parsed.filter(({ parsed }) => {
      if (activeFilter === 'ERROR') return parsed.level === 'ERROR';
      if (activeFilter === 'WARN') return parsed.level === 'WARN' || parsed.level === 'ERROR';
      if (activeFilter === 'INFO') return ['INFO', 'WARN', 'ERROR'].includes(parsed.level || '');
      return true;
    });
  }, [logs, activeFilter]);

  // Count logs by level
  const logCounts = useMemo(() => {
    const counts = { ALL: logs.length, ERROR: 0, WARN: 0, INFO: 0 };
    logs.forEach(log => {
      const level = parseLogLine(log.message).level;
      if (level === 'ERROR') counts.ERROR++;
      if (level === 'WARN') counts.WARN++;
      if (level === 'INFO') counts.INFO++;
    });
    return counts;
  }, [logs]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && filteredLogs.length > maxVisibleLogs) {
      setScrollOffset(Math.max(0, filteredLogs.length - maxVisibleLogs));
    }
  }, [filteredLogs.length, autoScroll, maxVisibleLogs]);

  const canScroll = filteredLogs.length > maxVisibleLogs;
  const maxOffset = Math.max(0, filteredLogs.length - maxVisibleLogs);

  // Handle input
  useInput((input, key) => {
    // Filter shortcuts
    if (input === '1') setFilter('ALL');
    else if (input === '2') setFilter('ERROR');
    else if (input === '3') setFilter('WARN');
    else if (input === '4') setFilter('INFO');

    // Scroll
    if (canScroll) {
      if (key.upArrow || input === 'k') {
        setScrollOffset(prev => Math.max(0, prev - 1));
        setAutoScroll(false);
      } else if (key.downArrow || input === 'j') {
        const newOffset = Math.min(maxOffset, scrollOffset + 1);
        setScrollOffset(newOffset);
        setAutoScroll(newOffset >= maxOffset);
      } else if (key.pageUp) {
        setScrollOffset(prev => Math.max(0, prev - maxVisibleLogs));
        setAutoScroll(false);
      } else if (key.pageDown) {
        const newOffset = Math.min(maxOffset, scrollOffset + maxVisibleLogs);
        setScrollOffset(newOffset);
        setAutoScroll(newOffset >= maxOffset);
      } else if (input === 'g') {
        setScrollOffset(0);
        setAutoScroll(false);
      } else if (input === 'G') {
        setScrollOffset(maxOffset);
        setAutoScroll(true);
      }
    }
  });

  const visibleLogs = filteredLogs.slice(scrollOffset, scrollOffset + maxVisibleLogs);
  const scrollPercent = maxOffset > 0 ? Math.round((scrollOffset / maxOffset) * 100) : 100;

  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0}>
      {/* Header with filters */}
      <Box flexShrink={0}>
        <Text bold color="cyan">
          {isStreaming ? '● ' : '○ '}
          Live Logs
        </Text>
        {lambdaName && (
          <>
            <Text dimColor> │ </Text>
            <Text color="magenta">{lambdaName}</Text>
          </>
        )}
        <Text dimColor> │ </Text>

        {/* Filter Tabs */}
        {FILTERS.map((filter, idx) => {
          const isActive = activeFilter === filter;
          const count = logCounts[filter];
          const colors: Record<LogFilter, string> = {
            ALL: 'cyan',
            ERROR: 'red',
            WARN: 'yellow',
            INFO: 'blue',
          };

          return (
            <Text key={filter}>
              <Text
                color={isActive ? 'black' : colors[filter]}
                backgroundColor={isActive ? colors[filter] : undefined}
                bold={isActive}
                dimColor={!isActive && count === 0}
              >
                [{idx + 1}]{filter}
              </Text>
              {count > 0 && filter !== 'ALL' && (
                <Text color={colors[filter]} dimColor={!isActive}>
                  :{count}
                </Text>
              )}
              <Text> </Text>
            </Text>
          );
        })}

        {/* Scroll hint */}
        {canScroll && (
          <>
            <Text dimColor> │ </Text>
            <Text dimColor>[↑↓] scroll ({scrollPercent}%)</Text>
          </>
        )}
      </Box>

      {/* Error State */}
      {error && (
        <Box flexShrink={0}>
          <Text color="red">✗ {error}</Text>
        </Box>
      )}

      {/* Scrollable content box with border (like ScrollableCodeView) */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        flexGrow={1}
        minHeight={0}
        overflow="hidden"
      >
        {/* Empty State */}
        {!error && filteredLogs.length === 0 && (
          <Box paddingY={1}>
            <Text dimColor>
              {isStreaming
                ? activeFilter !== 'ALL'
                  ? `Keine ${activeFilter} Logs...`
                  : 'Warte auf Logs...'
                : 'Keine Logs verfügbar'}
            </Text>
          </Box>
        )}

        {/* Scroll up indicator */}
        {filteredLogs.length > 0 && scrollOffset > 0 && (
          <Box flexShrink={0}>
            <Text dimColor>↑ {scrollOffset} more logs above</Text>
          </Box>
        )}

        {/* Visible logs */}
        {visibleLogs.map(({ parsed }, idx) => (
          <LogLine key={`log-${scrollOffset + idx}`} log={parsed} />
        ))}

        {/* Scroll down indicator */}
        {filteredLogs.length > 0 && scrollOffset < maxOffset && (
          <Box flexShrink={0}>
            <Text dimColor>↓ {filteredLogs.length - scrollOffset - maxVisibleLogs} more logs below</Text>
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box flexShrink={0} justifyContent="space-between">
        <Text dimColor>
          {filteredLogs.length}/{logs.length} Logs
          {autoScroll && ' • Auto-scroll'}
        </Text>
        <Text dimColor>
          [1-4] Filter • [↑↓/jk] Scroll • [g/G] Top/Bottom • [Esc] Close
        </Text>
      </Box>
    </Box>
  );
};
