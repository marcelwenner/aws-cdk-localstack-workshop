/**
 * Unit Test - StartTableMarkingUseCase
 *
 * ⚠️ TODO PHASE 2 - Fülle die Assertions aus!
 *
 * Lernziel: UseCase mit Mock-Adapter testen (Hexagonale Architektur)
 *
 * Der Mock ist schon fertig - er implementiert DatabasePort und
 * protokolliert jeden Aufruf in `calls`. Deine Aufgabe: Prüfe in den
 * Assertions, dass der UseCase den Mock RICHTIG benutzt hat.
 *
 * 💡 Warum Mock-State prüfen statt nur Return-Werte?
 *    Der UseCase könnte `success` zurückgeben OHNE die DB aufzurufen.
 *    Erst die Prüfung von mockDb.calls beweist das richtige Verhalten!
 */
import { describe, it, expect } from 'vitest';
import { StartTableMarkingUseCase } from '../application/use-cases/start-table-marking.use-case.js';
import type { DatabasePort } from 'contracts';

/**
 * ✅ PRE-BUILT: Mock-Adapter (implementiert DatabasePort)
 * Protokolliert jeden Aufruf in `calls` - darauf kannst du Assertions schreiben.
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

    // TODO [1]: Prüfe, dass GENAU EIN Aufruf in mockDb.calls protokolliert wurde
    //           Tipp: expect + toHaveLength

    // TODO [2]: Prüfe, dass die Argumente stimmen:
    //           mockDb.calls[0].args[0] → 'test-job-123' (jobId)
    //           mockDb.calls[0].args[1] → 'users' (tableName)
    //           mockDb.calls[0].args[2] → '2024-01-01' (cutoffDate)
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
    // TODO [3]: Prüfe, dass result.data.taskId === 42 ist
    //           (Der Mock gibt taskId 42 zurück - kommt sie beim Aufrufer an?)
    //           Tipp: erst if-Check auf result.success, dann expect auf result.data.taskId
    void result;
  });
});
