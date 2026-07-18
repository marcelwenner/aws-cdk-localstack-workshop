/**
 * ExecuteMarkingTask Use Case
 *
 * ⚠️ TODO PHASE 3 - DU MUSST DAS IMPLEMENTIEREN!
 *
 * Dieser Use Case führt EINEN Batch der Marking-Arbeit aus.
 * Er ist Teil des Worker Patterns - er wird vom Handler aufgerufen,
 * der dann entscheidet ob er sich selbst neu triggert.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                   WORKER USE CASE PATTERN                       │
 * │                                                                 │
 * │   [taskId] ──▶ [Log Start] ──▶ [DB: Execute Batch] ──▶ [Log]   │
 * │                                        │                        │
 * │                                        ▼                        │
 * │                               { rowsProcessed, hasMoreWork }    │
 * │                                                                 │
 * │   Der Handler entscheidet dann:                                 │
 * │   - hasMoreWork=true  → Reschedule (neuer SQS Message)         │
 * │   - hasMoreWork=false → Done (Completion Event)                 │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * 💡 TIPP: Dieser Use Case ist einfach - nur DB-Aufruf + Logging!
 *    Die Worker-Logik (Reschedule) ist im Handler.
 */

import type { DatabasePort, Result, TaskExecutionResult } from 'contracts';

export class ExecuteMarkingTaskUseCase {
  constructor(private readonly database: DatabasePort) {}

  /**
   * Führe einen Batch der Marking-Arbeit aus
   *
   * 📋 SCHRITTE ZUR IMPLEMENTIERUNG:
   *
   * [1] STRUCTURED LOGGING AM ANFANG
   *    - Logge: event, taskId, correlationId, timestamp
   *    - Event-Name: 'EXECUTING_MARKING_TASK'
   *
   * [2] DATABASE CALL
   *    - this.database.executeNextMarkingTask(taskId)
   *    - Gibt Result<TaskExecutionResult, Error> zurück
   *    - TaskExecutionResult = { rowsProcessed: number, hasMoreWork: boolean }
   *
   * [3] ERROR HANDLING
   *    - Wenn !result.success → return result (Handler wirft dann Error)
   *
   * [4] SUCCESS LOGGING + RETURN
   *    - Logge: event, taskId, correlationId, rowsProcessed, hasMoreWork
   *    - Event-Name: 'MARKING_BATCH_COMPLETE'
   *    - Return result
   *
   * 💡 TIPPS:
   *    - hasMoreWork ist WICHTIG für den Worker Pattern!
   *    - Der Handler nutzt hasMoreWork um zu entscheiden ob er sich selbst neu triggert
   */
  async execute(taskId: number, correlationId?: string): Promise<Result<TaskExecutionResult, Error>> {
    // DEINE IMPLEMENTIERUNG HIER
    //
    // Dieser Use Case ist simpel:
    // 1. Log starten
    // 2. DB aufrufen
    // 3. Ergebnis loggen
    // 4. Return

    throw new Error('NOT_IMPLEMENTED - Bitte implementiere diesen Use Case in Phase 3!');
  }
}

/*
 * ✅ LERNZIEL-CHECK
 *
 * Nach der Implementierung solltest du verstehen:
 * 1. Batch Processing (nur 1000 Zeilen pro Aufruf)
 * 2. hasMoreWork Flag (Schlüssel für Self-Triggering)
 * 3. Separation of Concerns (Use Case macht nur DB, Handler macht Worker-Logik)
 * 4. Structured Logging für Batch-Observability
 *
 * 🔍 WICHTIG:
 * Wenn hasMoreWork=true, triggert der Handler sich selbst neu!
 * Das ist der Kern des Worker Patterns.
 */
