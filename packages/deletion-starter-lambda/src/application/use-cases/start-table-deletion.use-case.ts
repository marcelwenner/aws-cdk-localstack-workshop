/**
 * StartTableDeletion Use Case
 *
 * ✅ PRE-BUILT - This use case is already implemented
 *
 * Business logic: Start the deletion phase for a table
 * Creates a deletion task in the database
 *
 * 💡 Vergleiche mit MarkingStarter - fast identisch!
 *    Nur der DB-Aufruf ist anders (startTableDeletion statt startTableMarking)
 */

import type { DatabasePort, Result } from 'contracts';

export interface StartDeletionRequest {
  jobId: string;
  tableName: string;
}

export class StartTableDeletionUseCase {
  constructor(private readonly database: DatabasePort) {}

  async execute(request: StartDeletionRequest): Promise<Result<{ taskId: number }, Error>> {
    // Log structured data
    console.log(JSON.stringify({
      event: 'STARTING_TABLE_DELETION',
      jobId: request.jobId,
      tableName: request.tableName,
      timestamp: new Date().toISOString(),
    }));

    // Call database to create deletion task
    const result = await this.database.startTableDeletion(
      request.jobId,
      request.tableName
    );

    if (!result.success) {
      console.error(JSON.stringify({
        event: 'DELETION_START_FAILED',
        error: result.error.message,
        jobId: request.jobId,
      }));
      return result;
    }

    console.log(JSON.stringify({
      event: 'DELETION_STARTED',
      taskId: result.data.taskId,
      jobId: request.jobId,
    }));

    return result;
  }
}
