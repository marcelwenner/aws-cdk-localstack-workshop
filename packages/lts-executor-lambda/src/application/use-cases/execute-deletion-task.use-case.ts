/**
 * ExecuteDeletionTask Use Case
 *
 * ⚠️ TODO PHASE 3 - DU MUSST DAS IMPLEMENTIEREN!
 *
 * Dieser Use Case führt EINEN Batch der Deletion-Arbeit aus.
 * Er ist FAST IDENTISCH zu ExecuteMarkingTask!
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │   💡 VERGLEICHE MIT ExecuteMarkingTaskUseCase!                  │
 * │                                                                 │
 * │   Der einzige Unterschied:                                      │
 * │   - DB-Methode: executeNextDeletionTask statt ...MarkingTask   │
 * │   - Event-Namen: DELETION statt MARKING                         │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Warum zwei Use Cases? Weil sie unterschiedliche Business-Logik
 * repräsentieren, auch wenn die Implementierung ähnlich ist.
 */

import type { DatabasePort, Result, TaskExecutionResult } from 'contracts';

export class ExecuteDeletionTaskUseCase {
  constructor(private readonly database: DatabasePort) {}

  /**
   * Führe einen Batch der Deletion-Arbeit aus
   *
   * 📋 SCHRITTE ZUR IMPLEMENTIERUNG:
   *
   * [1] STRUCTURED LOGGING AM ANFANG
   *    - Event-Name: 'EXECUTING_DELETION_TASK'
   *
   * [2] DATABASE CALL
   *    - this.database.executeNextDeletionTask(taskId)  ← Beachte: DELETION!
   *
   * [3] ERROR HANDLING
   *    - Wenn !result.success → return result
   *
   * [4] SUCCESS LOGGING + RETURN
   *    - Event-Name: 'DELETION_BATCH_COMPLETE'
   *
   * 💡 TIPP: Copy-Paste von ExecuteMarkingTask, dann Event-Namen ändern!
   */
  async execute(taskId: number, correlationId?: string): Promise<Result<TaskExecutionResult, Error>> {
    // DEINE IMPLEMENTIERUNG HIER
    //
    // Fast identisch zu ExecuteMarkingTask!
    // Nur die DB-Methode und Event-Namen sind anders.

    throw new Error('NOT_IMPLEMENTED - Bitte implementiere diesen Use Case in Phase 3!');
  }
}

/*
 * ✅ LERNZIEL-CHECK
 *
 * Nach der Implementierung solltest du verstehen:
 * 1. Code-Wiederverwendung durch ähnliche Patterns
 * 2. Wann man Code dupliziert vs. abstrahiert
 *    (Hier: Duplikation ist OK weil unterschiedliche Business-Semantik)
 */
