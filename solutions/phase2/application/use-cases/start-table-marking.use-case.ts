/**
 * StartTableMarking Use Case
 *
 * ✅ PRE-BUILT - This use case is already implemented
 *
 * Business logic: Start the marking phase for a table
 * Creates a marking task in the database
 */

import type { DatabasePort, Result, MarkingTask } from 'contracts';

export interface StartMarkingRequest {
  jobId: string;
  tableName: string;
  cutoffDate: string;
}

export class StartTableMarkingUseCase {
  constructor(private readonly database: DatabasePort) {}

  async execute(request: StartMarkingRequest): Promise<Result<MarkingTask, Error>> {
    // Log structured data
    console.log(JSON.stringify({
      event: 'STARTING_TABLE_MARKING',
      jobId: request.jobId,
      tableName: request.tableName,
      cutoffDate: request.cutoffDate,
      timestamp: new Date().toISOString(),
    }));

    // Call database to create marking task
    const result = await this.database.startTableMarking(
      request.jobId,
      request.tableName,
      request.cutoffDate
    );

    if (!result.success) {
      console.error(JSON.stringify({
        event: 'MARKING_START_FAILED',
        error: result.error.message,
        jobId: request.jobId,
      }));
      return result;
    }

    console.log(JSON.stringify({
      event: 'MARKING_STARTED',
      taskId: result.data.taskId,
      jobId: request.jobId,
    }));

    return result;
  }
}
