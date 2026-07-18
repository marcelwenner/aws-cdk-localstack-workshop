/**
 * MarkingStarter Lambda Handler
 *
 * ✅ SOLUTION - Full implementation
 *
 * This Lambda receives a request to start marking tables.
 * It implements the FAN-OUT PATTERN:
 * 1. For each table, create a marking task in DB
 * 2. Send a message to lts-worker-queue for parallel processing
 */

import type { Context } from 'aws-lambda';
import { buildContainer } from '../infrastructure/container.js';
import { isSuccess } from 'contracts';

// Container cache (cold start optimization)
let container: Awaited<ReturnType<typeof buildContainer>> | null = null;

/**
 * Event structure (what this Lambda receives)
 * Supports two formats:
 * 1. Workshop CLI format: { action: 'startMarking', tableCount: number }
 * 2. Full format: { jobId: string, tables: [...] }
 */
export interface MarkingStarterEvent {
  // Workshop CLI format
  action?: 'startMarking';
  tableCount?: number;
  // Full format
  jobId?: string;
  tables?: Array<{
    tableName: string;
    cutoffDate: string;
  }>;
}

/**
 * Response structure (what this Lambda returns)
 */
export interface MarkingStarterResponse {
  tasksCreated: number;
  taskIds: number[];
}

/**
 * Generate mock tables for workshop demo
 */
function generateMockTables(count: number): Array<{ tableName: string; cutoffDate: string }> {
  const tables = [];
  for (let i = 1; i <= count; i++) {
    tables.push({
      tableName: `demo_table_${i}`,
      cutoffDate: new Date().toISOString().split('T')[0],
    });
  }
  return tables;
}

/**
 * Lambda Handler
 */
export const handler = async (
  event: MarkingStarterEvent,
  context: Context
): Promise<MarkingStarterResponse> => {
  const correlationId = context.awsRequestId;

  // Normalize event - support both Workshop CLI format and full format
  let jobId: string;
  let tables: Array<{ tableName: string; cutoffDate: string }>;

  if (event.action === 'startMarking' && event.tableCount) {
    // Workshop CLI format - generate mock data
    jobId = crypto.randomUUID();
    tables = generateMockTables(event.tableCount);
  } else if (event.jobId && event.tables) {
    // Full format
    jobId = event.jobId;
    tables = event.tables;
  } else {
    throw new Error('Invalid event format. Expected { action: "startMarking", tableCount: N } or { jobId, tables }');
  }

  // Log the invocation (structured logging)
  console.log(JSON.stringify({
    event: 'LAMBDA_INVOKED',
    lambdaName: 'MarkingStarterLambda',
    correlationId,
    jobId,
    tablesCount: tables.length,
    timestamp: new Date().toISOString(),
  }));

  try {
    // Step 1: Build container (only on cold start)
    if (!container) {
      console.log(JSON.stringify({ event: 'COLD_START' }));
      container = await buildContainer();
    }

    const taskIds: number[] = [];

    // Step 2: For each table, create marking task and send to SQS
    // This is the FAN-OUT pattern: 1 request → N worker tasks
    for (const table of tables) {
      // Create marking task in database
      const result = await container.startTableMarkingUseCase.execute({
        jobId,
        tableName: table.tableName,
        cutoffDate: table.cutoffDate,
      });

      // Handle errors
      if (!isSuccess(result)) {
        console.error(JSON.stringify({
          event: 'TABLE_MARKING_FAILED',
          error: result.error.message,
          tableName: table.tableName,
          correlationId,
        }));
        throw new Error(`Failed to start marking for table ${table.tableName}: ${result.error.message}`);
      }

      const taskId = result.data.taskId;
      taskIds.push(taskId);

      // Send message to lts-worker-queue for parallel processing
      const queueResult = await container.queue.sendMessage(
        container.workerQueueUrl,
        {
          taskId,
          taskType: 'marking',
          jobId,
          tableName: table.tableName,
          correlationId,
        }
      );

      if (!isSuccess(queueResult)) {
        console.error(JSON.stringify({
          event: 'QUEUE_SEND_FAILED',
          error: queueResult.error.message,
          taskId,
          correlationId,
        }));
        throw new Error(`Failed to send message to queue for task ${taskId}: ${queueResult.error.message}`);
      }

      console.log(JSON.stringify({
        event: 'TASK_CREATED_AND_QUEUED',
        taskId,
        tableName: table.tableName,
        correlationId,
      }));
    }

    // Step 3: Return response
    console.log(JSON.stringify({
      event: 'LAMBDA_SUCCEEDED',
      tasksCreated: taskIds.length,
      correlationId,
    }));

    return {
      tasksCreated: taskIds.length,
      taskIds,
    };

  } catch (error) {
    console.error(JSON.stringify({
      event: 'LAMBDA_ERROR',
      error: error instanceof Error ? error.message : String(error),
      correlationId,
    }));

    throw error;
  }
};

/*
 * ✅ LEARNING CHECKPOINT
 *
 * After implementing this, you should understand:
 * 1. Fan-Out Pattern (1 request → N tasks → parallel processing)
 * 2. SQS Message Structure (taskId, taskType, jobId, tableName, correlationId)
 * 3. Error Handling (throw errors to trigger retry/DLQ)
 * 4. Structured Logging (JSON format for CloudWatch Insights)
 */
