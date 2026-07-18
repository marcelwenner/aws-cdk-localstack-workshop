/**
 * Phase 2 Tour Steps
 *
 * Interactive tour for Phase 2: MarkingStarterLambda implementieren
 * Shows what EXISTS (Queue, DB schema) and explains what needs to be BUILT.
 * No proofFn for things that don't exist yet!
 */

import type { TourStep } from '../../components/display/InteractiveCodeTour.js';
import {
  proofSqsQueueAttributes,
  proofSqsMessageCount,
  proofDatabaseSchema,
  experimentSqsMessageForgotten,
} from '../tour-helpers.js';

export const phase2TourSteps: TourStep[] = [
  {
    title: 'SQS Queue (existiert bereits)',
    file: 'cdk/lib/workshop-stack.ts',
    code: `const ltsWorkerQueue = new sqs.Queue(this, 'LtsWorkerQueue', {
  queueName: 'lts-worker-queue',
  visibilityTimeout: cdk.Duration.seconds(900),   // [1]
  deadLetterQueue: {
    queue: ltsWorkerDlq,
    maxReceiveCount: 3,                           // [2]
  },
});`,
    highlightLines: [3, 6],
    explanation:
      'Die Queue existiert bereits! Du musst sie nur noch nutzen.',
    whyThisMatters: {
      problem: 'Ohne Queue wäre die Kommunikation zwischen Starter und Worker synchron',
      consequence: 'Starter müsste warten bis Worker fertig ist - bei 1000 Tabellen = Timeout!',
      realWorld: 'Queues entkoppeln Systeme: Starter feuert ab und vergisst, Worker holt ab wenn bereit',
    },
    proofFn: () => proofSqsQueueAttributes('lts-worker-queue'),
  },
  {
    title: 'Deine Aufgabe: Handler implementieren',
    file: 'packages/marking-starter-lambda/src/interfaces/lambda-handler.ts',
    code: `// DU IMPLEMENTIERST DIESEN HANDLER!
//
// Der Handler soll (Fan-Out):
// 1. Für jede Tabelle: Task in DB anlegen (status=PENDING)
//    → container.startTableMarkingUseCase.execute(...)
// 2. Für jede Tabelle: Message an SQS senden (mit taskId!)
//    → container.queue.sendMessage(container.workerQueueUrl, ...)
//
// Use Case + Adapter sind FERTIG - du orchestrierst sie nur.
// Environment Variables die du bekommst:
//   LTS_WORKER_QUEUE_URL, DB_HOST, DB_NAME, DB_USER, DB_PASSWORD`,
    highlightLines: [4, 5, 6, 7],
    explanation:
      'Das ist dein Job in Phase 2! Die Lambda ist der "Orchestrator" - sie startet den Marking-Prozess.',
    whyThisMatters: {
      problem: 'Ohne zentrale Koordination weiß niemand welche Tabellen verarbeitet werden',
      consequence: 'DB-Task ermöglicht Status-Tracking, SQS-Message triggert den Worker',
      realWorld: 'Saga-Pattern: Ein Service koordiniert, andere führen aus',
    },
    commonMistake: {
      wrong: 'Message senden OHNE taskId',
      why: 'Worker braucht die taskId um den Status in der DB zu aktualisieren',
      fix: 'container.queue.sendMessage(url, { taskId: result.data.taskId, taskType: \'marking\', ... })',
    },
    // Kein proofFn - Lambda ist noch nicht implementiert/deployed!
  },
  {
    title: 'DB Schema (existiert bereits)',
    file: 'local/sql/tables/02_marking_tasks.sql',
    code: `CREATE TABLE lts.marking_tasks (
  id SERIAL PRIMARY KEY,
  job_id UUID NOT NULL,
  table_name VARCHAR(255) NOT NULL,
  cutoff_date TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING',  -- [1]
  rows_processed INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);`,
    highlightLines: [6],
    explanation:
      'Die Tabelle existiert! Deine Lambda muss hier Tasks mit Status PENDING einfügen.',
    whyThisMatters: {
      problem: 'Ohne DB-Eintrag können wir den Fortschritt nicht verfolgen',
      consequence: 'status-Spalte ermöglicht: PENDING → IN_PROGRESS → COMPLETED',
      realWorld: 'State Machine Pattern: Jeder Task hat einen definierten Lebenszyklus',
    },
    commonMistake: {
      wrong: 'taskId aus dem Use-Case-Result ignorieren',
      why: 'Du brauchst die generierte ID (taskId) für die SQS Message',
      fix: 'const taskId = result.data.taskId (der Use Case macht RETURNING id für dich)',
    },
    proofFn: proofDatabaseSchema,
  },
  {
    title: 'Queue wartet auf Messages',
    file: 'packages/marking-starter-lambda/src/interfaces/lambda-handler.ts',
    code: `// Nach deiner Implementierung:
// 1. Du rufst Lambda auf mit { "tables": [...] }
// 2. Lambda erstellt DB-Tasks (PENDING)
// 3. Lambda sendet SQS Messages
// 4. Queue zeigt: X Messages wartend

// Der Worker (Phase 3) wird sie abholen.`,
    highlightLines: [3, 4],
    explanation:
      'Die Queue ist der "Postkasten" zwischen Starter und Worker. Aktuell leer - nach deiner Implementierung kommen Messages rein!',
    whyThisMatters: {
      problem: 'Queue und DB müssen synchron sein - sonst verwaiste Tasks',
      consequence: 'Jeder DB-Task braucht GENAU eine SQS Message',
      realWorld: 'Distributed Systems 101: Daten und Events müssen konsistent sein',
    },
    proofFn: () => proofSqsMessageCount('lts-worker-queue'),
    experimentFn: experimentSqsMessageForgotten,
    experimentConfig: {
      question: 'Der Starter erstellt DB-Marker, aber vergisst die SQS Message. Was passiert?',
      hypotheses: [
        'A) Der Worker pollt die DB und findet den Task',
        'B) Der Task bleibt PENDING - für immer',
        'C) SQS holt sich die Daten automatisch aus der DB',
        'D) Ein Timeout-Mechanismus startet den Task',
      ],
      correctAnswer: 'B',
      ahamoment: 'Ohne SQS Message weiß NIEMAND dass Arbeit wartet! DB allein reicht nicht.',
    },
  },
];
