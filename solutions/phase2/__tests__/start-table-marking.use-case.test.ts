/**
 * Unit Test - StartTableMarkingUseCase
 *
 * LÖSUNG - Vollständig implementiert
 *
 * Lernziel: UseCase mit Mock-Adapter testen (Hexagonale Architektur)
 */
import { describe, it, expect } from 'vitest';
import { StartTableMarkingUseCase } from '../application/use-cases/start-table-marking.use-case.js';
import type { DatabasePort } from 'contracts';

/**
 * Mock-Adapter erstellen (implementiert DatabasePort)
 */
const createMockDatabase = (): DatabasePort & { calls: Array<{ method: string; args: any[] }> } => ({
  calls: [],

  async startTableMarking(jobId: string, tableName: string, cutoffDate: string) {
    this.calls.push({ method: 'startTableMarking', args: [jobId, tableName, cutoffDate] });
    return { success: true as const, data: { taskId: 42 } };
  },

  // Stub-Methoden
  async getTablesToProcess() {
    return { success: true as const, data: [] };
  },
  async executeNextMarkingTask() {
    return { success: true as const, data: { rowsProcessed: 0, hasMoreWork: false } };
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

describe('StartTableMarkingUseCase', () => {
  it('should call database.startTableMarking with correct parameters', async () => {
    // Arrange
    const mockDb = createMockDatabase();
    const useCase = new StartTableMarkingUseCase(mockDb);

    // Act
    const result = await useCase.execute({
      jobId: 'test-job-123',
      tableName: 'users',
      cutoffDate: '2024-01-01',
    });

    // Assert
    expect(result.success).toBe(true);
    expect(mockDb.calls).toHaveLength(1);
    expect(mockDb.calls[0].args[0]).toBe('test-job-123');
    expect(mockDb.calls[0].args[1]).toBe('users');
    expect(mockDb.calls[0].args[2]).toBe('2024-01-01');
  });

  it('should return taskId from database', async () => {
    // Arrange
    const mockDb = createMockDatabase();
    const useCase = new StartTableMarkingUseCase(mockDb);

    // Act
    const result = await useCase.execute({
      jobId: 'job-456',
      tableName: 'orders',
      cutoffDate: '2024-06-01',
    });

    // Assert
    if (result.success) {
      expect(result.data.taskId).toBe(42);
    }
  });
});
