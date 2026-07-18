/**
 * Phase 5 Tour Steps
 *
 * Interactive tour for Phase 5: E2E Observability
 * Demonstrates correlation IDs, distributed tracing, and observability patterns.
 */

import type { TourStep } from '../../components/display/InteractiveCodeTour.js';
import {
  proofSqsQueues,
  proofBackupMarkers,
  proofLambdaInvokeWithPayload,
  experimentCorrelationIdMissing,
} from '../tour-helpers.js';
import { workshopConfig } from '../../core/config/workshop.config.js';

export const phase5TourSteps: TourStep[] = [
  {
    title: 'Correlation ID Workflow',
    file: 'packages/marking-starter-lambda/src/index.ts',
    code: `// Starter erzeugt correlationId
const correlationId = crypto.randomUUID();

// Jeder Log-Eintrag enthält die ID
console.log(JSON.stringify({
  event: 'MARKING_STARTED',
  correlationId,           // [1]
  tables: event.tables,
}));

// SQS Message trägt die ID weiter
await sqs.send({
  MessageBody: JSON.stringify({
    correlationId,         // [2]
    tableName,
    markerId,
  }),
});`,
    highlightLines: [2, 7, 15],
    explanation:
      '[1] correlationId wird beim Start erzeugt. [2] Jede SQS Message enthält die gleiche ID → Logs verfolgbar!',
    whyThisMatters: {
      problem: 'In Microservices verteilen sich Requests auf viele Lambdas - wie findest du zusammengehörige Logs?',
      consequence: 'Ohne correlationId: Debugging eines einzelnen Requests = Stunden manueller Log-Analyse',
      realWorld: 'X-Ray, Datadog, etc. nutzen alle Correlation IDs - das ist DER Standard für Distributed Tracing',
    },
    commonMistake: {
      wrong: 'correlationId nur loggen, aber nicht an nachfolgende Services weitergeben',
      why: 'Die ID endet dann beim ersten Service - der Rest der Kette ist nicht verfolgbar',
      fix: 'correlationId in JEDEM SQS MessageBody, HTTP Header, DB Record mitführen',
    },
    proofFn: proofBackupMarkers,
    experimentFn: experimentCorrelationIdMissing,
    experimentConfig: {
      question: 'Ein Fehler tritt auf. Logs zeigen 6 Einträge von 3 verschiedenen Lambdas. Wie debuggst du OHNE correlationId?',
      hypotheses: [
        'A) Logs nach Timestamp sortieren reicht',
        'B) Fehler-Logs nach ERROR filtern',
        'C) Manuell Log für Log durchgehen (~30+ Min)',
        'D) Automatic Tracing zeigt alles',
      ],
      correctAnswer: 'C',
      ahamoment: 'Ohne correlationId ist Distributed Debugging ein Albtraum! Ein grep reicht MIT IDs.',
    },
  },
  {
    title: 'E2E Flow: Alle Queues',
    file: 'cdk/lib/workshop-stack.ts',
    code: `// Der komplette Message-Flow:
//
// MarkingStarter
//      │
//      ▼
// lts-worker-queue ─────▶ LtsExecutor (Self-Trigger Loop)
//      │
//      ▼
// completion-queue ─────▶ StatusPoller (Backoff Loop)
//      │
//      ▼
// COMPLETED (Log Event)`,
    highlightLines: [6, 9],
    explanation:
      'Zwei Queues orchestrieren den Flow: lts-worker-queue für Batch-Processing, completion-queue für Status-Polling.',
    whyThisMatters: {
      problem: 'Wie koordinierst du mehrere asynchrone Services ohne zentralen Orchestrator?',
      consequence: 'Choreographie via Queues: Jeder Service weiß nur "wohin schicke ich das nächste Event"',
      realWorld: 'Event-Driven Architecture - die Basis für alle modernen Cloud-Systeme',
    },
    commonMistake: {
      wrong: 'Step Functions für jeden Workflow nutzen',
      why: 'Step Functions sind teuer und komplex für einfache Flows. SQS reicht oft.',
      fix: 'Step Functions nur für komplexe Branching/Parallelisierung. Simple Chains → SQS',
    },
    proofFn: proofSqsQueues,
  },
  {
    title: 'Structured Logging Pattern',
    file: 'packages/lts-executor-lambda/src/index.ts',
    code: `// Jeder Log-Eintrag ist JSON mit festen Feldern
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),  // [1]
  event: 'BATCH_PROCESSED',             // [2]
  correlationId,                        // [3]
  tableName,
  processedRows: 100,
  hasMoreWork: true,
}));

// CloudWatch Logs Insights Query:
// fields @timestamp, event, correlationId, processedRows
// | filter correlationId = "abc-123"
// | sort @timestamp asc`,
    highlightLines: [3, 4, 5],
    explanation:
      '[1] ISO Timestamp für Sortierung. [2] Event-Type für Filterung. [3] correlationId verbindet alle Logs eines Jobs.',
    whyThisMatters: {
      problem: 'Plain-Text Logs sind nicht maschinell auswertbar',
      consequence: 'CloudWatch Logs Insights, Datadog, Splunk - alle brauchen strukturierte Daten',
      realWorld: 'JSON Logs + Logs Insights = SQL-ähnliche Queries über Millionen Logs in Sekunden',
    },
    commonMistake: {
      wrong: 'console.log(`Processing ${tableName}...`)',
      why: 'String-Logs sind nicht filterbar, nicht aggregierbar, nicht dashboardfähig',
      fix: 'console.log(JSON.stringify({ event, tableName, ... })) - immer strukturiert!',
    },
    proofFn: () =>
      proofLambdaInvokeWithPayload(workshopConfig.lambdas.MarkingStarter, {
        tables: ['test_e2e'],
      }),
  },
  {
    title: 'E2E Test Live',
    file: 'packages/workshop-cli/src/commands/run.ts',
    code: `// E2E Test startet den kompletten Flow:
//
// 1. MarkingStarter aufrufen mit Test-Tabellen
// 2. Logs aller Lambdas beobachten
// 3. correlationId durch alle Events verfolgen
// 4. Status in DB prüfen (PENDING → SUCCESS)
//
// Erwartete Events in Reihenfolge:
// - MARKING_STARTED (Starter)
// - BATCH_PROCESSED (Worker, mehrfach)
// - STATUS_CHECK (Poller, mit attempt++)
// - MARKING_COMPLETED (Poller, final)`,
    highlightLines: [9, 10, 11, 12],
    explanation:
      'Der E2E Test zeigt alle 4 Event-Types. Beobachte im LiveLogViewer wie correlationId durch den Flow wandert!',
    whyThisMatters: {
      problem: 'Wie beweist du dass das ganze System zusammen funktioniert?',
      consequence: 'E2E Test = Smoke Test. Wenn alle Events erscheinen, ist das System gesund.',
      realWorld: 'Production Canary: Regelmäßig synthetische Requests durchs System schicken',
    },
    commonMistake: {
      wrong: 'Nur Unit Tests für einzelne Lambdas',
      why: 'Unit Tests prüfen nicht die Verkabelung - Queue-Permissions, DB-Verbindungen, etc.',
      fix: 'E2E Test regelmäßig ausführen - mindestens vor jedem Deploy',
    },
    proofFn: proofBackupMarkers,
  },
];
