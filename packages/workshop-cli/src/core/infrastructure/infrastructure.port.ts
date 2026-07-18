/**
 * Infrastructure Port
 *
 * Clean interface for all infrastructure operations.
 * Validators only know this port, never AWS SDK directly.
 *
 * This enables:
 * - Unit testing with mocks
 * - Swapping LocalStack ↔ Real AWS
 * - Type-safe error handling
 */

import type { LambdaName, QueueName } from '../../shared/constants.js';

// =============================================================================
// Lambda Invocation Result
// =============================================================================

/** Error types for structured error handling (no string matching!) */
export type LambdaErrorType =
  | 'NOT_FOUND'        // Lambda doesn't exist
  | 'NOT_IMPLEMENTED'  // Handler throws NOT_IMPLEMENTED
  | 'RUNTIME_ERROR'    // Unhandled exception in Lambda
  | 'TIMEOUT'          // Lambda exceeded timeout
  | 'PERMISSION';      // IAM permission denied

export interface LambdaInvocationResult<T = unknown> {
  success: boolean;
  statusCode?: number;
  payload?: T;
  errorMessage?: string;
  errorType?: LambdaErrorType;
}

// =============================================================================
// Infrastructure Port Interface
// =============================================================================

export interface InfrastructurePort {
  // ---------------------------------------------------------------------------
  // Lambda Operations
  // ---------------------------------------------------------------------------

  /**
   * Check if a Lambda function exists (is deployed)
   */
  lambdaExists(name: LambdaName): Promise<boolean>;

  /**
   * Get Lambda environment variables
   */
  getLambdaEnv(name: LambdaName): Promise<Record<string, string>>;

  /**
   * Invoke a Lambda function with structured result
   */
  invokeLambda<T = unknown>(
    name: LambdaName,
    payload: unknown
  ): Promise<LambdaInvocationResult<T>>;

  // ---------------------------------------------------------------------------
  // Database Operations
  // ---------------------------------------------------------------------------

  /**
   * Execute a database query
   */
  queryDb<T = unknown>(query: string, params?: unknown[]): Promise<T[]>;

  // ---------------------------------------------------------------------------
  // SQS Operations
  // ---------------------------------------------------------------------------

  /**
   * Get queue URL by name (returns null if not found)
   */
  getQueueUrl(name: QueueName): Promise<string | null>;

  /**
   * Purge all messages from a queue
   */
  purgeQueue(name: QueueName): Promise<void>;

  /**
   * Receive messages from a queue
   */
  receiveMessages<T = unknown>(name: QueueName, maxMessages?: number): Promise<T[]>;

  /**
   * Send a message to a queue
   */
  sendMessage(name: QueueName, body: unknown): Promise<void>;

  /**
   * Get queue metrics
   */
  getQueueMetrics(name: QueueName): Promise<{
    status: 'online' | 'offline' | 'error';
    depth: number;
    inFlight: number;
    dlqDepth: number;
  }>;

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Get current timestamp (useful for testing with fixed times)
   */
  now(): Date;
}

// =============================================================================
// Helper: Map AWS errors to LambdaErrorType
// =============================================================================

/**
 * Maps AWS Lambda errors to our typed error enum.
 * Use this in the AWS implementation to avoid string matching in validators.
 */
export function mapLambdaError(error: unknown): {
  errorType: LambdaErrorType;
  errorMessage: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  const errorString = message.toLowerCase();

  // Check for specific error patterns
  if (
    errorString.includes('function not found') ||
    errorString.includes('resourcenotfoundexception') ||
    errorString.includes('does not exist')
  ) {
    return { errorType: 'NOT_FOUND', errorMessage: message };
  }

  if (errorString.includes('not_implemented')) {
    return { errorType: 'NOT_IMPLEMENTED', errorMessage: message };
  }

  if (
    errorString.includes('task timed out') ||
    errorString.includes('timeout')
  ) {
    return { errorType: 'TIMEOUT', errorMessage: message };
  }

  if (
    errorString.includes('accessdenied') ||
    errorString.includes('not authorized')
  ) {
    return { errorType: 'PERMISSION', errorMessage: message };
  }

  // Default to runtime error
  return { errorType: 'RUNTIME_ERROR', errorMessage: message };
}
