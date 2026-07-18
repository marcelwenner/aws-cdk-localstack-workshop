/**
 * StatusPoller Lambda Handler
 *
 * ✅ VORGEFERTIGT - Dieser Handler ist bereits implementiert!
 *    Du musst nur den USE CASE implementieren.
 *
 * Diese Lambda implementiert das "Polling Pattern mit Exponential Backoff":
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                      POLLING PATTERN                            │
 * │                                                                 │
 * │   [SQS: status-check-queue]                                     │
 * │              │                                                  │
 * │              ▼                                                  │
 * │   [StatusPoller Lambda]                                         │
 * │              │                                                  │
 * │              ▼                                                  │
 * │   [CheckMarkingStatusUseCase] ◀── DAS IMPLEMENTIERST DU!        │
 * │              │                                                  │
 * │     ┌───────┴───────┐                                           │
 * │     ▼               ▼                                           │
 * │ IN_PROGRESS      COMPLETED                                      │
 * │     │               │                                           │
 * │     ▼               ▼                                           │
 * │ [Neu planen]   [Completion senden]                              │
 * │ mit Delay       zur nächsten Phase                              │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Warum Exponential Backoff?
 * - Check 1: 5 Sekunden warten   → Schnelles Feedback
 * - Check 2: 10 Sekunden warten  → Noch responsiv
 * - Check 3: 20 Sekunden warten  → Backing off
 * - Check N: Bis zu 300s warten  → DB nicht überlasten
 *
 * 💡 DEINE AUFGABE: Implementiere check-marking-status.use-case.ts
 *    Dieser Handler ruft nur den Use Case auf - hier keine Änderungen nötig!
 */

import type { SQSEvent, Context } from 'aws-lambda';
import { buildContainer } from '../infrastructure/container.js';
import { isSuccess, type StatusCheckRequest } from 'contracts';

let container: Awaited<ReturnType<typeof buildContainer>> | null = null;

/**
 * Lambda Handler
 *
 * ✅ Dieser Handler ist VORGEFERTIGT - er ruft nur deinen Use Case auf
 */
export const handler = async (
  event: SQSEvent,
  context: Context
): Promise<void> => {
  if (!container) {
    container = await buildContainer();
  }

  for (const record of event.Records) {
    const message = JSON.parse(record.body) as StatusCheckRequest;

    console.log(JSON.stringify({
      event: 'STATUS_CHECK_TRIGGERED',
      jobId: message.jobId,
      attempt: message.attempt,
      correlationId: message.correlationId,
    }));

    // Führe deinen Use Case aus
    const result = await container.checkMarkingStatusUseCase.execute(message);

    if (!isSuccess(result)) {
      console.error(JSON.stringify({
        event: 'STATUS_CHECK_FAILED',
        error: result.error.message,
        jobId: message.jobId,
      }));

      throw result.error; // Geht zur DLQ
    }
  }
};

/*
 * ✅ LERNZIEL-CHECK
 *
 * Dieses Pattern trennt Verantwortlichkeiten:
 * - Handler: Infrastruktur (SQS, Container, Error Handling)
 * - UseCase: Business Logik (Polling, Backoff, Status-Behandlung)
 *
 * Nach der Implementierung des Use Case solltest du verstehen:
 * 1. Polling Pattern (asynchrones Status-Monitoring)
 * 2. Exponential Backoff (intelligentes Retry-Timing)
 * 3. Structured Logging (für Log Quest!)
 * 4. SQS Delayed Messages (DelaySeconds)
 *
 * 🔍 LOG QUEST TIPP (Phase 5):
 * Im LiveLogViewer [L], such nach:
 * - STATUS_CHECK Events mit steigenden attempt Nummern
 * - nextDelaySeconds verdoppelt sich jedes Mal
 * - MARKING_COMPLETED wenn fertig
 */
