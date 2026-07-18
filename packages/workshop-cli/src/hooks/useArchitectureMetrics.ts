/**
 * useArchitectureMetrics - Live Queue Metrics for Dashboard
 *
 * Polls SQS queue attributes every 1s for live visualization
 * Graceful degradation: Returns 'offline' status if queue doesn't exist
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AwsInfrastructure } from '../core/infrastructure/aws-infrastructure.js';
import { workshopConfig } from '../core/config/workshop.config.js';

export type QueueStatus = 'online' | 'offline' | 'error' | 'loading';

export interface QueueMetrics {
  status: QueueStatus;
  depth: number;       // ApproximateNumberOfMessages
  inFlight: number;    // ApproximateNumberOfMessagesNotVisible (worker active)
  dlqDepth: number;    // Dead Letter Queue messages
  delayed: number;     // ApproximateNumberOfMessagesDelayed (Backoff!)
}

export interface ArchitectureMetrics {
  /** Main worker queue metrics */
  queue: QueueMetrics;
  /** Is any worker currently processing? (inFlight > 0) */
  workerActive: boolean;
  /** Connection status to LocalStack */
  connectionStatus: 'connected' | 'disconnected' | 'checking';
  /** Last successful update timestamp */
  lastUpdate: Date | null;
  /** Polling enabled */
  polling: boolean;
}

export interface UseArchitectureMetricsOptions {
  /** Which queue to monitor (defaults to lts-worker-queue) */
  queueName?: string;
  /** Polling interval in ms (default: 1000) */
  intervalMs?: number;
  /** Enable/disable polling */
  enabled?: boolean;
}

const infrastructure = new AwsInfrastructure();

const initialMetrics: ArchitectureMetrics = {
  queue: {
    status: 'loading',
    depth: 0,
    inFlight: 0,
    dlqDepth: 0,
    delayed: 0,
  },
  workerActive: false,
  connectionStatus: 'checking',
  lastUpdate: null,
  polling: false,
};

/**
 * Hook for polling architecture metrics from LocalStack
 */
export function useArchitectureMetrics({
  queueName = workshopConfig.queues.ltsWorker,
  intervalMs = 1000,
  enabled = true,
}: UseArchitectureMetricsOptions = {}): ArchitectureMetrics {
  const [metrics, setMetrics] = useState<ArchitectureMetrics>(initialMetrics);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const fetchMetrics = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const result = await infrastructure.getQueueMetrics(queueName);

      if (!mountedRef.current) return;

      setMetrics({
        queue: {
          status: result.status,
          depth: result.depth,
          inFlight: result.inFlight,
          dlqDepth: result.dlqDepth,
          delayed: result.delayed ?? 0,
        },
        workerActive: result.inFlight > 0,
        connectionStatus: result.status === 'error' ? 'disconnected' : 'connected',
        lastUpdate: new Date(),
        polling: true,
      });
    } catch {
      if (!mountedRef.current) return;

      setMetrics(prev => ({
        ...prev,
        connectionStatus: 'disconnected',
        polling: true,
      }));
    }
  }, [queueName]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setMetrics(initialMetrics);
      return;
    }

    // Initial fetch
    fetchMetrics();

    // Start polling
    intervalRef.current = setInterval(fetchMetrics, intervalMs);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, fetchMetrics, intervalMs]);

  return metrics;
}
