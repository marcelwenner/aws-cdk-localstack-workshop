/**
 * PostgreSQL Database Adapter
 * Simplified for workshop - only direct connection mode
 */

import pkg from 'pg';
const { Pool } = pkg;
import type { Pool as PoolType } from 'pg';
import type {
  DatabasePort,
  Result,
  TableInfo,
  MarkingTask,
  TaskExecutionResult,
  ProcessStatus,
} from 'contracts';
import { success, failure } from 'contracts';

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export class PostgresAdapter implements DatabasePort {
  private pool: PoolType;

  constructor(config: PostgresConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      // Lambda-Regel: EINE Connection pro Container! Container werden
      // eingefroren, nicht beendet - ein max:10-Pool hinterlässt bei 100
      // parallelen Workern bis zu 1000 offene Connections
      // (Postgres-Default-Limit: ~100 → "too many connections").
      max: 1,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async getTablesToProcess(): Promise<Result<TableInfo[], Error>> {
    return this.executeFunction<TableInfo>('lts.get_tables_to_process', {});
  }

  async startTableMarking(
    jobId: string,
    tableName: string,
    cutoffDate: string
  ): Promise<Result<MarkingTask, Error>> {
    const result = await this.executeFunction<{ task_id: number }>(
      'lts.start_table_marking',
      {
        p_job_id: jobId,
        p_table_name: tableName,
        p_cutoff_date: cutoffDate,
      }
    );

    if (!result.success) {
      return result;
    }

    // Map snake_case to camelCase
    return success({
      taskId: result.data[0].task_id,
    });
  }

  async executeNextMarkingTask(taskId: number): Promise<Result<TaskExecutionResult, Error>> {
    const result = await this.executeFunction<{
      rows_processed: number;
      has_more_work: boolean;
    }>('lts.execute_next_marking_task', {
      p_task_id: taskId,
    });

    if (!result.success) {
      return result;
    }

    // Map snake_case to camelCase
    return success({
      rowsProcessed: result.data[0].rows_processed,
      hasMoreWork: result.data[0].has_more_work,
    });
  }

  async checkMarkingProgress(jobId: string): Promise<Result<ProcessStatus, Error>> {
    const result = await this.executeFunction<{
      status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
      rows_processed: number;
      rows_marked: number;
      progress_percent: number;
    }>('lts.check_marking_progress', {
      p_job_id: jobId,
    });

    if (!result.success) {
      return result;
    }

    // Unbekannte jobId: sauberer Fehler statt TypeError auf undefined
    if (!result.data[0]) {
      return failure(new Error(`Job not found: ${jobId} (job does not exist)`));
    }

    // Map snake_case to camelCase
    return success({
      status: result.data[0].status,
      rowsProcessed: result.data[0].rows_processed,
      rowsMarked: result.data[0].rows_marked,
      progressPercent: result.data[0].progress_percent,
    });
  }

  /**
   * Start table deletion
   */
  async startTableDeletion(
    jobId: string,
    tableName: string
  ): Promise<Result<{ taskId: number }, Error>> {
    const result = await this.executeFunction<{ task_id: number }>(
      'lts.start_table_deletion',
      {
        p_job_id: jobId,
        p_table_name: tableName,
      }
    );

    if (!result.success) {
      return result;
    }

    return success({
      taskId: result.data[0].task_id,
    });
  }

  /**
   * Execute next deletion task
   */
  async executeNextDeletionTask(taskId: number): Promise<Result<TaskExecutionResult, Error>> {
    const result = await this.executeFunction<{
      rows_processed: number;
      has_more_work: boolean;
    }>('lts.execute_next_deletion_task', {
      p_task_id: taskId,
    });

    if (!result.success) {
      return result;
    }

    return success({
      rowsProcessed: result.data[0].rows_processed,
      hasMoreWork: result.data[0].has_more_work,
    });
  }

  /**
   * Execute a PostgreSQL function
   *
   * @example
   * await adapter.executeFunction('lts.get_tables_to_process', {})
   * await adapter.executeFunction('lts.start_table_marking', {
   *   p_job_id: '123e4567-e89b-12d3-a456-426614174000',
   *   p_table_name: 'dbo.CustomerLoadFact',
   *   p_cutoff_date: new Date()
   * })
   */
  private async executeFunction<T = any>(
    functionName: string,
    params: Record<string, any> = {}
  ): Promise<Result<T[], Error>> {
    const client = await this.pool.connect();

    try {
      // Build parameter placeholders: $1, $2, $3, ...
      const paramValues = Object.values(params);
      const placeholders = paramValues.map((_, i) => `$${i + 1}`).join(', ');

      // Build query: SELECT * FROM function_name($1, $2, ...)
      const query = `SELECT * FROM ${functionName}(${placeholders})`;

      const result = await client.query(query, paramValues);

      return success(result.rows as T[]);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    } finally {
      client.release();
    }
  }

  /**
   * Execute raw SQL query (for testing/debugging)
   */
  async query<T = any>(
    sql: string,
    params: any[] = []
  ): Promise<Result<T[], Error>> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(sql, params);

      return success(result.rows as T[]);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
