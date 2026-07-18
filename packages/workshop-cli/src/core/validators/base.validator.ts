import { IInfrastructure } from '../infrastructure/infrastructure.interface.js';
import { AwsInfrastructure } from '../infrastructure/aws-infrastructure.js';

/**
 * Base Validator Class
 * Provides common utilities for testing Lambda functions and SQS queues
 *
 * Uses Dependency Injection for infrastructure layer to improve testability
 */
export abstract class BaseValidator {
  protected infrastructure: IInfrastructure;

  constructor(infrastructure?: IInfrastructure) {
    // Default to AWS implementation if not provided (backward compatibility)
    this.infrastructure = infrastructure || new AwsInfrastructure();
  }

  /**
   * Check if a Lambda function exists (is deployed)
   */
  protected async lambdaExists(functionName: string): Promise<boolean> {
    return this.infrastructure.lambdaExists(functionName);
  }

  /**
   * Invoke a Lambda function and return the parsed result
   */
  protected async invokeLambda<T = unknown>(
    functionName: string,
    payload?: Record<string, unknown>
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    return this.infrastructure.invokeLambda<T>(functionName, payload);
  }

  /**
   * Get queue URL by queue name
   */
  protected async getQueueUrl(queueName: string): Promise<string | null> {
    return this.infrastructure.getQueueUrl(queueName);
  }

  /**
   * Receive messages from a queue
   */
  protected async receiveMessages<T = unknown>(
    queueUrl: string,
    maxMessages = 10
  ): Promise<T[]> {
    return this.infrastructure.receiveMessages<T>(queueUrl, maxMessages);
  }

  /**
   * Purge all messages from a queue
   */
  protected async purgeQueue(queueUrl: string): Promise<void> {
    return this.infrastructure.purgeQueue(queueUrl);
  }

  /**
   * Get queue metrics including DLQ depth
   */
  protected async getQueueMetrics(queueName: string): Promise<{
    status: 'online' | 'offline' | 'error';
    depth: number;
    inFlight: number;
    dlqDepth: number;
  }> {
    return this.infrastructure.getQueueMetrics(queueName);
  }

  abstract validate(): Promise<{ passed: boolean; hints?: string[] }>;
}
