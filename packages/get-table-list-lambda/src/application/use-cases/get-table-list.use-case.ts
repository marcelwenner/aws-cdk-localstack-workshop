/**
 * GetTableList Use Case
 *
 * Business logic: Retrieve list of tables configured for archival
 *
 * This is a SIMPLE use case - just delegates to the database adapter.
 * More complex use cases would have validation, transformation, etc.
 */

import type { DatabasePort, Result, TableInfo } from 'contracts';

export class GetTableListUseCase {
  constructor(private readonly database: DatabasePort) {}

  async execute(correlationId?: string): Promise<Result<TableInfo[], Error>> {
    // Call database adapter to get tables
    const result = await this.database.getTablesToProcess();

    if (!result.success) {
      return result;
    }

    // In a real use case, we might:
    // - Filter tables based on some criteria
    // - Transform the data
    // - Add additional metadata
    // But for this workshop, we just return what we got

    console.log(JSON.stringify({
      event: 'GET_TABLE_LIST',
      tablesFound: result.data.length,
      correlationId,
      timestamp: new Date().toISOString(),
    }));

    return result;
  }
}
