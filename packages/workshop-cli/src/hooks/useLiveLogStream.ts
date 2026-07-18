import { useState, useEffect, useRef } from 'react';
import { CloudWatchLogsClient, FilterLogEventsCommand, FilteredLogEvent } from '@aws-sdk/client-cloudwatch-logs';
import { workshopConfig } from '../core/config/workshop.config.js';

export interface LogEntry {
  timestamp: number;
  message: string;
  formatted: string;
}

export interface LiveLogStreamOptions {
  lambdaName?: string;
  enabled?: boolean;
  maxLogs?: number;
}

export interface LiveLogStreamState {
  logs: LogEntry[];
  isStreaming: boolean;
  error?: string;
}

/**
 * Hook for streaming live CloudWatch logs from a Lambda function
 *
 * Usage:
 * const { logs, isStreaming } = useLiveLogStream({
 *   lambdaName: 'LtsExecutorLambda',
 *   enabled: true
 * });
 */
export function useLiveLogStream({
  lambdaName,
  enabled = true,
  maxLogs = 100
}: LiveLogStreamOptions): LiveLogStreamState {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string>();
  const lastTimestampRef = useRef<number>(Date.now() - 60000); // Start 1 minute ago
  const clientRef = useRef<CloudWatchLogsClient | null>(null);

  useEffect(() => {
    if (!enabled || !lambdaName) {
      setIsStreaming(false);
      return;
    }

    // Initialize CloudWatch client
    if (!clientRef.current) {
      clientRef.current = new CloudWatchLogsClient({
        region: workshopConfig.aws.region,
        endpoint: workshopConfig.aws.endpoint,
        credentials: workshopConfig.aws.credentials,
      });
    }

    const logGroupName = `/aws/lambda/${lambdaName}`;
    setIsStreaming(true);
    setError(undefined);

    const poll = async () => {
      if (!enabled || !clientRef.current) return;

      try {
        const command = new FilterLogEventsCommand({
          logGroupName,
          startTime: lastTimestampRef.current,
        });

        const result = await clientRef.current.send(command);

        if (result.events && result.events.length > 0) {
          const newLogs: LogEntry[] = result.events
            .filter(event => event.timestamp! > lastTimestampRef.current)
            .map(event => ({
              timestamp: event.timestamp!,
              message: event.message || '',
              formatted: formatLogEntry(event)
            }));

          if (newLogs.length > 0) {
            setLogs(prev => {
              const updated = [...prev, ...newLogs];
              // Keep only last maxLogs entries
              return updated.slice(-maxLogs);
            });

            // Update last timestamp
            const maxTimestamp = Math.max(...newLogs.map(l => l.timestamp));
            lastTimestampRef.current = maxTimestamp;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch logs');
        setIsStreaming(false);
      }
    };

    // Initial poll
    poll();

    // Poll every 2 seconds
    const interval = setInterval(poll, 2000);

    return () => {
      clearInterval(interval);
      setIsStreaming(false);
    };
  }, [lambdaName, enabled, maxLogs]);

  return {
    logs,
    isStreaming,
    error
  };
}

/**
 * Format a log entry with timestamp
 */
function formatLogEntry(event: FilteredLogEvent): string {
  const timestamp = new Date(event.timestamp!).toLocaleTimeString('de-DE');
  return `[${timestamp}] ${event.message}`;
}
