import { LambdaClient, InvokeCommand, GetFunctionCommand } from '@aws-sdk/client-lambda';
import { SQSClient, ReceiveMessageCommand, PurgeQueueCommand, GetQueueUrlCommand, GetQueueAttributesCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { workshopConfig } from '../config/workshop.config.js';
import { IInfrastructure } from './infrastructure.interface.js';

/**
 * AWS Infrastructure Implementation
 * Production implementation using real AWS SDK clients
 */
export class AwsInfrastructure implements IInfrastructure {
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

  async lambdaExists(functionName: string): Promise<boolean> {
    try {
      const command = new GetFunctionCommand({
        FunctionName: functionName,
      });
      await this.lambdaClient.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async invokeLambda<T = unknown>(
    functionName: string,
    payload?: Record<string, unknown>
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    try {
      const command = new InvokeCommand({
        FunctionName: functionName,
        Payload: payload ? Buffer.from(JSON.stringify(payload)) : undefined,
      });

      const response = await this.lambdaClient.send(command);

      if (response.FunctionError) {
        return {
          success: false,
          error: response.Payload ? new TextDecoder().decode(response.Payload) : 'Unknown error',
        };
      }

      const rawResult = response.Payload
        ? JSON.parse(new TextDecoder().decode(response.Payload))
        : null;

      // Handle API Gateway style responses: { statusCode, body }
      // Parse the body string to get the actual result
      let result = rawResult;
      if (rawResult && typeof rawResult === 'object' && 'statusCode' in rawResult && 'body' in rawResult) {
        // Check if Lambda returned an error status
        if (rawResult.statusCode >= 400) {
          const errorBody = typeof rawResult.body === 'string'
            ? JSON.parse(rawResult.body)
            : rawResult.body;
          return {
            success: false,
            error: errorBody?.error || `Lambda returned status ${rawResult.statusCode}`,
          };
        }
        // Parse the body string
        result = typeof rawResult.body === 'string'
          ? JSON.parse(rawResult.body)
          : rawResult.body;
      }

      return {
        success: true,
        result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getQueueUrl(queueName: string): Promise<string | null> {
    try {
      const command = new GetQueueUrlCommand({
        QueueName: queueName,
      });
      const response = await this.sqsClient.send(command);
      return response.QueueUrl || null;
    } catch (error) {
      // Queue doesn't exist or connection failed - expected in some scenarios
      if (error instanceof Error && !error.name.includes('QueueDoesNotExist')) {
        console.debug(`[Infrastructure] getQueueUrl failed: ${error.message}`);
      }
      return null;
    }
  }

  async receiveMessages<T = unknown>(queueUrl: string, maxMessages = 10): Promise<T[]> {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: workshopConfig.timeouts.sqsWaitTime,
      });

      const response = await this.sqsClient.send(command);
      return (response.Messages?.map(msg => JSON.parse(msg.Body || '{}')) || []) as T[];
    } catch (error) {
      // Connection or queue errors - return empty array but log for debugging
      if (error instanceof Error) {
        console.debug(`[Infrastructure] receiveMessages failed: ${error.message}`);
      }
      return [];
    }
  }

  async purgeQueue(queueUrl: string): Promise<void> {
    try {
      const command = new PurgeQueueCommand({
        QueueUrl: queueUrl,
      });
      await this.sqsClient.send(command);
    } catch (error) {
      // Purge can fail if queue was recently purged (60s cooldown) - log but don't throw
      if (error instanceof Error) {
        console.debug(`[Infrastructure] purgeQueue failed: ${error.message}`);
      }
    }
  }

  async sendMessage(queueUrl: string, body: Record<string, unknown>): Promise<void> {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(body),
    });
    await this.sqsClient.send(command);
  }

  /**
   * Get queue metrics for dashboard visualization
   * Returns queue depth and in-flight messages count
   */
  async getQueueMetrics(queueName: string): Promise<{
    status: 'online' | 'offline' | 'error';
    depth: number;
    inFlight: number;
    dlqDepth: number;
    delayed: number;
  }> {
    try {
      // Get main queue URL
      const queueUrl = await this.getQueueUrl(queueName);
      if (!queueUrl) {
        return { status: 'offline', depth: 0, inFlight: 0, dlqDepth: 0, delayed: 0 };
      }

      // Get queue attributes
      const command = new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
          'ApproximateNumberOfMessagesDelayed',
        ],
      });
      const response = await this.sqsClient.send(command);

      const depth = parseInt(response.Attributes?.ApproximateNumberOfMessages || '0', 10);
      const inFlight = parseInt(response.Attributes?.ApproximateNumberOfMessagesNotVisible || '0', 10);
      const delayed = parseInt(response.Attributes?.ApproximateNumberOfMessagesDelayed || '0', 10);

      // Try to get DLQ metrics (skip if this queue IS a DLQ - there is no dlq-dlq,
      // and the lookup would spam a 400 QueueDoesNotExist into die LocalStack-Logs)
      let dlqDepth = 0;
      const dlqUrl = queueName.endsWith('-dlq') ? null : await this.getQueueUrl(`${queueName}-dlq`);
      if (dlqUrl) {
        const dlqCommand = new GetQueueAttributesCommand({
          QueueUrl: dlqUrl,
          AttributeNames: ['ApproximateNumberOfMessages'],
        });
        const dlqResponse = await this.sqsClient.send(dlqCommand);
        dlqDepth = parseInt(dlqResponse.Attributes?.ApproximateNumberOfMessages || '0', 10);
      }

      return { status: 'online', depth, inFlight, dlqDepth, delayed };
    } catch (error) {
      // Check if it's a "queue does not exist" error
      if (error instanceof Error && error.name === 'QueueDoesNotExist') {
        return { status: 'offline', depth: 0, inFlight: 0, dlqDepth: 0, delayed: 0 };
      }
      return { status: 'error', depth: 0, inFlight: 0, dlqDepth: 0, delayed: 0 };
    }
  }
}
