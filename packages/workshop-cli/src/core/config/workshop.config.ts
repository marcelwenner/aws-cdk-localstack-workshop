/**
 * Workshop Configuration
 * Single source of truth for all workshop settings
 */

import { LAMBDA_NAMES, QUEUE_NAMES } from '../../shared/constants.js';

// Quiz Types
export type QuizQuestionType = 'multiple-choice' | 'true-false';

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  question: string;
  options: string[];  // For MC: 4 options, for T/F: ['Richtig', 'Falsch']
  correctAnswer: number;  // Index of correct option (0-based)
  explanation: string;  // Shown when WRONG - explains why wrong + what's correct
  praise?: string;  // Optional custom praise for correct answer
}

export interface PhaseQuiz {
  title: string;
  timeLimit: number;  // seconds
  questionPool: QuizQuestion[];  // All available questions
  questionsPerQuiz: number;  // How many to randomly select (e.g. 3)
}

export interface PhaseConfig {
  id: number;
  name: string;
  type: 'intro' | 'core' | 'stretch';
  watchPaths: readonly string[];
  quiz?: PhaseQuiz;  // Optional quiz for this phase
}

export const workshopConfig = {
  aws: {
    region: process.env.AWS_REGION || 'us-east-1', // LocalStack default
    endpoint: process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
    },
  },

  db: {
    postgres: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'longtermstorage',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    },
  },

  docker: {
    composeFile: './local/docker-compose.yml',
  },

  // CDK infrastructure paths (triggers full cdk deploy when changed)
  cdkWatchPaths: ['./cdk/lib/**/*.ts', './cdk/bin/**/*.ts'] as readonly string[],

  timeouts: {
    buildLambda: 30000, // 30s for Lambda build
    sqsWaitTime: 2,     // 2s for SQS long polling
    dbConnection: 5000, // 5s for DB connection
  },

  // Use centralized constants for type safety
  lambdas: LAMBDA_NAMES,
  queues: QUEUE_NAMES,

  phases: [
    {
      id: 0,
      name: 'CDK Grundlagen (Interaktives Tutorial)',
      type: 'intro' as const,
      watchPaths: [] as readonly string[],
      quiz: {
        title: 'CDK Grundlagen Quiz',
        timeLimit: 120,
        questionsPerQuiz: 2,
        questionPool: [
          {
            id: 'p0-q1',
            type: 'multiple-choice',
            question: 'Warum ist `DB_HOST: "postgres"` statt `localhost` notwendig?',
            options: [
              'Docker-DNS löst den Service-Namen zum Postgres-Container auf',
              'Localhost ist in Docker verboten',
              'Performance-Optimierung',
              'AWS Konvention',
            ],
            correctAnswer: 0,
            explanation: 'Lambda läuft IN einem Docker Container (LocalStack). localhost wäre der Lambda-Container selbst. "postgres" ist der Docker-Service-Name - Docker-DNS löst ihn zum richtigen Container im selben Netzwerk auf.',
            praise: 'Genau! Docker Networking verstanden!'
          },
          {
            id: 'p0-q2',
            type: 'multiple-choice',
            question: 'Was ist der Unterschied zwischen `cdk synth` und `cdk deploy`?',
            options: [
              'Synth ist schneller als Deploy',
              'Synth erzeugt CloudFormation (Plan), Deploy wendet es an (Apply)',
              'Synth für Entwicklung, Deploy für Produktion',
              'Kein Unterschied, beides deployed',
            ],
            correctAnswer: 1,
            explanation: 'cdk synth erzeugt nur den Bauplan (CloudFormation Template), es passiert noch nichts. cdk deploy reicht ihn an CloudFormation weiter und baut wirklich. (Für Terraform-Kenner: plan vs. apply.)',
            praise: 'Richtig! Synth = Plan, Deploy = Apply.'
          },
          {
            id: 'p0-q3',
            type: 'multiple-choice',
            question: 'Was ist der Vorteil von L2 Constructs (sqs.Queue) gegenüber L1 (CfnQueue)?',
            options: [
              'L1 ist schneller',
              'L1 ist deprecated',
              'L2 hat sensible Defaults und IAM-Integration',
              'Kein Unterschied',
            ],
            correctAnswer: 2,
            explanation: 'L2 Constructs haben Defaults (Encryption, Retention) und generieren automatisch IAM Policies.',
            praise: 'Exakt! L2 = weniger Code, mehr Sicherheit.'
          },
          {
            id: 'p0-q4',
            type: 'multiple-choice',
            question: 'Warum dauert der erste Lambda-Aufruf länger als der zweite?',
            options: [
              'Netzwerk-Latenz',
              'Database Connection Pool',
              'CDK Compilation',
              'Cold Start: Container wird gestartet',
            ],
            correctAnswer: 3,
            explanation: 'Cold Start = Container-Start + Code-Loading. Danach bleibt der Container "warm" (~15min in AWS).',
            praise: 'Richtig! Cold Start ist der Container-Boot.'
          },
          {
            id: 'p0-q5',
            type: 'multiple-choice',
            question: 'Was macht `queue.grantSendMessages(lambda)` in CDK?',
            options: [
              'Gibt der Lambda NUR sqs:SendMessage Berechtigung',
              'Erstellt die Queue automatisch',
              'Gibt der Lambda alle SQS-Berechtigungen',
              'Verbindet Queue und Lambda per Trigger',
            ],
            correctAnswer: 0,
            explanation: 'grantSendMessages gibt minimale Rechte (nur sqs:SendMessage). Das ist das Least Privilege Principle - Lambda bekommt nur was sie braucht.',
            praise: 'Exakt! grant*-Methoden = automatisches Least Privilege.'
          },
          {
            id: 'p0-q6',
            type: 'multiple-choice',
            question: 'Welche Lambda-Metriken bekommst du automatisch in CloudWatch?',
            options: [
              'Nur Errors',
              'Invocations, Duration, Errors, Throttles',
              'Nur was du explizit loggst',
              'CPU und Memory Usage',
            ],
            correctAnswer: 1,
            explanation: 'Lambda liefert automatisch: Invocations, Duration, Errors, Throttles, ConcurrentExecutions. Für CPU/Memory brauchst du X-Ray.',
            praise: 'Richtig! Diese Basis-Metriken sind gratis dabei.'
          },
        ],
      },
    },
    {
      id: 1,
      name: 'GetTableListLambda verstehen',
      type: 'core' as const,
      watchPaths: ['./packages/get-table-list-lambda/src/**/*.ts'] as readonly string[],
      quiz: {
        title: 'GetTableListLambda Quiz',
        timeLimit: 150,  // 2.5 minutes
        questionsPerQuiz: 3,
        questionPool: [
          {
            id: 'p1-q1',
            type: 'multiple-choice',
            question: 'Welches Pattern verwendet die GetTableListLambda?',
            options: [
              'Database Adapter Pattern',
              'Repository Pattern',
              'Active Record Pattern',
              'Data Mapper Pattern',
            ],
            correctAnswer: 0,
            explanation: 'Die Lambda nutzt das Database Adapter Pattern. Der Adapter kapselt die DB-Logik und macht die Lambda testbar. Repository Pattern würde Domain-Objekte zurückgeben.',
            praise: 'Genau! Das Adapter Pattern trennt Lambda-Logik von DB-Details.'
          },
          {
            id: 'p1-q2',
            type: 'true-false',
            question: 'Strukturierte Logs sollten nur bei Fehlern ausgegeben werden.',
            options: ['Richtig', 'Falsch'],
            correctAnswer: 1,
            explanation: 'Falsch! Strukturierte Logs immer nutzen (auch bei SUCCESS), damit du in CloudWatch nach allen Events filtern kannst.',
            praise: 'Richtig! JSON-Logs ermöglichen CloudWatch Insights Queries.'
          },
          {
            id: 'p1-q3',
            type: 'multiple-choice',
            question: 'Was ist der Vorteil von environment variables in Lambda?',
            options: [
              'Schnellere Ausführung',
              'Konfiguration ohne Code-Änderung (z.B. pro Umgebung)',
              'Mehr Speicherplatz',
              'Bessere Fehlerbehandlung',
            ],
            correctAnswer: 1,
            explanation: 'Environment Variables trennen Konfiguration (z.B. DB-Host) vom Code: derselbe Code läuft in dev/staging/prod. Aber Achtung: Sie werden beim Deploy eingebrannt, eine Änderung braucht trotzdem ein Re-Deploy!',
            praise: 'Exakt! Config statt Code. Aber merke: Änderung = Re-Deploy, ENV Vars sind Deploy-Time.'
          },
          {
            id: 'p1-q4',
            type: 'multiple-choice',
            question: 'Warum nutzt der Code Result<T,E> statt Exceptions zu werfen?',
            options: [
              'Result ist schneller als try/catch',
              'Exceptions funktionieren in Lambdas nicht',
              'Das AWS SDK erfordert Result-Typen',
              'Fehler sind im Rückgabetyp sichtbar und müssen explizit behandelt werden',
            ],
            correctAnswer: 3,
            explanation: 'Result<T,E> macht Fehler zum Teil der Signatur: Der Aufrufer MUSS mit isSuccess() prüfen, der Compiler erinnert ihn daran. Geworfene Exceptions sind unsichtbar und werden gern vergessen.',
            praise: 'Genau! Explizite Fehler im Typ statt unsichtbarer Exceptions.'
          },
          {
            id: 'p1-q5',
            type: 'true-false',
            question: 'Lambda Handler sollten Business-Logik direkt enthalten.',
            options: ['Richtig', 'Falsch'],
            correctAnswer: 1,
            explanation: 'Falsch! Handler ist nur der Einstiegspunkt. Business-Logik gehört in Use Cases/Services für bessere Testbarkeit.',
            praise: 'Genau! Separation of Concerns: Handler ≠ Business-Logik.'
          },
          {
            id: 'p1-q6',
            type: 'multiple-choice',
            question: 'Warum sollte man in Lambda KEINE Connection Pools nutzen?',
            options: [
              'Pools sind langsamer als Einzelverbindungen',
              'Lambda-Instanzen werden eingefroren, Connections bleiben offen',
              'AWS verbietet Connection Pools',
              'Pools funktionieren nur mit MySQL',
            ],
            correctAnswer: 1,
            explanation: 'Lambda-Container werden eingefroren, nicht beendet. Pool-Connections bleiben offen → DB-Limit erreicht! Lösung: Einzelne Connection + client.end() oder RDS Proxy.',
            praise: 'Genau! Lambda + Pools = Zombie-Connections.'
          },
          {
            id: 'p1-q7',
            type: 'multiple-choice',
            question: 'Wann werden Lambda Environment Variables gesetzt?',
            options: [
              'Bei jedem Lambda-Aufruf',
              'Beim Cold Start',
              'Beim Deployment (cdk deploy)',
              'Zur Laufzeit konfigurierbar',
            ],
            correctAnswer: 2,
            explanation: 'ENV Vars sind Teil der Lambda-Konfiguration. Änderung = neues Deployment nötig.',
            praise: 'Genau! Deploy-Time, nicht Runtime.'
          },
        ],
      },
    },
    {
      id: 2,
      name: 'MarkingStarterLambda implementieren',
      type: 'core' as const,
      watchPaths: ['./packages/marking-starter-lambda/src/**/*.ts'] as readonly string[],
      quiz: {
        title: 'MarkingStarterLambda Quiz',
        timeLimit: 150,
        questionsPerQuiz: 3,
        questionPool: [
          {
            id: 'p2-q1',
            type: 'multiple-choice',
            question: 'Was ist das Fan-Out Pattern?',
            options: [
              'Ein Message an viele Empfänger senden',
              'Viele Messages an einen Empfänger',
              'Round-Robin Load Balancing',
              'Priority Queue Routing',
            ],
            correctAnswer: 0,
            explanation: 'Fan-Out: Ein Event wird aufgefächert in viele SQS Messages (eine pro Tabelle). Worker arbeiten parallel.',
            praise: 'Perfekt! Fan-Out ermöglicht parallele Verarbeitung.'
          },
          {
            id: 'p2-q2',
            type: 'true-false',
            question: 'SQS garantiert FIFO-Reihenfolge auch bei Standard-Queues.',
            options: ['Richtig', 'Falsch'],
            correctAnswer: 1,
            explanation: 'Falsch! Standard-Queues garantieren keine Reihenfolge, nur "at-least-once delivery". Für FIFO brauchst du eine .fifo Queue.',
            praise: 'Richtig! Standard = keine Garantie, FIFO = geordnet.'
          },
          {
            id: 'p2-q3',
            type: 'multiple-choice',
            question: 'Warum wird der Task ZUERST in die DB geschrieben und DANN die SQS-Message gesendet?',
            options: [
              'Bessere Performance',
              'SQS braucht die DB-Zeile für das Routing',
              'Bei Crash dazwischen bleibt ein sichtbarer PENDING-Task statt eines crashenden Workers',
              'Die Reihenfolge ist egal',
            ],
            correctAnswer: 2,
            explanation: 'Zwei Systeme, keine gemeinsame Transaktion! Crash nach DB-Insert = verwaister PENDING-Task (sichtbar, aufräumbar). Umgekehrt (SQS zuerst) = Message ohne Task, der Worker crasht. Beides ist nicht perfekt, aber DB-zuerst ist der bewusst gewählte Trade-off.',
            praise: 'Genau! DB zuerst = Fehler bleiben sichtbar statt Worker-Crashes zu produzieren.'
          },
          {
            id: 'p2-q4',
            type: 'multiple-choice',
            question: 'Was passiert bei einem Fehler in einer SQS-getriggerten Lambda?',
            options: [
              'HTTP 500 Response',
              'Retry durch SQS, dann DLQ',
              'Lambda wird neu gestartet',
              'Message wird gelöscht',
            ],
            correctAnswer: 1,
            explanation: 'Async = automatisches Retry durch SQS. Nach maxReceiveCount → Dead Letter Queue.',
            praise: 'Exakt! Async Error Handling = Retry + DLQ.'
          },
        ],
      },
    },
    {
      id: 3,
      name: 'LtsExecutorLambda & Worker Pattern',
      type: 'core' as const,
      watchPaths: ['./packages/lts-executor-lambda/src/**/*.ts'] as readonly string[],
      quiz: {
        title: 'Worker Pattern Quiz',
        timeLimit: 150,
        questionsPerQuiz: 3,
        questionPool: [
          {
            id: 'p3-q1',
            type: 'multiple-choice',
            question: 'Was bedeutet "Self-Triggering" beim Worker Pattern?',
            options: [
              'Lambda startet automatisch bei Deployment',
              'Lambda sendet sich selbst neue Work Messages',
              'Lambda ruft sich selbst rekursiv auf',
              'Lambda nutzt EventBridge Schedule',
            ],
            correctAnswer: 1,
            explanation: 'Self-Triggering: Lambda sendet nach einem Batch eine neue Message an sich selbst (SQS). Worker läuft kontinuierlich.',
            praise: 'Korrekt! Self-Triggering ermöglicht kontinuierliche Arbeit.'
          },
          {
            id: 'p3-q2',
            type: 'multiple-choice',
            question: 'Wann wird eine Message in die Dead Letter Queue (DLQ) verschoben?',
            options: [
              'Nach dem ersten Fehler',
              'Wenn die Lambda crasht',
              'Bei Timeout',
              'Nach maxReceiveCount Retries',
            ],
            correctAnswer: 3,
            explanation: 'SQS verschiebt Messages nach maxReceiveCount (z.B. 3) fehlgeschlagenen Versuchen in die DLQ.',
            praise: 'Richtig! DLQ = maxReceiveCount überschritten.'
          },
          {
            id: 'p3-q3',
            type: 'true-false',
            question: 'OFFSET/LIMIT ist effizienter als Cursor-Based Pagination.',
            options: ['Richtig', 'Falsch'],
            correctAnswer: 1,
            explanation: 'Falsch! OFFSET/LIMIT wird bei großen Offsets langsam. Cursor-Based (WHERE id > last_id) ist schneller. Aber für Backups ok.',
            praise: 'Genau! Cursor-Based > OFFSET/LIMIT bei großen Datasets.'
          },
          {
            id: 'p3-q4',
            type: 'multiple-choice',
            question: 'Warum SQS-Message an sich selbst statt rekursiver Lambda-Aufruf?',
            options: [
              'SQS ist schneller',
              'Rekursion ist in Lambda verboten',
              'Bei Crash geht Message nicht verloren (Retry)',
              'AWS Coding Convention',
            ],
            correctAnswer: 2,
            explanation: 'Bei direkter Rekursion wäre bei Crash alles weg. SQS speichert die Message und redelivert bei Fehler automatisch.',
            praise: 'Genau! SQS = Persistenz + Automatic Retry bei Fehler.'
          },
          {
            id: 'p3-q5',
            type: 'multiple-choice',
            question: 'Worker crasht bei Zeile 500 von 1000. Was passiert bei Retry?',
            options: [
              'Startet wieder bei Zeile 1',
              'Startet bei Zeile 501',
              'Überspringt die Tabelle',
              'Wartet auf manuellen Eingriff',
            ],
            correctAnswer: 0,
            explanation: 'Ohne Checkpoint startet der Worker von vorn. Zeile 1-500 werden doppelt verarbeitet. Das ist OK wenn die Operation idempotent ist!',
            praise: 'Richtig! Idempotenz macht das System robust gegen Crashes.'
          },
          {
            id: 'p3-q6',
            type: 'multiple-choice',
            question: 'Lambda Timeout = 30s. Was sollte Visibility Timeout sein?',
            options: [
              '30 Sekunden (gleich)',
              '20 Sekunden (kürzer)',
              '180 Sekunden (6x)',
              '300 Sekunden (10x)',
            ],
            correctAnswer: 2,
            explanation: 'Regel: VisibilityTimeout ≥ 6 × LambdaTimeout. Sonst: Zombie Lambdas mit Doppelverarbeitung!',
            praise: 'Richtig! VisibilityTimeout muss LÄNGER sein als LambdaTimeout.'
          },
          {
            id: 'p3-q7',
            type: 'true-false',
            question: 'Dein Lambda-Code pollt aktiv die SQS Queue.',
            options: ['Richtig', 'Falsch'],
            correctAnswer: 1,
            explanation: 'Falsch! Der AWS Lambda Service (Event Source Mapping) pollt. Dein Code bekommt fertige Records[].',
            praise: 'Genau! ESM pollt, nicht dein Code.'
          },
          {
            id: 'p3-q8',
            type: 'multiple-choice',
            question: 'Wo sollten DB-Credentials in Production gespeichert werden?',
            options: [
              'In Lambda Environment Variables',
              'Im Code als Konstante',
              'In AWS Secrets Manager',
              'In der package.json',
            ],
            correctAnswer: 2,
            explanation: 'Environment Variables sind im CloudFormation Template sichtbar! Secrets Manager verschlüsselt und rotiert automatisch. Lambda holt Credentials zur Laufzeit.',
            praise: 'Richtig! Secrets Manager = sicher + automatische Rotation.'
          },
        ],
      },
    },
    {
      id: 4,
      name: 'StatusPollerLambda & Polling Pattern',
      type: 'core' as const,
      watchPaths: ['./packages/status-poller-lambda/src/**/*.ts'] as readonly string[],
      quiz: {
        title: 'Polling Pattern Quiz',
        timeLimit: 150,
        questionsPerQuiz: 3,
        questionPool: [
          {
            id: 'p4-q1',
            type: 'multiple-choice',
            question: 'Welche Formel beschreibt Exponential Backoff?',
            options: [
              'delay = baseDelay * attempt',
              'delay = baseDelay * 2^attempt',
              'delay = baseDelay + attempt',
              'delay = baseDelay / attempt',
            ],
            correctAnswer: 1,
            explanation: 'Exponential Backoff: delay = baseDelay * 2^attempt. Beispiel: 5s → 10s → 20s → 40s. Vermeidet "Thundering Herd".',
            praise: 'Exakt! 2^attempt macht exponentielle Verzögerung.'
          },
          {
            id: 'p4-q2',
            type: 'multiple-choice',
            question: 'Was ist das Maximum für SQS DelaySeconds?',
            options: [
              '60 Sekunden',
              '300 Sekunden',
              '900 Sekunden (15 Minuten)',
              '3600 Sekunden (1 Stunde)',
            ],
            correctAnswer: 2,
            explanation: 'SQS DelaySeconds Limit: 900s (15 Min). Für längere Delays Step Functions oder EventBridge Scheduler nutzen.',
            praise: 'Richtig! 900s = 15 Minuten Maximum.'
          },
          {
            id: 'p4-q3',
            type: 'true-false',
            question: 'Polling ist immer schlechter als Event-Driven Architecture.',
            options: ['Richtig', 'Falsch'],
            correctAnswer: 1,
            explanation: 'Falsch! Polling ist sinnvoll für externe APIs ohne Webhooks. Exponential Backoff macht es effizient.',
            praise: 'Genau! Polling hat seine Berechtigung bei externen APIs.'
          },
          {
            id: 'p4-q4',
            type: 'multiple-choice',
            question: 'Warum DelaySeconds statt sleep() in Lambda?',
            options: [
              'sleep() ist in Node.js nicht verfügbar',
              'DelaySeconds ist schneller',
              'Lambda-Kosten: sleep() = bezahlte Wartezeit',
              'AWS Best Practice ohne technischen Grund',
            ],
            correctAnswer: 2,
            explanation: 'sleep() in Lambda = du bezahlst fürs Warten! Mit DelaySeconds endet Lambda sofort, SQS wartet kostenlos.',
            praise: 'Exakt! Lambda-Kosten-Optimierung: Warten in SQS statt Lambda.'
          },
          {
            id: 'p4-q5',
            type: 'multiple-choice',
            question: 'Was verhindert Exponential Backoff bei vielen gleichzeitigen Fehlern?',
            options: [
              'Memory Overflow',
              'DDoS auf eigene Datenbank',
              'Lambda Timeout',
              'SQS Message Limit',
            ],
            correctAnswer: 1,
            explanation: 'Ohne Backoff: 1000 Fehler → 1000 sofortige Retries → DB-Überlastung. Exponential Backoff entzerrt die Last.',
            praise: 'Richtig! Backoff verhindert Thundering Herd / Self-DDoS.'
          },
          {
            id: 'p4-q6',
            type: 'multiple-choice',
            question: 'Wann sollte ein CloudWatch Alarm für die DLQ auslösen?',
            options: [
              'Bei 100+ Messages',
              'Schon bei 1 Message',
              'Nur bei vollen Queues',
              'Nie - DLQ braucht keine Alarme',
            ],
            correctAnswer: 1,
            explanation: 'Messages in DLQ = fehlgeschlagene Verarbeitung = Problem! Schon 1 Message sollte untersucht werden. Threshold: 1, evaluationPeriods: 1.',
            praise: 'Exakt! DLQ > 0 = sofort reagieren.'
          },
          {
            id: 'p4-q7',
            type: 'multiple-choice',
            question: 'Was ist der erste Schritt beim DLQ Redrive?',
            options: [
              'Messages sofort zurückspielen',
              'DLQ leeren',
              'Message analysieren und Fehler verstehen',
              'Lambda neu deployen',
            ],
            correctAnswer: 2,
            explanation: 'Erst verstehen, dann handeln! Blind redriven bei Poison Pills = endlose Fehler. Analysiere MessageBody und Logs zur Fehlerzeit.',
            praise: 'Richtig! Erst debuggen, dann redriven.'
          },
        ],
      },
    },
    {
      id: 5,
      name: 'The Log Quest: Debugging Challenge',
      type: 'core' as const,
      watchPaths: [] as readonly string[],  // Kein Coding, nur Log-Analyse
      quiz: {
        title: 'E2E Observability Quiz',
        timeLimit: 150,
        questionsPerQuiz: 3,
        questionPool: [
          {
            id: 'p5-q1',
            type: 'multiple-choice',
            question: 'Was ist der Zweck einer correlationId?',
            options: [
              'Für bessere Lambda-Performance',
              'AWS braucht sie für Abrechnung',
              'Für die SQS Retry-Logik',
              'Alle Logs einer Request-Kette verknüpfen',
            ],
            correctAnswer: 3,
            explanation: 'correlationId verbindet alle Logs einer Request durch mehrere Services. In CloudWatch: filter correlationId = "abc" zeigt den kompletten Flow.',
            praise: 'Exakt! Distributed Tracing mit correlationId.'
          },
          {
            id: 'p5-q2',
            type: 'multiple-choice',
            question: 'Welche 3 Säulen hat Observability?',
            options: [
              'CPU, Memory, Disk',
              'Logs, Metrics, Traces',
              'Lambda, SQS, DynamoDB',
              'Dev, Staging, Prod',
            ],
            correctAnswer: 1,
            explanation: 'Logs (was passiert), Metrics (wie viel/schnell), Traces (wo im System). Zusammen = vollständiges Bild.',
            praise: 'Richtig! Die 3 Pillars of Observability.'
          },
          {
            id: 'p5-q3',
            type: 'multiple-choice',
            question: 'Warum JSON statt Text-Logs?',
            options: [
              'JSON ist kleiner',
              'AWS akzeptiert nur JSON',
              'CloudWatch Insights kann JSON parsen und filtern',
              'Text-Logs sind deprecated',
            ],
            correctAnswer: 2,
            explanation: 'Structured Logging: CloudWatch Insights kann JSON-Felder extrahieren. Query: fields tableName, duration | filter level = "ERROR"',
            praise: 'Genau! JSON = filterbar und aggregierbar.'
          },
          {
            id: 'p5-q4',
            type: 'multiple-choice',
            question: 'Was fehlt in diesem Workshop für Production-Readiness?',
            options: [
              'Mehr Lambdas',
              'Mehr SQS Queues',
              'X-Ray Tracing und KMS Encryption',
              'Größere Batch-Sizes',
            ],
            correctAnswer: 2,
            explanation: 'Production braucht: X-Ray für echtes Tracing, KMS für Verschlüsselung, Secrets Manager statt Env Vars, Alarme mit SNS Notifications.',
            praise: 'Richtig! Workshop = Grundlagen, Prod braucht mehr.'
          },
          {
            id: 'p5-q5',
            type: 'true-false',
            question: 'In CloudWatch Logs Insights kann man nach correlationId über mehrere Lambda-LogGroups suchen.',
            options: ['Richtig', 'Falsch'],
            correctAnswer: 0,
            explanation: 'Richtig! Man kann mehrere LogGroups gleichzeitig abfragen und mit correlationId den Flow über alle Services verfolgen.',
            praise: 'Exakt! Multi-LogGroup Queries sind möglich.'
          },
        ],
      },
    },
    {
      id: 6,
      name: 'Bonus: DeletionStarterLambda',
      type: 'stretch' as const,
      watchPaths: ['./packages/deletion-starter-lambda/src/**/*.ts'] as readonly string[],
      quiz: {
        title: 'Advanced Concepts Quiz',
        timeLimit: 180,  // 3 minutes for advanced
        questionsPerQuiz: 3,
        questionPool: [
          {
            id: 'p6-q1',
            type: 'multiple-choice',
            question: 'Wie testet man eine Lambda mit DB-Zugriff ohne echte Datenbank?',
            options: [
              'Testdatenbank in Docker starten',
              'Dependency Injection + Mocking des DB-Ports',
              'Direkt in LocalStack testen',
              'Gar nicht - nur Integration Tests',
            ],
            correctAnswer: 1,
            explanation: 'Ports & Adapters Pattern: UseCase bekommt Interface (Port) injiziert. Im Test: Mock-Implementierung. Keine echte DB nötig!',
            praise: 'Exakt! Hexagonale Architektur macht Unit Tests ohne Infrastruktur möglich.'
          },
          {
            id: 'p6-q2',
            type: 'multiple-choice',
            question: 'Wie könnte man das Polling-Pattern durch Event-Driven ersetzen?',
            options: [
              'Mehr Lambdas parallel starten',
              'DB Trigger / CDC → Stream → Lambda',
              'Kürzere Polling-Intervalle',
              'Direkte Lambda-zu-Lambda Aufrufe',
            ],
            correctAnswer: 1,
            explanation: 'Change Data Capture (CDC) streamt DB-Änderungen direkt. Z.B. DynamoDB Streams, PostgreSQL WAL → Kinesis. Kein Polling nötig!',
            praise: 'Genau! CDC eliminiert Polling komplett - Events statt Abfragen.'
          },
          {
            id: 'p6-q3',
            type: 'multiple-choice',
            question: 'Warum ist `cdk synth` wichtig für Debugging?',
            options: [
              'Schneller als cdk deploy',
              'Zeigt das generierte CloudFormation Template',
              'Validiert TypeScript Syntax',
              'Startet LocalStack automatisch',
            ],
            correctAnswer: 1,
            explanation: 'cdk synth zeigt das CloudFormation Template. Du siehst EXAKT was CDK generiert - IAM Policies, Resource Names, etc.',
            praise: 'Richtig! synth = "Was baut CDK unter der Haube?" - essentiell für Debugging.'
          },
          {
            id: 'p6-q4',
            type: 'multiple-choice',
            question: 'Was ist der Hauptvorteil von L2 gegenüber L1 Constructs?',
            options: [
              'Bessere Performance',
              'Weniger CloudFormation Output',
              'Sensible Defaults + automatische IAM Policies',
              'Nur L2 funktioniert mit LocalStack',
            ],
            correctAnswer: 2,
            explanation: 'L2 = High-Level mit Defaults (Encryption, Retention) und Convenience-Methoden (grantRead, grantWrite). L1 = rohe CloudFormation.',
            praise: 'Exakt! L2 = produktiv, L1 = wenn du volle Kontrolle brauchst.'
          },
        ],
      },
    },
  ] as PhaseConfig[],
};

export type WorkshopConfig = typeof workshopConfig;
