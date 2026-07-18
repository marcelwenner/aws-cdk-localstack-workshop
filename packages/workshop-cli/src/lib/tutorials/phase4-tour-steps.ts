/**
 * Phase 4 Tour Steps
 *
 * Interactive tour for Phase 4: StatusPollerLambda - Polling Pattern
 * Demonstrates exponential backoff, DLQ handling, and monitoring.
 */

import type { TourStep } from '../../components/display/InteractiveCodeTour.js';
import {
  proofSqsQueueAttributes,
  proofDlqStatus,
  proofSqsMessageCount,
  proofLambdaEnv,
  experimentBackoffComparison,
  experimentDlqRedrive,
} from '../tour-helpers.js';
import { workshopConfig } from '../../core/config/workshop.config.js';

export const phase4TourSteps: TourStep[] = [
  {
    title: 'Status Check Queue',
    file: 'cdk/lib/workshop-stack.ts',
    code: `const statusCheckQueue = new sqs.Queue(this, 'StatusCheckQueue', {
  queueName: 'status-check-queue',
  visibilityTimeout: cdk.Duration.seconds(60),
  deadLetterQueue: {
    queue: statusCheckDlq,
    maxReceiveCount: 5,  // Mehr Retries erlaubt (Polling!)
  },
});`,
    highlightLines: [3, 6],
    explanation:
      'Die StatusCheckQueue hat mehr maxReceiveCount (5 statt 3), weil Polling naturgemäß mehrere Versuche braucht.',
    whyThisMatters: {
      problem: 'Polling bedeutet: "Ist es schon fertig?" - oft mehrmals hintereinander',
      consequence: 'Mit maxReceiveCount=3 landet die Message nach 3x "noch nicht fertig" in der DLQ',
      realWorld: 'Polling-Jobs können Minuten bis Stunden dauern - 5+ Retries sind normal',
    },
    commonMistake: {
      wrong: 'maxReceiveCount: 3 für Polling (wie bei Worker)',
      why: 'Polling ist kein Fehler - es ist ERWARTETES Verhalten. Zu wenig Retries = false positives in DLQ',
      fix: 'maxReceiveCount: 5-10 für Polling-Queues, kombiniert mit DelaySeconds',
    },
    proofFn: () => proofSqsQueueAttributes('status-check-queue'),
  },
  {
    title: 'StatusPoller Environment',
    file: 'cdk/lib/workshop-stack.ts',
    code: `const statusPollerLambda = new NodejsFunction(this, 'StatusPoller', {
  entry: 'packages/status-poller-lambda/src/index.ts',
  environment: {
    STATUS_CHECK_QUEUE_URL: statusCheckQueue.queueUrl,  // [1]
    DB_HOST: 'postgres',
  },
});

// Self-triggering: Poller sendet an seine eigene Queue
statusCheckQueue.grantSendMessages(statusPollerLambda);  // [2]`,
    highlightLines: [4, 10],
    explanation:
      '[1] Queue URL für DelaySeconds Messages. [2] grantSendMessages für Self-Triggering mit Backoff.',
    whyThisMatters: {
      problem: 'Poller muss sich selbst mit Verzögerung erneut triggern können',
      consequence: 'Ohne Self-Trigger-Permission müsstest du externe Scheduling-Services nutzen',
      realWorld: 'Self-Triggering + DelaySeconds = Serverless Sleep() - elegant und kosteneffizient',
    },
    commonMistake: {
      wrong: 'EventBridge Schedule alle 30 Sekunden statt Self-Triggering',
      why: 'EventBridge triggert ALLE Instanzen gleichzeitig → Thundering Herd. Self-Trigger ist pro Job isoliert.',
      fix: 'Self-Triggering mit DelaySeconds - jeder Job hat seinen eigenen Timer',
    },
    proofFn: () => proofLambdaEnv(workshopConfig.lambdas.StatusPoller),
  },
  {
    title: 'DLQ Status prüfen',
    file: 'packages/status-poller-lambda/src/index.ts',
    code: `// Dead Letter Queues im System:
// - lts-worker-dlq       (für LtsExecutor)
// - status-check-dlq     (für StatusPoller)
//
// Messages in DLQ = Fehler beim Verarbeiten
// Sollte normalerweise 0 sein!`,
    highlightLines: [5],
    explanation:
      'DLQs fangen fehlgeschlagene Messages auf. Wenn hier Messages sind, gab es Probleme. Check die Logs!',
    whyThisMatters: {
      problem: 'Ohne DLQ verschwinden fehlgeschlagene Messages nach maxReceiveCount',
      consequence: 'Du siehst nie WARUM etwas fehlgeschlagen ist - Debugging unmöglich',
      realWorld: 'DLQ + CloudWatch Alarm = sofortige Benachrichtigung bei Produktionsfehlern',
    },
    commonMistake: {
      wrong: 'DLQ-Messages sofort redriven ohne Analyse',
      why: 'Wenn der Fehler nicht behoben ist, landen sie wieder in der DLQ - Endlos-Loop!',
      fix: 'Erst CloudWatch Logs checken, Root Cause fixen, DANN redriven',
    },
    proofFn: proofDlqStatus,
    experimentFn: experimentDlqRedrive,
    experimentConfig: {
      question: 'Es sind 5 Messages in der DLQ. Was ist der RICHTIGE nächste Schritt?',
      hypotheses: [
        'A) Sofort alle Messages redriven',
        'B) Messages inspizieren und Fehler debuggen',
        'C) Die Messages löschen',
        'D) Abwarten - sie lösen sich von selbst',
      ],
      correctAnswer: 'B',
      ahamoment: 'Erst debuggen, dann redriven! Blindes Redriven = gleicher Fehler erneut.',
    },
  },
  {
    title: 'Queue Message Count',
    file: 'packages/status-poller-lambda/src/index.ts',
    code: `// StatusCheckQueue Attributes:
// - ApproximateNumberOfMessages: Wartende Messages
// - ApproximateNumberOfMessagesNotVisible: In Bearbeitung
// - ApproximateNumberOfMessagesDelayed: Verzögert (DelaySeconds)
//
// Bei Polling siehst du oft "Delayed" Messages!`,
    highlightLines: [5],
    explanation:
      'Beim Polling Pattern sind viele Messages "Delayed" - das ist normal! Sie warten auf ihren nächsten Check-Zeitpunkt.',
    whyThisMatters: {
      problem: 'Wie unterscheidest du "System arbeitet" von "System steckt fest"?',
      consequence: 'Ohne Verständnis der Metriken interpretierst du "Delayed" als Problem statt als Feature',
      realWorld: 'Dashboard-Regel: Viele Delayed + 0 DLQ = gesundes Polling. 0 Delayed + viele DLQ = Problem!',
    },
    commonMistake: {
      wrong: 'CloudWatch Alarm auf "ApproximateNumberOfMessagesDelayed > 0"',
      why: 'Delayed Messages sind beim Polling ERWÜNSCHT - kein Alarm nötig',
      fix: 'Alarm auf DLQ + auf "Delayed Messages steigen UND verarbeitung stoppt"',
    },
    proofFn: () => proofSqsMessageCount('status-check-queue'),
    experimentFn: experimentBackoffComparison,
    experimentConfig: {
      question: 'Polling alle 5s vs Exponential Backoff (5s, 10s, 20s, 40s...). Was spart mehr über 2 Minuten?',
      hypotheses: [
        'A) Konstant ist effizienter - gleichmäßige Last',
        'B) Kein Unterschied - gleiche Gesamtzeit',
        'C) Backoff spart ca. 50% der Polls',
        'D) Backoff spart ca. 70% der Polls',
      ],
      correctAnswer: 'D',
      ahamoment: 'Exponential Backoff spart 70%+ API-Calls und verhindert Throttling bei vielen gleichzeitigen Jobs!',
    },
  },
];
