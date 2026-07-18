/**
 * ExecuteMarkingTask Use Case
 *
 * ✅ SOLUTION - Musterlösung Phase 3
 *
 * Business logic: Execute one batch of marking work
 * Returns whether there's more work to do (for self-triggering)
 */

import type { DatabasePort, Result, TaskExecutionResult } from 'contracts';

export class ExecuteMarkingTaskUseCase {
  constructor(private readonly database: DatabasePort) {}

  async execute(taskId: number, correlationId?: string): Promise<Result<TaskExecutionResult, Error>> {
    console.log(JSON.stringify({
      event: 'EXECUTING_MARKING_TASK',
      taskId,
      correlationId,
      timestamp: new Date().toISOString(),
    }));

    // Execute next batch (1000 rows at a time)
    const result = await this.database.executeNextMarkingTask(taskId);

    if (!result.success) {
      return result;
    }

    console.log(JSON.stringify({
      event: 'MARKING_BATCH_COMPLETE',
      taskId,
      correlationId,
      rowsProcessed: result.data.rowsProcessed,
      hasMoreWork: result.data.hasMoreWork,
    }));

    return result;
  }
}
