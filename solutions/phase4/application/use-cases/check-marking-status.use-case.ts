/**
 * CheckMarkingStatus Use Case
 *
 * ✅ SOLUTION - Full implementation with Exponential Backoff
 *
 * Business logic: Check if marking is complete
 *
 * This use case implements the POLLING PATTERN:
 * 1. Check marking progress in database
 * 2. If IN_PROGRESS → Schedule next status check with exponential backoff
 * 3. If COMPLETED → Send completion event
 * 4. If FAILED → Throw error (goes to DLQ)
 */

import type { DatabasePort, QueuePort, Result, StatusCheckRequest } from 'contracts';
import { success, failure } from 'contracts';
import { calculateBackoffDelay } from 'queue-adapter-sqs';

export class CheckMarkingStatusUseCase {
  constructor(
    private readonly database: DatabasePort,
    private readonly queue: QueuePort
  ) {}

  async execute(request: StatusCheckRequest): Promise<Result<void, Error>> {
    // Step 1: Check progress in database
    const result = await this.database.checkMarkingProgress(request.jobId);

    if (!result.success) {
      return result;
    }

    const status = result.data;

    // Step 2: Handle different statuses
    if (status.status === 'IN_PROGRESS') {
      // Calculate delay with exponential backoff
      // First attempt: 5s, second: 10s, third: 20s, ..., max: 300s (5 min)
      const delay = calculateBackoffDelay(request.attempt);

      // Log structured data (IMPORTANT for Phase 4 Log Quest!)
      console.log(JSON.stringify({
        event: 'STATUS_CHECK',
        jobId: request.jobId,
        correlationId: request.correlationId,
        status: status.status,
        attempt: request.attempt,
        nextDelaySeconds: delay,
        rowsProcessed: status.rowsProcessed,
        progressPercent: status.progressPercent,
        timestamp: new Date().toISOString(),
      }));

      // Schedule next check with increased attempt counter
      await this.queue.sendStatusCheck(
        {
          ...request,
          attempt: request.attempt + 1,
        },
        delay
      );

      return success(undefined);
    }

    if (status.status === 'COMPLETED') {
      // Success! Send completion event
      console.log(JSON.stringify({
        event: 'MARKING_COMPLETED',
        jobId: request.jobId,
        correlationId: request.correlationId,
        rowsMarked: status.rowsMarked,
        tableName: request.tableName,
        timestamp: new Date().toISOString(),
      }));

      await this.queue.sendCompletion({
        event: 'MARKING_COMPLETE',
        jobId: request.jobId,
        tableName: request.tableName,
        data: {
          rowsMarked: status.rowsMarked,
          rowsProcessed: status.rowsProcessed,
          correlationId: request.correlationId,
        },
      });

      return success(undefined);
    }

    if (status.status === 'FAILED') {
      // Error! Log and throw
      console.error(JSON.stringify({
        event: 'MARKING_FAILED',
        jobId: request.jobId,
        correlationId: request.correlationId,
        tableName: request.tableName,
        timestamp: new Date().toISOString(),
      }));

      return failure(new Error(`Marking failed for job ${request.jobId}`));
    }

    // PENDING status - just log and schedule next check (same as IN_PROGRESS)
    const delay = calculateBackoffDelay(request.attempt);

    console.log(JSON.stringify({
      event: 'STATUS_CHECK',
      jobId: request.jobId,
      correlationId: request.correlationId,
      status: 'PENDING',
      attempt: request.attempt,
      nextDelaySeconds: delay,
      timestamp: new Date().toISOString(),
    }));

    await this.queue.sendStatusCheck(
      {
        ...request,
        attempt: request.attempt + 1,
      },
      delay
    );

    return success(undefined);
  }
}

/*
 * ✅ LEARNING CHECKPOINT
 *
 * After implementing this, you should understand:
 * 1. Polling Pattern (check status → schedule next check)
 * 2. Exponential Backoff (delay increases: 5s, 10s, 20s, 40s, ...)
 * 3. Structured Logging (for observability and Log Quest!)
 * 4. Event-Driven completion (send completion event to trigger next phase)
 * 5. Error Handling (FAILED status throws error → DLQ)
 *
 * 💡 Log Quest in Phase 4:
 * Use CloudWatch Logs Insights to track:
 * - correlationId across multiple status checks
 * - attempt counter increasing (1, 2, 3, ...)
 * - nextDelaySeconds doubling (5, 10, 20, 40, ...)
 * - Observe exponential backoff in action!
 */
