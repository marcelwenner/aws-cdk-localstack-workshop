/**
 * Mock Infrastructure Port
 *
 * Test implementation of InfrastructurePort.
 * Allows configuring responses for each method.
 */

import type { LambdaName, QueueName } from '../../shared/constants.js';
import type {
  InfrastructurePort,
  LambdaInvocationResult,
  LambdaErrorType,
} from './infrastructure.port.js';

// =============================================================================
// Mock Infrastructure Port
// =============================================================================

export class MockInfrastructurePort implements InfrastructurePort {
  // Storage for mock configurations
  private lambdaExistsMap = new Map<LambdaName, boolean>();
  private lambdaEnvMap = new Map<LambdaName, Record<string, string>>();
  private lambdaResponsesMap = new Map<LambdaName, LambdaInvocationResult<unknown>>();
  private queueUrlsMap = new Map<QueueName, string | null>();
  private queueMessagesMap = new Map<QueueName, unknown[]>();
  private queueMetricsMap = new Map<QueueName, {
    status: 'online' | 'offline' | 'error';
    depth: number;
    inFlight: number;
    dlqDepth: number;
  }>();
  private dbResultsMap = new Map<string, unknown[]>();
  private currentTime = new Date();

  // Call tracking for assertions
  public calls = {
    lambdaExists: [] as LambdaName[],
    getLambdaEnv: [] as LambdaName[],
    invokeLambda: [] as { name: LambdaName; payload: unknown }[],
    queryDb: [] as { query: string; params?: unknown[] }[],
    getQueueUrl: [] as QueueName[],
    purgeQueue: [] as QueueName[],
    receiveMessages: [] as { name: QueueName; maxMessages?: number }[],
    sendMessage: [] as { name: QueueName; body: unknown }[],
    getQueueMetrics: [] as QueueName[],
  };

  // ---------------------------------------------------------------------------
  // Configuration Methods
  // ---------------------------------------------------------------------------

  /** Configure whether a Lambda exists */
  setLambdaExists(name: LambdaName, exists: boolean): this {
    this.lambdaExistsMap.set(name, exists);
    return this;
  }

  /** Configure Lambda environment variables */
  setLambdaEnv(name: LambdaName, env: Record<string, string>): this {
    this.lambdaEnvMap.set(name, env);
    return this;
  }

  /** Configure Lambda invocation response */
  setLambdaResponse<T>(
    name: LambdaName,
    response: LambdaInvocationResult<T>
  ): this {
    this.lambdaResponsesMap.set(name, response as LambdaInvocationResult<unknown>);
    return this;
  }

  /** Helper: Configure Lambda to return NOT_FOUND */
  setLambdaNotFound(name: LambdaName): this {
    this.lambdaExistsMap.set(name, false);
    this.lambdaResponsesMap.set(name, {
      success: false,
      errorType: 'NOT_FOUND',
      errorMessage: `Function not found: ${name}`,
    });
    return this;
  }

  /** Helper: Configure Lambda to return NOT_IMPLEMENTED */
  setLambdaNotImplemented(name: LambdaName): this {
    this.lambdaExistsMap.set(name, true);
    this.lambdaResponsesMap.set(name, {
      success: false,
      errorType: 'NOT_IMPLEMENTED',
      errorMessage: 'Error: NOT_IMPLEMENTED',
    });
    return this;
  }

  /** Helper: Configure Lambda to succeed with payload */
  setLambdaSuccess<T>(name: LambdaName, payload: T): this {
    this.lambdaExistsMap.set(name, true);
    this.lambdaResponsesMap.set(name, {
      success: true,
      statusCode: 200,
      payload,
    });
    return this;
  }

  /** Configure queue URL */
  setQueueUrl(name: QueueName, url: string | null): this {
    this.queueUrlsMap.set(name, url);
    return this;
  }

