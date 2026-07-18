/**
 * LtsExecutor Lambda Handler
 *
 * ✅ PRE-BUILT - Der Handler ist fertig, du musst nur die USE CASES implementieren!
 *
 * Dies ist eine WORKER Lambda, getriggert durch SQS Messages.
 * Sie implementiert das "Self-Triggering Worker Pattern":
 *
 * Pattern:
 * 1. Task von SQS empfangen
 * 2. EINEN Batch verarbeiten (z.B. 1000 Zeilen)
 * 3. Prüfen: Gibt es mehr Arbeit?
 *    - JA → Message zurück an SQS senden (self-reschedule)
 *    - NEIN → Fertig, Completion Event senden
 *
 * Warum? Weil Lambda ein 15-Minuten Timeout hat.
 * Für große Tabellen können wir nicht alles in einem Aufruf verarbeiten.
 * Also verarbeiten wir in Batches und triggern uns selbst neu.
 *
 * ⚠️ DEINE AUFGABE (Phase 3):
 * Implementiere die Use Cases in:
 * - src/application/use-cases/execute-marking-task.use-case.ts
 * - src/application/use-cases/execute-deletion-task.use-case.ts
 */

import type { SQSEvent, Context } from 'aws-lambda';
import { buildContainer } from '../infrastructure/container.js';
import { isSuccess } from 'contracts';

let container: Awaited<ReturnType<typeof buildContainer>> | null = null;

/**
 * Task message structure (what SQS sends us)
 */
export interface TaskExecutionRequest {
  taskId: number;
  taskType: 'marking' | 'deletion';
  jobId: string;
  tableName: string;
  correlationId: string;
}

/**
 * Lambda Handler
 *
 * Implements the Worker Pattern with self-triggering
 */
export const handler = async (
  event: SQSEvent,
  context: Context
): Promise<void> => {
  // Step 1: Build container (cold start)
  if (!container) {
    console.log(JSON.stringify({ event: 'COLD_START' }));
    container = await buildContainer();
  }

  // Step 2: Process each message in the batch
  // SQS can send multiple messages, but we configure batchSize=1 for simplicity
  for (const record of event.Records) {
    const message = JSON.parse(record.body) as TaskExecutionRequest;

    // Log the task
    console.log(JSON.stringify({
      event: 'PROCESSING_TASK',
      taskId: message.taskId,
      taskType: message.taskType,
      correlationId: message.correlationId,
      timestamp: new Date().toISOString(),
    }));

    // Step 3: Execute task based on type
    let result;
    if (message.taskType === 'marking') {
      result = await container.executeMarkingTaskUseCase.execute(message.taskId, message.correlationId);
    } else {
      result = await container.executeDeletionTaskUseCase.execute(message.taskId, message.correlationId);
    }

    // Step 4: Handle result
    if (!isSuccess(result)) {
      console.error(JSON.stringify({
        event: 'TASK_EXECUTION_FAILED',
        error: result.error.message,
        taskId: message.taskId,
        correlationId: message.correlationId,
      }));
      // Throw error → goes to DLQ after maxReceiveCount retries
      throw result.error;
    }

    // Step 5: Check if more work exists
    if (result.data.hasMoreWork) {
      // More work → Reschedule self!
      console.log(JSON.stringify({
        event: 'RESCHEDULING_TASK',
        taskId: message.taskId,
        rowsProcessed: result.data.rowsProcessed,
        correlationId: message.correlationId,
      }));

      // Send same task back to worker queue (self-triggering)
      const queueResult = await container.queue.sendToWorkerQueue(message);
      if (!isSuccess(queueResult)) {
        throw queueResult.error;
      }

    } else {
      // Done → Task complete
      console.log(JSON.stringify({
        event: 'TASK_COMPLETE',
        taskId: message.taskId,
        totalRowsProcessed: result.data.rowsProcessed,
        correlationId: message.correlationId,
      }));

      // Completion Event in die completion-queue (Outbox für Downstream-Consumer)
      const completionResult = await container.queue.sendCompletion({
        event: message.taskType === 'marking' ? 'MARKING_COMPLETE' : 'DELETION_COMPLETE',
        jobId: message.jobId,
        tableName: message.tableName,
        data: {
          taskId: message.taskId,
          rowsProcessed: result.data.rowsProcessed,
          correlationId: message.correlationId,
        },
      });
      if (!isSuccess(completionResult)) {
        throw completionResult.error;
      }
    }
  }
};

/*
 * ✅ LEARNING CHECKPOINT
 *
 * After implementing this, you should understand:
 * 1. SQS-Triggered Lambda (SQSEvent structure)
 * 2. Worker Pattern (process batch, check if done, reschedule)
 * 3. Self-Triggering (rescheduleSelf helper)
 * 4. Dead Letter Queue (errors go to DLQ automatically after maxReceiveCount)
 * 5. Batch Processing (1000 rows per invocation to stay within Lambda limits)
 */
