import { IInfrastructure } from './infrastructure.interface.js';

/**
 * Mock Infrastructure Implementation
 * For testing validators without real AWS calls
 */
export class MockInfrastructure implements IInfrastructure {
  private lambdaResponses = new Map<string, { success: boolean; result?: unknown; error?: string }>();
  private lambdaExistence = new Map<string, boolean>();
  private queueUrls = new Map<string, string>();
  private queueMessages = new Map<string, unknown[]>();
  private queueMetrics = new Map<string, { status: 'online' | 'offline' | 'error'; depth: number; inFlight: number; dlqDepth: number }>();

  /**
   * Configure mock Lambda existence
   */
  setLambdaExists(functionName: string, exists: boolean): void {
    this.lambdaExistence.set(functionName, exists);
  }

  /**
   * Configure mock Lambda response
   */
  setLambdaResponse(
    functionName: string,
    response: { success: boolean; result?: unknown; error?: string }
  ): void {
    this.lambdaResponses.set(functionName, response);
  }

  /**
   * Configure mock queue URL
   */
  setQueueUrl(queueName: string, url: string): void {
    this.queueUrls.set(queueName, url);
  }

  /**
   * Configure mock queue messages
   */
  setQueueMessages(queueUrl: string, messages: unknown[]): void {
    this.queueMessages.set(queueUrl, messages);
  }

  /**
   * Configure mock queue metrics
   */
  setQueueMetrics(
    queueName: string,
    metrics: { status: 'online' | 'offline' | 'error'; depth: number; inFlight: number; dlqDepth: number }
  ): void {
    this.queueMetrics.set(queueName, metrics);
  }

  async lambdaExists(functionName: string): Promise<boolean> {
    return this.lambdaExistence.get(functionName) ?? false;
  }

  async invokeLambda<T = unknown>(
    functionName: string,
    _payload?: Record<string, unknown>
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    const response = this.lambdaResponses.get(functionName);
    if (!response) {
      return {
        success: false,
        error: `Mock not configured for Lambda: ${functionName}`,
      };
    }
    return response as { success: boolean; result?: T; error?: string };
  }

  async getQueueUrl(queueName: string): Promise<string | null> {
    return this.queueUrls.get(queueName) || null;
  }

  async receiveMessages<T = unknown>(queueUrl: string, maxMessages = 10): Promise<T[]> {
    const messages = this.queueMessages.get(queueUrl) || [];
    return messages.slice(0, maxMessages) as T[];
  }

  async purgeQueue(queueUrl: string): Promise<void> {
    this.queueMessages.set(queueUrl, []);
  }

  async sendMessage(queueUrl: string, body: Record<string, unknown>): Promise<void> {
    const messages = this.queueMessages.get(queueUrl) || [];
    messages.push(body);
    this.queueMessages.set(queueUrl, messages);
  }

  async getQueueMetrics(queueName: string): Promise<{
    status: 'online' | 'offline' | 'error';
    depth: number;
    inFlight: number;
    dlqDepth: number;
  }> {
    const metrics = this.queueMetrics.get(queueName);
    if (!metrics) {
      return { status: 'offline', depth: 0, inFlight: 0, dlqDepth: 0 };
    }
    return metrics;
  }
}
