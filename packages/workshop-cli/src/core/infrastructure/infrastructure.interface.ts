/**
 * Infrastructure Interface
 * Abstracts AWS/Infrastructure operations for testability
 */
export interface IInfrastructure {
  /**
   * Check if a Lambda function exists
   */
  lambdaExists(functionName: string): Promise<boolean>;

  /**
   * Invoke a Lambda function
   */
  invokeLambda<T = unknown>(
    functionName: string,
    payload?: Record<string, unknown>
  ): Promise<{ success: boolean; result?: T; error?: string }>;

  /**
   * Get queue URL by queue name
   */
  getQueueUrl(queueName: string): Promise<string | null>;

  /**
   * Receive messages from a queue
   */
  receiveMessages<T = unknown>(queueUrl: string, maxMessages?: number): Promise<T[]>;

  /**
   * Purge all messages from a queue
   */
  purgeQueue(queueUrl: string): Promise<void>;

  /**
   * Send a message to a queue
   */
  sendMessage(queueUrl: string, body: Record<string, unknown>): Promise<void>;

  /**
   * Get queue metrics including DLQ depth
   */
  getQueueMetrics(queueName: string): Promise<{
    status: 'online' | 'offline' | 'error';
    depth: number;
    inFlight: number;
    dlqDepth: number;
    /** Messages die mit DelaySeconds warten (Backoff!) - optional für Mocks */
    delayed?: number;
  }>;
}
