/**
 * Ports (Interfaces) for Hexagonal Architecture
 *
 * Ports define what our application needs from the outside world.
 * Adapters (implementations) live in separate packages.
 */

import type { Result } from './result.js';

// ============================================================================
// Database Port
// ============================================================================

export interface TableInfo {
  tableName: string;
  schemaName: string;
  cutoffDays: number;
}

export interface MarkingTask {
  taskId: number;
}

export interface TaskExecutionResult {
  rowsProcessed: number;
  hasMoreWork: boolean;
}

export interface ProcessStatus {
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  rowsProcessed: number;
  rowsMarked: number;
  progressPercent: number;
}

export interface DatabasePort {
  // Phase 1: Get table list
  getTablesToProcess(): Promise<Result<TableInfo[], Error>>;

  // Phase 2: Start marking
  startTableMarking(
    jobId: string,
    tableName: string,
    cutoffDate: string
  ): Promise<Result<MarkingTask, Error>>;

  // Phase 3: Execute marking tasks
  executeNextMarkingTask(taskId: number): Promise<Result<TaskExecutionResult, Error>>;

  // Phase 4: Check progress
  checkMarkingProgress(jobId: string): Promise<Result<ProcessStatus, Error>>;

  // Phase 5: Deletion
  startTableDeletion(jobId: string, tableName: string): Promise<Result<{ taskId: number }, Error>>;
  executeNextDeletionTask(taskId: number): Promise<Result<TaskExecutionResult, Error>>;
}

// ============================================================================
// Queue Port
// ============================================================================

export interface StatusCheckRequest {
  jobId: string;
  tableName: string;
  attempt: number;
  correlationId: string;
}

export interface TaskExecutionRequest {
  taskId: number;
  taskType: 'marking' | 'deletion';
  jobId: string;
  tableName: string;
  correlationId: string;
}

export interface CompletionEvent {
  event: 'MARKING_COMPLETE' | 'DELETION_COMPLETE';
  jobId: string;
  tableName: string;
  data: Record<string, any>;
}

export interface QueuePort {
  sendMessage(queueUrl: string, payload: object): Promise<Result<void, Error>>;
  sendDelayedMessage(
    queueUrl: string,
    payload: object,
    delaySeconds: number
  ): Promise<Result<void, Error>>;
  sendStatusCheck(payload: StatusCheckRequest, delaySeconds: number): Promise<Result<void, Error>>;
  sendCompletion(payload: CompletionEvent): Promise<Result<void, Error>>;
}
