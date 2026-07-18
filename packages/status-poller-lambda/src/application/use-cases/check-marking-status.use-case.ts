/**
 * CheckMarkingStatus Use Case
 *
 * ⚠️ TODO PHASE 4 - DU MUSST DAS IMPLEMENTIEREN!
 *
 * Dieser Use Case implementiert das "Polling Pattern mit Exponential Backoff":
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │               POLLING PATTERN + EXPONENTIAL BACKOFF             │
 * │                                                                 │
 * │   [Status prüfen] ──▶ IN_PROGRESS? ──▶ [Nächsten Check planen]  │
 * │         │                   │              │                    │
 * │         │                   │         delay = 5s × 2^attempt    │
 * │         │                   │              │                    │
 * │         ▼                   ▼              ▼                    │
 * │    COMPLETED?          FAILED?      [Zurück in Queue]           │
 * │         │                   │                                   │
 * │         ▼                   ▼                                   │
 * │   [Completion        [Throw → DLQ]                              │
 * │    senden]                                                      │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Warum Exponential Backoff?
 * - Versuch 1: 5 Sekunden    (schnelles Feedback)
 * - Versuch 2: 10 Sekunden
 * - Versuch 3: 20 Sekunden
 * - Versuch 4: 40 Sekunden
 * - ...bis max 300 Sekunden (5 Minuten)
 *
 * Das verhindert DB-Überlastung und bleibt trotzdem responsiv!
 */

import type { DatabasePort, QueuePort, Result, StatusCheckRequest } from 'contracts';
import { success, failure } from 'contracts';
import { calculateBackoffDelay } from 'queue-adapter-sqs';

export class CheckMarkingStatusUseCase {
  constructor(
    private readonly database: DatabasePort,
    private readonly queue: QueuePort
  ) {}

  /**
   * Führe den Status-Check aus
   *
   * 📋 SCHRITTE ZUR IMPLEMENTIERUNG:
   *
   * [1] FORTSCHRITT IN DATENBANK PRÜFEN
   *    - this.database.checkMarkingProgress(jobId)
   *    - Gibt zurück: { status, rowsProcessed, rowsMarked, progressPercent }
   *
   * [2] STATUS BEHANDELN: IN_PROGRESS
   *    - Delay berechnen: calculateBackoffDelay(request.attempt)
   *    - Nächsten Check planen: this.queue.sendStatusCheck(...)
   *    - ⚠️ WICHTIG: attempt Counter erhöhen!
   *
   * [3] STATUS BEHANDELN: COMPLETED
   *    - Completion senden: this.queue.sendCompletion(...)
   *    - Return success
   *
   * [4] STATUS BEHANDELN: FAILED
   *    - Return failure(new Error(...))
   *    - Das wirft → geht zur DLQ
   *
   * 💡 TIPPS:
   *    - calculateBackoffDelay(attempt) gibt Sekunden zurück
   *    - Vergiss Structured Logging nicht! (Log Quest braucht das!)
   *    - Logge: event, jobId, correlationId, status, attempt, nextDelaySeconds
   */
  async execute(request: StatusCheckRequest): Promise<Result<void, Error>> {
    // DEINE IMPLEMENTIERUNG HIER
    //
    // Denk nach über:
    // - Welche Status-Werte kann die Datenbank zurückgeben?
    // - Wie berechne ich den Delay für den nächsten Check?
    // - Was logge ich für Observability (Log Quest!)?
    // - Wie erhöhe ich den attempt Counter?

    throw new Error('NOT_IMPLEMENTED - Bitte implementiere diesen Use Case in Phase 4!');
  }
}

/*
 * ✅ LERNZIEL-CHECK
 *
 * Nach der Implementierung solltest du verstehen:
 * 1. Polling Pattern (Status prüfen → nächsten Check planen → wiederholen)
 * 2. Exponential Backoff (delay = baseDelay × 2^attempt)
 * 3. Structured Logging (für Observability)
 * 4. Event-Driven Completion (Event senden wenn fertig)
 *
 * 🔍 LOG QUEST VORSCHAU (Phase 5):
 * Deine Logs sollten so aussehen:
 *   { event: "STATUS_CHECK", attempt: 1, nextDelaySeconds: 5 }
 *   { event: "STATUS_CHECK", attempt: 2, nextDelaySeconds: 10 }
 *   { event: "STATUS_CHECK", attempt: 3, nextDelaySeconds: 20 }
 *   { event: "MARKING_COMPLETED", rowsMarked: 1500 }
 *
 * Erkennst du das Exponential Backoff Pattern?
 */
