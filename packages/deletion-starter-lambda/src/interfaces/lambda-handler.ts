/**
 * DeletionStarter Lambda Handler
 *
 * ✅ PRE-BUILT - Dieser Handler ist bereits implementiert!
 *
 * Diese Lambda implementiert das FAN-OUT PATTERN (wie MarkingStarter):
 * 1. Anfrage zum Löschen einer Tabelle empfangen
 * 2. Deletion-Task in DB erstellen (via Use Case)
 * 3. Nachricht an lts-worker-queue senden → triggert Worker Lambda
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │                   FAN-OUT PATTERN                       │
 * │                                                         │
 * │   [Request] ──▶ [Starter] ──┬──▶ [Worker Queue]         │
 * │                             │                           │
 * │                             └──▶ [DB: Task erstellen]   │
 * └─────────────────────────────────────────────────────────┘
 *
 * 💡 VERGLEICHE MIT MARKING-STARTER:
 *    Fast identisch! Nur taskType = 'deletion' statt 'marking'
 */

import type { Context } from 'aws-lambda';
import { buildContainer } from '../infrastructure/container.js';
import { isSuccess } from 'contracts';

// Container-Cache (Cold Start Optimierung)
let container: Awaited<ReturnType<typeof buildContainer>> | null = null;

/**
 * Event-Struktur (was diese Lambda empfängt)
 */
export interface DeletionStarterEvent {
  jobId: string;
  tableName: string;
}

/**
 * Response-Struktur (was diese Lambda zurückgibt)
 */
export interface DeletionStarterResponse {
  taskId: number;
}

/**
 * Lambda Handler
 *
 * ✅ Bereits implementiert - studiere den Code!
 */
export const handler = async (
  event: DeletionStarterEvent,
  context: Context
): Promise<DeletionStarterResponse> => {
  const correlationId = context.awsRequestId;

  console.log(JSON.stringify({
    event: 'DELETION_STARTER_INVOKED',
    jobId: event.jobId,
    tableName: event.tableName,
    correlationId,
    timestamp: new Date().toISOString(),
  }));

  // 1. Container bei Cold Start bauen
  if (!container) {
    container = await buildContainer();
  }

  // 2. Use Case ausführen
  const result = await container.startTableDeletionUseCase.execute({
    jobId: event.jobId,
    tableName: event.tableName,
  });

  // 3. Fehler behandeln
  if (!isSuccess(result)) {
    console.error(JSON.stringify({
      event: 'DELETION_STARTER_FAILED',
      error: result.error.message,
      correlationId,
    }));
    throw result.error;
  }

  // 4. Nachricht an Worker Queue senden - Result prüfen, nicht ignorieren!
  const queueResult = await container.queue.sendMessage(container.workerQueueUrl, {
    taskId: result.data.taskId,
    taskType: 'deletion',  // ← Der einzige Unterschied zu MarkingStarter!
    jobId: event.jobId,
    tableName: event.tableName,
    correlationId,
  });

  if (!isSuccess(queueResult)) {
    console.error(JSON.stringify({
      event: 'DELETION_QUEUE_SEND_FAILED',
      error: queueResult.error.message,
      taskId: result.data.taskId,
      correlationId,
    }));
    throw queueResult.error;
  }

  console.log(JSON.stringify({
    event: 'DELETION_TASK_QUEUED',
    taskId: result.data.taskId,
    correlationId,
  }));

  // 5. Response zurückgeben
  return { taskId: result.data.taskId };
};

/*
 * ✅ LERNZIEL-CHECK
 *
 * Vergleiche diesen Code mit MarkingStarter:
 * 1. Gleiche Struktur (Container → UseCase → Queue)
 * 2. Gleiche Patterns (Fan-Out, Structured Logging)
 * 3. Nur taskType ist anders!
 *
 * 💡 HAUSAUFGABE:
 * Lösche diesen Code und implementiere ihn selbst!
 * Nutze MarkingStarter als Vorlage.
 */