  /** Configure queue messages */
  setQueueMessages(name: QueueName, messages: unknown[]): this {
    this.queueMessagesMap.set(name, messages);
    return this;
  }

  /** Configure queue metrics */
  setQueueMetrics(
    name: QueueName,
    metrics: { status: 'online' | 'offline' | 'error'; depth: number; inFlight: number; dlqDepth: number }
  ): this {
    this.queueMetricsMap.set(name, metrics);
    return this;
  }

  /** Configure database query result */
  setDbResult(query: string, result: unknown[]): this {
    this.dbResultsMap.set(query, result);
    return this;
  }

  /** Set current time */
  setNow(date: Date): this {
    this.currentTime = date;
    return this;
  }

  /** Reset all mocks and call tracking */
  reset(): this {
    this.lambdaExistsMap.clear();
    this.lambdaEnvMap.clear();
    this.lambdaResponsesMap.clear();
    this.queueUrlsMap.clear();
    this.queueMessagesMap.clear();
    this.queueMetricsMap.clear();
    this.dbResultsMap.clear();
    this.calls = {
      lambdaExists: [],
      getLambdaEnv: [],
      invokeLambda: [],
      queryDb: [],
      getQueueUrl: [],
      purgeQueue: [],
      receiveMessages: [],
      sendMessage: [],
      getQueueMetrics: [],
    };
    return this;
  }

  // ---------------------------------------------------------------------------
  // InfrastructurePort Implementation
  // ---------------------------------------------------------------------------

  async lambdaExists(name: LambdaName): Promise<boolean> {
    this.calls.lambdaExists.push(name);
    return this.lambdaExistsMap.get(name) ?? false;
  }

  async getLambdaEnv(name: LambdaName): Promise<Record<string, string>> {
    this.calls.getLambdaEnv.push(name);
    return this.lambdaEnvMap.get(name) ?? {};
  }

  async invokeLambda<T = unknown>(
    name: LambdaName,
    payload: unknown
  ): Promise<LambdaInvocationResult<T>> {
    this.calls.invokeLambda.push({ name, payload });

    const response = this.lambdaResponsesMap.get(name);
    if (!response) {
      // Default: not found
      return {
        success: false,
        errorType: 'NOT_FOUND',
        errorMessage: `Mock not configured for Lambda: ${name}`,
      };
    }
    return response as LambdaInvocationResult<T>;
  }

  async queryDb<T = unknown>(query: string, params?: unknown[]): Promise<T[]> {
    this.calls.queryDb.push({ query, params });
    return (this.dbResultsMap.get(query) ?? []) as T[];
  }

  async getQueueUrl(name: QueueName): Promise<string | null> {
    this.calls.getQueueUrl.push(name);
    return this.queueUrlsMap.get(name) ?? null;
  }

  async purgeQueue(name: QueueName): Promise<void> {
    this.calls.purgeQueue.push(name);
    this.queueMessagesMap.set(name, []);
  }

  async receiveMessages<T = unknown>(
    name: QueueName,
    maxMessages: number = 10
  ): Promise<T[]> {
    this.calls.receiveMessages.push({ name, maxMessages });
    const messages = this.queueMessagesMap.get(name) ?? [];
    return messages.slice(0, maxMessages) as T[];
  }

  async sendMessage(name: QueueName, body: unknown): Promise<void> {
    this.calls.sendMessage.push({ name, body });
    const messages = this.queueMessagesMap.get(name) ?? [];
    messages.push(body);
    this.queueMessagesMap.set(name, messages);
  }

  async getQueueMetrics(name: QueueName): Promise<{
    status: 'online' | 'offline' | 'error';
    depth: number;
    inFlight: number;
    dlqDepth: number;
  }> {
    this.calls.getQueueMetrics.push(name);
    return this.queueMetricsMap.get(name) ?? {
      status: 'offline',
      depth: 0,
      inFlight: 0,
      dlqDepth: 0,
    };
  }

  now(): Date {
    return this.currentTime;
  }
}
