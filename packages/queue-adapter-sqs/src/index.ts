/**
 * SQS Queue Adapter
 * Simplified for workshop - generic message sending
 */

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { QueuePort, Result, StatusCheckRequest, CompletionEvent } from 'contracts';
import { success, failure } from 'contracts';

export interface SqsConfig {
  region: string;
  endpoint?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  queueUrls: {
    statusCheck: string;
    completion: string;
    ltsWorker: string;
  };
}

export class SqsAdapter implements QueuePort {
  private client: SQSClient;
  private queueUrls: SqsConfig['queueUrls'];

  constructor(config: SqsConfig) {
    this.client = new SQSClient({
      region: config.region,
      endpoint: config.endpoint,
      credentials: config.credentials,
    });
    this.queueUrls = config.queueUrls;
  }

  async sendMessage(queueUrl: string, payload: object): Promise<Result<void, Error>> {
    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(payload),
        })
      );

      return success(undefined);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Send a delayed message (for polling pattern)
   */
  async sendDelayedMessage(
    queueUrl: string,
    payload: object,
    delaySeconds: number
  ): Promise<Result<void, Error>> {
    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(payload),
          DelaySeconds: Math.min(delaySeconds, 900), // Max 15 minutes
        })
      );

      return success(undefined);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Send status check request (for Phase 4: StatusPollerLambda)
   */
  async sendStatusCheck(
    payload: StatusCheckRequest,
    delaySeconds: number
  ): Promise<Result<void, Error>> {
    return this.sendDelayedMessage(this.queueUrls.statusCheck, payload, delaySeconds);
  }

  /**
   * Send completion event (for Phase completion)
   */
  async sendCompletion(payload: CompletionEvent): Promise<Result<void, Error>> {
    return this.sendMessage(this.queueUrls.completion, payload);
  }

  /**
   * Send to worker queue (for self-rescheduling in Worker Pattern)
   * Used in Phase 3: LtsExecutorLambda
   */
  async sendToWorkerQueue(payload: object): Promise<Result<void, Error>> {
    return this.sendMessage(this.queueUrls.ltsWorker, payload);
  }
}

/**
 * Helper: Calculate exponential backoff delay
 * Used in Phase 4: StatusPollerLambda
 */
export function calculateBackoffDelay(attempt: number): number {
  // 5s, 10s, 20s, 40s, 80s, ..., max 300s (5 minutes)
  return Math.min(300, Math.pow(2, attempt) * 5);
}

/**
 * Helper: Reschedule self (for Worker Pattern in Phase 3)
 * Sends the same task back to the worker queue
 */
export async function rescheduleSelf(
  client: SQSClient,
  queueUrl: string,
  payload: object
): Promise<void> {
  await client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload),
    })
  );
}
