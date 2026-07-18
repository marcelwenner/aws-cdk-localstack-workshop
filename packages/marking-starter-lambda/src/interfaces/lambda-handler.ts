/**
 * MarkingStarter Lambda Handler
 *
 * ⚠️ TODO PHASE 2 - DU MUSST DAS IMPLEMENTIEREN!
 *
 * Diese Lambda startet den Marking-Prozess und implementiert das FAN-OUT PATTERN:
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                       FAN-OUT PATTERN                           │
 * │                                                                 │
 * │   1 Request ──▶ [MarkingStarter] ──▶ N Tasks in DB              │
 * │                        │                                        │
 * │                        └──────────▶ N Messages an SQS           │
 * │                                          │                      │
 * │                                          ▼                      │
 * │                              [Worker verarbeiten parallel]      │
 * │                                                                 │
 * │   Warum? Eine Lambda hat max. 15 Minuten Laufzeit.              │
 * │   100 Tabellen sequenziell = Timeout!                           │
 * │   100 SQS Messages = 100 parallele Worker, jeder mit            │
 * │   eigenem Timeout. Einzelne Fehler stoppen nicht den Rest.      │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Der Ablauf pro Tabelle:
 * 1. Marking-Task in der DB anlegen (Status PENDING) → liefert taskId
 * 2. Message mit der taskId an die lts-worker-queue senden
 */

import type { Context } from 'aws-lambda';
import { buildContainer } from '../infrastructure/container.js';
import { isSuccess } from 'contracts';

// Container cache (cold start optimization)
let container: Awaited<ReturnType<typeof buildContainer>> | null = null;

/**
 * Event structure (what this Lambda receives)
 * Supports two formats:
 * 1. Workshop CLI format: { action: 'startMarking', tableCount: number }
 * 2. Full format: { jobId: string, tables: [...] }
 */
export interface MarkingStarterEvent {
  // Workshop CLI format
  action?: 'startMarking';
  tableCount?: number;
  // Full format
  jobId?: string;
  tables?: Array<{
    tableName: string;
    cutoffDate: string;
  }>;
}

/**
 * Response structure (what this Lambda returns)
 */
export interface MarkingStarterResponse {
  tasksCreated: number;
  taskIds: number[];
}

/**
 * Generate mock tables for workshop demo
 */
function generateMockTables(count: number): Array<{ tableName: string; cutoffDate: string }> {
  const tables = [];
  for (let i = 1; i <= count; i++) {
    tables.push({
      tableName: `demo_table_${i}`,
      cutoffDate: new Date().toISOString().split('T')[0],
    });
  }
  return tables;
}

/**
 * Lambda Handler
 *
 * 📋 SCHRITTE ZUR IMPLEMENTIERUNG:
 *
 * [1] CONTAINER BAUEN (Cold-Start-Optimierung)
 *    - if (!container) { container = await buildContainer(); }
 *    - Der Container gibt dir: startTableMarkingUseCase, queue, workerQueueUrl
 *
 * [2] FÜR JEDE TABELLE: TASK IN DB ANLEGEN
 *    - container.startTableMarkingUseCase.execute({ jobId, tableName, cutoffDate })
 *    - Gibt Result<MarkingTask, Error> zurück → taskId steckt in result.data.taskId
 *    - Bei Fehler (!isSuccess(result)): Fehler loggen + Error werfen
 *
 * [3] FÜR JEDE TABELLE: MESSAGE AN SQS SENDEN
 *    - container.queue.sendMessage(container.workerQueueUrl, { ... })
 *    - Die Message braucht: taskId, taskType: 'marking', jobId, tableName, correlationId
 *    - ⚠️ Ohne taskId kann der Worker (Phase 3) den Status nicht updaten!
 *
 * [4] STRUCTURED LOGGING (Log Quest in Phase 5 braucht das!)
 *    - Logge als JSON: event, taskId, tableName, correlationId
 *    - z.B. Event-Namen: 'LAMBDA_INVOKED', 'TASK_CREATED_AND_QUEUED', 'LAMBDA_SUCCEEDED'
 *
 * [5] RESPONSE ZURÜCKGEBEN
 *    - return { tasksCreated: taskIds.length, taskIds }
 *
 * 💡 TIPPS:
 *    - correlationId = context.awsRequestId (verbindet alle Logs dieser Anfrage!)
 *    - Die Event-Normalisierung (CLI-Format vs. Full-Format) ist unten schon fertig
 *    - Schau dir packages/get-table-list-lambda als Referenz an (Phase 1)
 */
export const handler = async (
  event: MarkingStarterEvent,
  context: Context
): Promise<MarkingStarterResponse> => {
  const correlationId = context.awsRequestId;

  // ✅ PRE-BUILT: Event normalisieren (Workshop-CLI-Format oder Full-Format)
  let jobId: string;
  let tables: Array<{ tableName: string; cutoffDate: string }>;

  if (event.action === 'startMarking' && event.tableCount) {
    // Workshop CLI format - generate mock data
    jobId = crypto.randomUUID();
    tables = generateMockTables(event.tableCount);
  } else if (event.jobId && event.tables) {
    // Full format
    jobId = event.jobId;
    tables = event.tables;
  } else {
    throw new Error('Invalid event format. Expected { action: "startMarking", tableCount: N } or { jobId, tables }');
  }

  // Vermeidet "unused variable"-Warnungen solange du noch nicht implementiert hast:
  void jobId;
  void tables;
  void correlationId;
  void isSuccess;

  // ⚠️ DEINE IMPLEMENTIERUNG HIER (Schritte [1] bis [5] von oben)
  //
  // Denk nach über:
  // - Was passiert, wenn die DB schreibt, aber SQS fehlschlägt? (2-Phase-Commit-Problem!)
  // - Warum brauchst du die taskId in der SQS Message?
  // - Was sollte in JEDEM Log-Eintrag stehen, damit du in Phase 5 debuggen kannst?

  throw new Error('NOT_IMPLEMENTED - Bitte implementiere diesen Handler in Phase 2!');
};

/*
 * ✅ LERNZIEL-CHECK
 *
 * Nach der Implementierung solltest du verstehen:
 * 1. Fan-Out Pattern (1 Request → N Tasks → parallele Verarbeitung)
 * 2. SQS Message Struktur (taskId, taskType, jobId, tableName, correlationId)
 * 3. Error Handling (Error werfen → Retry/DLQ bei async, 500 bei sync)
 * 4. Structured Logging (JSON-Format für CloudWatch Insights)
 *
 * 🔍 DANACH: CDK!
 * Die Lambda existiert erst in AWS, wenn du sie in cdk/lib/workshop-stack.ts
 * aktivierst (Blockkommentar entfernen) und deployst.
 * Schau dir danach mit `cdklocal synth` an, was CDK daraus generiert -
 * findest du die IAM Policy, die grantSendMessages() erzeugt hat?
 */
