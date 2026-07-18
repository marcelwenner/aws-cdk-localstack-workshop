/**
 * AWS Infrastructure Port Implementation
 *
 * Implements InfrastructurePort using AWS SDK.
 * This adapter uses typed LambdaName/QueueName instead of raw strings.
 */

import {
  LambdaClient,
  InvokeCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';
import {
  SQSClient,
  ReceiveMessageCommand,
  PurgeQueueCommand,
  GetQueueUrlCommand,
  GetQueueAttributesCommand,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';
import pg from 'pg';

import type { LambdaName, QueueName } from '../../shared/constants.js';
import { workshopConfig } from '../config/workshop.config.js';
import type {
  InfrastructurePort,
  LambdaInvocationResult,
} from './infrastructure.port.js';
import { mapLambdaError } from './infrastructure.port.js';

// =============================================================================
// AWS Infrastructure Port Implementation
// =============================================================================

export class AwsInfrastructurePort implements InfrastructurePort {
  private lambdaClient: LambdaClient;
  private sqsClient: SQSClient;

  constructor() {
    this.lambdaClient = new LambdaClient({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    this.sqsClient = new SQSClient({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });
  }

  // ---------------------------------------------------------------------------
  // Lambda Operations
  // ---------------------------------------------------------------------------

  async lambdaExists(name: LambdaName): Promise<boolean> {
    try {
      const command = new GetFunctionCommand({
        FunctionName: name,
      });
      await this.lambdaClient.send(command);
      return true;
    } catch (error) {
      // ResourceNotFoundException means Lambda doesn't exist
      if (
        error instanceof Error &&
        (error.name === 'ResourceNotFoundException' ||
          error.message.includes('Function not found'))
      ) {
        return false;
      }
      // Other errors (connection, etc.) - assume not exists for safety
      console.debug(`[AwsInfrastructurePort] lambdaExists error: ${error}`);
      return false;
    }
  }

  async getLambdaEnv(name: LambdaName): Promise<Record<string, string>> {
    try {
      const command = new GetFunctionConfigurationCommand({
        FunctionName: name,
      });
      const response = await this.lambdaClient.send(command);
      return response.Environment?.Variables || {};
    } catch (error) {
      console.debug(`[AwsInfrastructurePort] getLambdaEnv error: ${error}`);
      return {};
    }
  }

  async invokeLambda<T = unknown>(
    name: LambdaName,
    payload: unknown
  ): Promise<LambdaInvocationResult<T>> {
    try {
      const command = new InvokeCommand({
        FunctionName: name,
        Payload: payload ? Buffer.from(JSON.stringify(payload)) : undefined,
      });

      const response = await this.lambdaClient.send(command);

      // Check for Lambda-level errors (FunctionError)
      if (response.FunctionError) {
        const errorPayload = response.Payload
          ? new TextDecoder().decode(response.Payload)
          : 'Unknown error';

        const { errorType, errorMessage } = mapLambdaError(errorPayload);
        return {
          success: false,
          statusCode: response.StatusCode,
          errorMessage,
          errorType,
        };
      }

      // Parse response payload
      const rawResult = response.Payload
        ? JSON.parse(new TextDecoder().decode(response.Payload))
        : null;

      // Handle API Gateway style responses: { statusCode, body }
      let result = rawResult;
      if (
        rawResult &&
        typeof rawResult === 'object' &&
        'statusCode' in rawResult &&
        'body' in rawResult
      ) {
        // Check if Lambda returned an error status
        if (rawResult.statusCode >= 400) {
          const errorBody =
            typeof rawResult.body === 'string'
              ? JSON.parse(rawResult.body)
              : rawResult.body;

          const { errorType, errorMessage } = mapLambdaError(
            errorBody?.error || `Lambda returned status ${rawResult.statusCode}`
          );

          return {
            success: false,
            statusCode: rawResult.statusCode,
            errorMessage,
            errorType,
          };
        }

        // Parse the body string
        result =
          typeof rawResult.body === 'string'
            ? JSON.parse(rawResult.body)
            : rawResult.body;
      }

      return {
        success: true,
        statusCode: response.StatusCode,
        payload: result as T,
      };
    } catch (error) {
      const { errorType, errorMessage } = mapLambdaError(error);
      return {
        success: false,
        errorMessage,
        errorType,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Database Operations
  // ---------------------------------------------------------------------------

  async queryDb<T = unknown>(query: string, params?: unknown[]): Promise<T[]> {
    const client = new pg.Client({
      host: workshopConfig.db.postgres.host,
      port: workshopConfig.db.postgres.port,
      database: workshopConfig.db.postgres.database,
      user: workshopConfig.db.postgres.user,
      password: workshopConfig.db.postgres.password,
    });

    try {
      await client.connect();
      const result = await client.query(query, params);
      return result.rows as T[];
    } finally {
      await client.end();
    }
  }

  // ---------------------------------------------------------------------------
  // SQS Operations
  // ---------------------------------------------------------------------------

  async getQueueUrl(name: QueueName): Promise<string | null> {
    try {
      const command = new GetQueueUrlCommand({
        QueueName: name,
      });
      const response = await this.sqsClient.send(command);
      return response.QueueUrl || null;
    } catch (error) {
      // Queue doesn't exist - expected in some scenarios
      if (
        error instanceof Error &&
        !error.name.includes('QueueDoesNotExist')
      ) {
        console.debug(`[AwsInfrastructurePort] getQueueUrl error: ${error}`);
      }
      return null;
    }
  }

  async purgeQueue(name: QueueName): Promise<void> {
    const queueUrl = await this.getQueueUrl(name);
    if (!queueUrl) return;

    try {
      const command = new PurgeQueueCommand({
        QueueUrl: queueUrl,
      });
      await this.sqsClient.send(command);
    } catch (error) {
      // Purge can fail if queue was recently purged (60s cooldown)
      console.debug(`[AwsInfrastructurePort] purgeQueue error: ${error}`);
    }
  }

  async receiveMessages<T = unknown>(
    name: QueueName,
    maxMessages: number = 10
  ): Promise<T[]> {
    const queueUrl = await this.getQueueUrl(name);
    if (!queueUrl) return [];

    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: workshopConfig.timeouts.sqsWaitTime,
      });

      const response = await this.sqsClient.send(command);
      return (response.Messages?.map((msg) =>
        JSON.parse(msg.Body || '{}')
      ) || []) as T[];
    } catch (error) {
      console.debug(`[AwsInfrastructurePort] receiveMessages error: ${error}`);
      return [];
    }
  }

  async sendMessage(name: QueueName, body: unknown): Promise<void> {
    const queueUrl = await this.getQueueUrl(name);
    if (!queueUrl) {
      throw new Error(`Queue ${name} not found`);
    }

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(body),
    });
    await this.sqsClient.send(command);
  }

  async getQueueMetrics(name: QueueName): Promise<{
    status: 'online' | 'offline' | 'error';
    depth: number;
    inFlight: number;
    dlqDepth: number;
  }> {
    try {
      const queueUrl = await this.getQueueUrl(name);
      if (!queueUrl) {
        return { status: 'offline', depth: 0, inFlight: 0, dlqDepth: 0 };
      }

      const command = new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
        ],
      });
      const response = await this.sqsClient.send(command);

      const depth = parseInt(
        response.Attributes?.ApproximateNumberOfMessages || '0',
        10
      );
      const inFlight = parseInt(
        response.Attributes?.ApproximateNumberOfMessagesNotVisible || '0',
        10
      );

      // Try to get DLQ metrics
      let dlqDepth = 0;
      const dlqName = `${name}-dlq` as QueueName;
      const dlqUrl = await this.getQueueUrl(dlqName);
      if (dlqUrl) {
        const dlqCommand = new GetQueueAttributesCommand({
          QueueUrl: dlqUrl,
          AttributeNames: ['ApproximateNumberOfMessages'],
        });
        const dlqResponse = await this.sqsClient.send(dlqCommand);
        dlqDepth = parseInt(
          dlqResponse.Attributes?.ApproximateNumberOfMessages || '0',
          10
        );
      }

      return { status: 'online', depth, inFlight, dlqDepth };
    } catch (error) {
      if (error instanceof Error && error.name === 'QueueDoesNotExist') {
        return { status: 'offline', depth: 0, inFlight: 0, dlqDepth: 0 };
      }
      return { status: 'error', depth: 0, inFlight: 0, dlqDepth: 0 };
    }
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  now(): Date {
    return new Date();
  }
}
