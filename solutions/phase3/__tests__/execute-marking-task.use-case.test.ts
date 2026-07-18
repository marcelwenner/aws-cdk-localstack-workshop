/**
 * Unit Test - ExecuteMarkingTaskUseCase
 *
 * LÖSUNG - Vollständig implementiert
 *
 * Lernziel: Worker-Pattern UseCase testen
 */
import { describe, it, expect } from 'vitest';
import { ExecuteMarkingTaskUseCase } from '../application/use-cases/execute-marking-task.use-case.js';
import type { DatabasePort } from 'contracts';

/**
 * Mock-Adapter mit konfigurierbarem Verhalten
 */
const createMockDatabase = (options?: {
  rowsProcessed?: number;
  hasMoreWork?: boolean;
}): DatabasePort & { calls: Array<{ method: string; args: any[] }> } => ({
  calls: [],

  async executeNextMarkingTask(taskId: number) {
    this.calls.push({ method: 'executeNextMarkingTask', args: [taskId] });
    return {
      success: true as const,
      data: {
        rowsProcessed: options?.rowsProcessed ?? 100,
        hasMoreWork: options?.hasMoreWork ?? false,
      },
    };
  },

  // Stub-Methoden
  async getTablesToProcess() {
    return { success: true as const, data: [] };
  },
  async startTableMarking() {
    return { success: true as const, data: { taskId: 0 } };
  },
  async checkMarkingProgress() {
    return { success: true as const, data: { status: 'PENDING' as const, rowsProcessed: 0, rowsMarked: 0, progressPercent: 0 } };
  },
  async startTableDeletion() {
    return { success: true as const, data: { taskId: 0 } };
  },
  async executeNextDeletionTask() {
    return { success: true as const, data: { rowsProcessed: 0, hasMoreWork: false } };
  },
});

describe('ExecuteMarkingTaskUseCase', () => {
  it('should call database.executeNextMarkingTask with taskId', async () => {
    // Arrange
    const mockDb = createMockDatabase();
    const useCase = new ExecuteMarkingTaskUseCase(mockDb);

    // Act
    const result = await useCase.execute(42);

    // Assert
    expect(mockDb.calls).toHaveLength(1);
    expect(mockDb.calls[0].args[0]).toBe(42);
  });

  it('should return hasMoreWork = true when there is more work', async () => {
    // Arrange
    const mockDb = createMockDatabase({ rowsProcessed: 1000, hasMoreWork: true });
    const useCase = new ExecuteMarkingTaskUseCase(mockDb);

    // Act
    const result = await useCase.execute(1);

    // Assert
    if (result.success) {
      expect(result.data.hasMoreWork).toBe(true);
      expect(result.data.rowsProcessed).toBe(1000);
    }
  });

  it('should return hasMoreWork = false when all rows processed', async () => {
    // Arrange
    const mockDb = createMockDatabase({ rowsProcessed: 50, hasMoreWork: false });
    const useCase = new ExecuteMarkingTaskUseCase(mockDb);

    // Act
    const result = await useCase.execute(99);

    // Assert
    if (result.success) {
      expect(result.data.hasMoreWork).toBe(false);
    }
  });
});
