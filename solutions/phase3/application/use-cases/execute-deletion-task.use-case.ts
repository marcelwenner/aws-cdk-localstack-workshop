/**
 * ExecuteDeletionTask Use Case
 *
 * ✅ SOLUTION - Musterlösung Phase 3
 *
 * Business logic: Execute one batch of deletion work
 * Same pattern as marking, but for deletion phase
 */

import type { DatabasePort, Result, TaskExecutionResult } from 'contracts';

export class ExecuteDeletionTaskUseCase {
  constructor(private readonly database: DatabasePort) {}

  async execute(taskId: number, correlationId?: string): Promise<Result<TaskExecutionResult, Error>> {
    console.log(JSON.stringify({
      event: 'EXECUTING_DELETION_TASK',
      taskId,
      correlationId,
      timestamp: new Date().toISOString(),
    }));

    // Execute next batch
    const result = await this.database.executeNextDeletionTask(taskId);

    if (!result.success) {
      return result;
    }

    console.log(JSON.stringify({
      event: 'DELETION_BATCH_COMPLETE',
      taskId,
      correlationId,
      rowsProcessed: result.data.rowsProcessed,
      hasMoreWork: result.data.hasMoreWork,
    }));

    return result;
  }
}
