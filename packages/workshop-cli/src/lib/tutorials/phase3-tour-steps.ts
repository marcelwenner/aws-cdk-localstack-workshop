/**
 * Phase 3 Tour Steps
 *
 * Interactive tour for Phase 3: LtsExecutorLambda - Worker Pattern
 * Demonstrates self-triggering, batch processing, and error handling.
 */

import type { TourStep } from '../../components/display/InteractiveCodeTour.js';
import {
  proofSqsQueueAttributes,
  proofLambdaEventSources,
  proofLambdaIamPolicy,
  proofSqsMessageCount,
  experimentVisibilityTimeout,
  experimentTimeToDLQ,
} from '../tour-helpers.js';
import { workshopConfig } from '../../core/config/workshop.config.js';

export const phase3TourSteps: TourStep[] = [
  {
    title: 'Worker Queue mit DLQ',
    file: 'cdk/lib/workshop-stack.ts',
    code: `const ltsWorkerDlq = new sqs.Queue(this, 'LtsWorkerDlq', {
  queueName: 'lts-worker-dlq',
  retentionPeriod: cdk.Duration.days(14),  // [1]
});

const ltsWorkerQueue = new sqs.Queue(this, 'LtsWorkerQueue', {
  queueName: 'lts-worker-queue',
  visibilityTimeout: cdk.Duration.seconds(900),  // [2]
  deadLetterQueue: {
    queue: ltsWorkerDlq,
    maxReceiveCount: 3,  // [3]
  },
});`,
    highlightLines: [3, 7, 10],
    explanation:
      '[1] DLQ behält Messages 14 Tage für Debugging. [2] Visibility 900s = 6 × Lambda-Timeout (150s), AWS-Regel. [3] Nach 3 Fehlern → DLQ.',
    whyThisMatters: {
      problem: 'Ohne DLQ verschwinden fehlgeschlagene Messages nach maxReceiveCount',
      consequence: 'Du siehst nie WARUM etwas fehlgeschlagen ist - Debugging unmöglich',
      realWorld: '14 Tage Retention gibt dir Zeit für Post-Mortem Analyse auch nach dem Wochenende',
    },
    proofFn: () => proofSqsQueueAttributes('lts-worker-queue'),
    experimentFn: experimentVisibilityTimeout,
    experimentConfig: {
      question: 'Was passiert wenn visibilityTimeout KÜRZER ist als die Lambda-Verarbeitungszeit?',
      hypotheses: [
        'A) Die Lambda crasht mit einem Timeout-Fehler',
        'B) Zwei Lambdas verarbeiten dieselbe Message gleichzeitig',
        'C) Die Message geht verloren',
        'D) SQS wartet automatisch länger',
      ],
      correctAnswer: 'B',
      ahamoment: 'Visibility Timeout muss deutlich länger sein als der Lambda Timeout (AWS: mind. 6×) - sonst Doppelverarbeitung!',
    },
  },
  {
    title: 'Event Source Mapping',
    file: 'cdk/lib/workshop-stack.ts',
    code: `// SQS triggert Lambda automatisch
ltsExecutorLambda.addEventSource(
  new SqsEventSource(ltsWorkerQueue, {
    batchSize: 1,                    // [1]
    reportBatchItemFailures: true,   // [2]
  })
);

// Lambda bekommt diese Permissions automatisch:
// - sqs:ReceiveMessage
// - sqs:DeleteMessage
// - sqs:GetQueueAttributes`,
    highlightLines: [4, 5],
    explanation:
      '[1] batchSize=1 = eine Message pro Lambda-Aufruf (einfacher). [2] reportBatchItemFailures für Partial Batch Failures.',
    whyThisMatters: {
      problem: 'Lambda muss irgendwie wissen dass neue Messages da sind',
      consequence: 'Event Source Mapping = AWS pollt die Queue für dich, du schreibst nur Handler-Code',
      realWorld: 'Alternative: Self-Polling (mehr Code, mehr Komplexität, gleiche Kosten)',
    },
    commonMistake: {
      wrong: 'batchSize: 10 ohne reportBatchItemFailures',
      why: 'Bei Fehler in einer Message werden ALLE 10 zurück in die Queue gestellt',
      fix: 'reportBatchItemFailures: true → Nur fehlgeschlagene Messages zurück',
    },
    proofFn: () => proofLambdaEventSources(workshopConfig.lambdas.LtsExecutor),
  },
  {
    title: 'Self-Triggering Permission',
    file: 'cdk/lib/workshop-stack.ts',
    code: `// Worker sendet an sich selbst (mehr Arbeit da)
ltsWorkerQueue.grantSendMessages(ltsExecutorLambda);

// UND an Completion Queue (Arbeit fertig)
completionQueue.grantSendMessages(ltsExecutorLambda);

// CDK generiert diese IAM Policy:
// {
//   "Effect": "Allow",
//   "Action": "sqs:SendMessage",
//   "Resource": "arn:aws:sqs:*:*:lts-worker-queue"
// }`,
    highlightLines: [2, 5],
    explanation:
      'grantSendMessages gibt NUR sqs:SendMessage - Least Privilege! Worker kann sich selbst triggern für nächsten Batch.',
    whyThisMatters: {
      problem: 'Worker muss sich selbst re-triggern können für große Datenmengen',
      consequence: 'Ohne diese Permission: AccessDenied beim Senden → Worker stoppt nach erstem Batch',
      realWorld: 'Self-Triggering = Serverless-Äquivalent einer While-Schleife',
    },
    commonMistake: {
      wrong: 'queue.grantConsumeMessages() für Self-Triggering',
      why: 'ConsumeMessages = ReceiveMessage + DeleteMessage (zum Lesen). SendMessages = zum Schreiben.',
      fix: 'grantSendMessages() für Self-Trigger, grantConsumeMessages() kommt automatisch via Event Source',
    },
    proofFn: () => proofLambdaIamPolicy(workshopConfig.lambdas.LtsExecutor),
  },
  {
    title: 'Queue Status Live',
    file: 'packages/lts-executor-lambda/src/index.ts',
    code: `// Worker holt Message von lts-worker-queue
// Verarbeitet Batch (z.B. 100 Zeilen)
// Prüft: Noch mehr Daten?
//   JA  → Sendet neue Message an lts-worker-queue (Self-Trigger)
//   NEIN → Sendet Message an completion-queue

// Queue-Metriken checken:
// - ApproximateNumberOfMessages: Wartende Jobs
// - ApproximateNumberOfMessagesNotVisible: In Bearbeitung`,
    highlightLines: [4, 5],
    explanation:
      'Die Queue zeigt dir den aktuellen Arbeitsstand. Viele Messages = viel zu tun. 0 Messages = alles verarbeitet.',
    whyThisMatters: {
      problem: 'Wie weißt du ob der Worker noch arbeitet oder stuck ist?',
      consequence: 'Queue-Metriken sind dein Monitoring: Messages + NotVisible + Delayed = Gesamtbild',
      realWorld: 'CloudWatch Alarm: "ApproximateNumberOfMessages > 1000 für 5 Minuten" → PagerDuty',
    },
    proofFn: () => proofSqsMessageCount('lts-worker-queue'),
    experimentFn: experimentTimeToDLQ,
    experimentConfig: {
      question: 'Eine Message schlägt immer fehl. Wie lange dauert es bis sie in der DLQ landet?',
      hypotheses: [
        'A) Sofort nach dem ersten Fehler',
        'B) Nach 30 Sekunden (Standard-Timeout)',
        'C) visibilityTimeout × maxReceiveCount',
        'D) Das ist nicht vorhersagbar',
      ],
      correctAnswer: 'C',
      ahamoment: 'Zeit bis DLQ = visibilityTimeout × maxReceiveCount - mathematisch exakt vorhersagbar!',
    },
  },
];
