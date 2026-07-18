import React from 'react';
import { Box, Text } from 'ink';
import { PhaseTutorial } from './tutorial.types.js';
import { CodeSnippet } from '../../components/display/CodeSnippet.js';

// E2E Flow Diagramm
const E2EFlowDiagram = () => (
  <Box flexDirection="column" borderStyle="single" borderColor="cyan" padding={1}>
    <Text color="cyan" bold>Der komplette E2E Flow</Text>
    <Box marginY={1} />
    <Text dimColor>┌───────────────────────────────────────────────────────────────────────────────────────┐</Text>
    <Text dimColor>│  <Text color="yellow">1. API Request</Text>                                           │</Text>
    <Text dimColor>│     │                                                                                 │</Text>
    <Text dimColor>│     ▼                                                                                 │</Text>
    <Text dimColor>│  <Text color="green">MarkingStarter</Text> ──▶ DB: Task erstellen                     │</Text>
    <Text dimColor>│     │                                                                                 │</Text>
    <Text dimColor>│     ▼                                                                                 │</Text>
    <Text dimColor>│  <Text color="blue">lts-worker-queue</Text>                                           │</Text>
    <Text dimColor>│     │                                                                                 │</Text>
    <Text dimColor>│     ▼                                                                                 │</Text>
    <Text dimColor>│  <Text color="green">LtsExecutor</Text> ──▶ Batch verarbeiten ──▶ Self-Trigger        │</Text>
    <Text dimColor>│     │              (bis hasMoreWork = false)                                          │</Text>
    <Text dimColor>│     ▼                                                                                 │</Text>
    <Text dimColor>│  <Text color="blue">status-check-queue</Text>                                         │</Text>
    <Text dimColor>│     │                                                                                 │</Text>
    <Text dimColor>│     ▼                                                                                 │</Text>
    <Text dimColor>│  <Text color="green">StatusPoller</Text> ──▶ Poll mit Backoff ──▶ COMPLETED!          │</Text>
    <Text dimColor>└───────────────────────────────────────────────────────────────────────────────────────┘</Text>
  </Box>
);

export const phase5Tutorial: PhaseTutorial = {
  phase: 5,
  title: 'Mission Control: E2E Observability',

  learningObjectives: [
    'Kompletten Workflow End-to-End verfolgen',
    'Correlation IDs als "Staffelstab" verstehen',
    'LiveLogViewer für Echtzeit-Debugging nutzen',
    'Architektur-Entscheidungen nachvollziehen',
    'Die 3 Säulen der Observability kennen',
    'Production Checklist für Serverless',
  ],

  architecture: `
┌────────────────────────────────────────────────────────────────┐
│                    COMPLETE E2E FLOW                           │
│                                                                │
│  Request ──▶ Starter ──▶ Queue ──▶ Worker ──▶ Poller ──▶ Done  │
│                                                                │
│  Jede Lambda hat ihre Rolle:                                   │
│  • Starter: Fan-Out (Task erstellen, Queue triggern)           │
│  • Worker: Self-Triggering (Batches verarbeiten)               │
│  • Poller: Exponential Backoff (Status prüfen)                 │
└────────────────────────────────────────────────────────────────┘
`,

  sections: [
    {
      title: '1. Der E2E Test',
      content: (
        <Box flexDirection="column">
          <Text color="yellow">Jetzt testen wir alles zusammen!</Text>
          <Box marginY={1} />
          <Text>Drücke <Text color="green" bold>[R]</Text> um einen Marking-Job zu starten.</Text>
          <Text>Beobachte im <Text color="green" bold>[L]</Text> LiveLogViewer wie die Nachrichten fließen.</Text>
          <Box marginY={1} />
          <Text color="cyan">Du solltest sehen:</Text>
          <Text dimColor>  1. MARKING_STARTED (MarkingStarter)</Text>
          <Text dimColor>  2. BATCH_PROCESSED (LtsExecutor, mehrfach)</Text>
          <Text dimColor>  3. STATUS_CHECK (StatusPoller, mit steigendem attempt)</Text>
          <Text dimColor>  4. MARKING_COMPLETED (StatusPoller)</Text>
        </Box>
      ),
    },
    {
      title: '2. Der Flow im Detail',
      content: <E2EFlowDiagram />,
    },
    {
      title: '3. 🔥 Das Problem: Log-Chaos ohne Zusammenhang',
      content: (
        <Box flexDirection="column">
          <Text color="red" bold>Stell dir vor: 1000 parallele Jobs laufen...</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="red" paddingX={1}>
            <Box flexDirection="column">
              <Text dimColor>[12:00:01.234] MarkingStarter: Job started, tables: 5</Text>
              <Text dimColor>[12:00:01.235] LtsExecutor: Processing batch, offset: 0</Text>
              <Text dimColor>[12:00:01.236] MarkingStarter: Job started, tables: 3</Text>
              <Text dimColor>[12:00:01.237] StatusPoller: Checking status, attempt: 2</Text>
              <Text dimColor>[12:00:01.238] LtsExecutor: Processing batch, offset: 100</Text>
              <Text dimColor>[12:00:01.239] LtsExecutor: Processing batch, offset: 0</Text>
              <Text dimColor>[12:00:01.240] StatusPoller: Checking status, attempt: 5</Text>
              <Text dimColor>... 10.000+ Zeilen ...</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Text color="red" bold>❓ Welche Log-Zeilen gehören zu WELCHEM Job?</Text>
          <Text color="red">❓ Wo ist der Job der gerade fehlgeschlagen ist?</Text>
          <Text color="red">❓ Wie debugge ich EINEN Request durch 4 Lambdas?</Text>
          <Box marginY={1} />
          <Box borderStyle="double" borderColor="yellow" paddingX={1}>
            <Text color="yellow" bold>Ohne eindeutige Kennung = Debugging-Hölle 🔥</Text>
          </Box>
        </Box>
      ),
    },
    {
      title: '4. 🏃 Die Lösung: Correlation ID als Staffelstab',
      content: (
        <Box flexDirection="column">
          <Text color="green" bold>Eine ID, die durch ALLE Lambdas wandert:</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="green" paddingX={1}>
            <Box flexDirection="column">
              <Text dimColor>[12:00:01.234] correlationId=<Text color="cyan">abc-123</Text> MarkingStarter: Job started</Text>
              <Text dimColor>[12:00:01.235] correlationId=<Text color="yellow">xyz-789</Text> LtsExecutor: Processing</Text>
              <Text dimColor>[12:00:01.236] correlationId=<Text color="cyan">abc-123</Text> LtsExecutor: Processing</Text>
              <Text dimColor>[12:00:01.237] correlationId=<Text color="magenta">def-456</Text> StatusPoller: Checking</Text>
              <Text dimColor>[12:00:01.238] correlationId=<Text color="cyan">abc-123</Text> StatusPoller: COMPLETED!</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Text bold>Jetzt kannst du filtern:</Text>
          <Text dimColor>  correlationId = "abc-123" → Nur DEIN Job!</Text>
          <Box marginY={1} />
          <Text color="yellow" bold>🏃 Wie ein Staffelstab beim Staffellauf:</Text>
          <Box borderStyle="single" borderColor="cyan" paddingX={1}>
            <Box flexDirection="column">
              <Text>Starter: erzeugt correlationId → <Text color="cyan">📦 SQS Message</Text></Text>
              <Text>Worker: liest correlationId → loggt → <Text color="cyan">📦 SQS Message</Text></Text>
              <Text>Poller: liest correlationId → loggt → <Text color="green">✅ Done</Text></Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Text color="cyan">💡 In Production: AWS X-Ray, Datadog, Jaeger machen das automatisch.</Text>
          <Text dimColor>   Hier lernst du das Prinzip dahinter!</Text>
        </Box>
      ),
    },
    {
      title: '5. Deletion - Bereits implementiert!',
      content: (
        <Box flexDirection="column">
          <Box borderStyle="round" borderColor="green" paddingX={1} marginBottom={1}>
            <Text color="green" bold>✅ DeletionStarter ist bereits fertig implementiert!</Text>
          </Box>
          <Text>Warum? Damit der E2E Flow komplett funktioniert.</Text>
          <Box marginY={1} />
          <Text color="yellow">Schau dir den Code an:</Text>
          <Text dimColor>  packages/deletion-starter-lambda/src/interfaces/lambda-handler.ts</Text>
          <Box marginY={1} />
          <Text>Du wirst sehen: Es ist <Text color="cyan">fast identisch</Text> mit MarkingStarter!</Text>
          <Text dimColor>  • Gleiche Struktur</Text>
          <Text dimColor>  • Gleiche Patterns</Text>
          <Text dimColor>  • Nur taskType = 'deletion' statt 'marking'</Text>
        </Box>
      ),
    },
    {
      title: '6. Architektur-Frage: Warum nicht generisch?',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>🤔 "Warum zwei Lambdas statt einer generischen?"</Text>
          <Box marginY={1} />
          <Text>Gute Frage! Der <Text color="cyan">Worker (LtsExecutor)</Text> IST generisch:</Text>
          <Text dimColor>  → Handled beide taskTypes ('marking' + 'deletion')</Text>
          <Box marginY={1} />
          <Text>Aber die <Text color="cyan">Starter</Text> sind getrennt. Warum?</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="green" paddingX={1}>
            <Box flexDirection="column">
              <Text color="green" bold>✅ Vorteile separater Lambdas:</Text>
              <Text dimColor>  • Single Responsibility - klarer Zweck</Text>
              <Text dimColor>  • Independent Deployment - Marking ändern ohne Deletion</Text>
              <Text dimColor>  • Separate IAM Permissions möglich</Text>
              <Text dimColor>  • Eigene CloudWatch Metriken/Alarme</Text>
              <Text dimColor>  • Unterschiedliches Scaling</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="yellow" paddingX={1}>
            <Box flexDirection="column">
              <Text color="yellow" bold>⚠️ Trade-off:</Text>
              <Text dimColor>  • Mehr Code-Duplizierung</Text>
              <Text dimColor>  • Mehr Lambdas zu verwalten</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Text color="cyan" italic>In Production oft bevorzugt: Isolation {">"} DRY</Text>
        </Box>
      ),
    },
    {
      title: '7. 📝 Hausaufgabe: DeletionStarter selbst bauen',
      content: (
        <Box flexDirection="column">
          <Box borderStyle="double" borderColor="yellow" paddingX={1}>
            <Box flexDirection="column">
              <Text color="yellow" bold>Für nach dem Workshop:</Text>
              <Text>Lösche die DeletionStarter Implementierung und baue sie selbst!</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Text color="cyan" bold>Deine Aufgabe:</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="cyan" paddingX={1}>
            <Box flexDirection="column">
              <Text bold>1. Lösche den Use-Case Code</Text>
              <Text dimColor>   packages/deletion-starter-lambda/src/use-cases/</Text>
              <Box marginY={1} />
              <Text bold>2. Nutze MarkingStarter als Vorlage</Text>
              <Text dimColor>   packages/marking-starter-lambda/src/use-cases/</Text>
              <Box marginY={1} />
              <Text bold>3. Was musst du anpassen?</Text>
              <Text dimColor>   • taskType: 'marking' → <Text color="yellow">'deletion'</Text></Text>
              <Text dimColor>   • Event-Name: MARKING_STARTED → <Text color="yellow">DELETION_STARTED</Text></Text>
              <Text dimColor>   • Sonst: Gleiche Patterns, gleiche Struktur!</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="green" paddingX={1}>
            <Box flexDirection="column">
              <Text color="green" bold>Test-Checkliste:</Text>
              <Text dimColor>□ npm run build im Lambda-Package</Text>
              <Text dimColor>□ cdklocal deploy</Text>
              <Text dimColor>□ Deletion-Job mit [R] starten</Text>
              <Text dimColor>□ In [L] LiveLogViewer: DELETION_STARTED sehen</Text>
              <Text dimColor>□ StatusPoller zeigt COMPLETED</Text>
            </Box>
          </Box>
          <Box marginTop={1}>
            <Text color="green">💡 Das festigt dein Verständnis der Patterns!</Text>
          </Box>
        </Box>
      ),
    },
    {
      title: '8. 🔗 Correlation ID Pattern im Detail',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>So implementiert man Distributed Tracing</Text>
          <Box marginY={1} />
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// 1. Starter: Erzeugt correlationId
const correlationId = crypto.randomUUID();
console.log(JSON.stringify({
  event: 'MARKING_STARTED',
  correlationId,              // [1] Wird geboren
  tables: ['users', 'orders'],
}));

// SQS Message enthält correlationId
await sqs.send({
  MessageBody: JSON.stringify({ correlationId, tableName, ... }),
});

// 2. Worker: Leitet correlationId weiter
export const handler = async (event: SQSEvent) => {
  const { correlationId, tableName } = JSON.parse(event.Records[0].body);

  console.log(JSON.stringify({
    event: 'BATCH_PROCESSED',
    correlationId,            // [2] Weitergereicht
    tableName,
    processedRows: 100,
  }));

  // Self-Trigger mit correlationId
  await sqs.send({
    MessageBody: JSON.stringify({ correlationId, ... }),  // [3]
  });
};`}
          />
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">Was passiert hier?</Text>
            <Text>[1] Starter erzeugt <Text color="cyan">eine</Text> correlationId pro Job</Text>
            <Text>[2] Worker loggt mit gleicher correlationId</Text>
            <Text>[3] Bei Self-Trigger: correlationId wird weitergegeben</Text>
          </Box>
          <Box marginTop={1} borderStyle="single" borderColor="green" padding={1}>
            <Box flexDirection="column">
              <Text color="green" bold>💡 CloudWatch Logs Insights Query:</Text>
              <Text dimColor>fields @timestamp, @message</Text>
              <Text dimColor>| filter correlationId = "abc-123-..."</Text>
              <Text dimColor>| sort @timestamp asc</Text>
              <Text>→ Zeigt <Text color="cyan">alle</Text> Logs eines Jobs chronologisch!</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '9. 📊 Observability: Die 3 Säulen',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Logs + Metrics + Traces = Observability</Text>
          <Box marginY={1} />
          <Text color="cyan" bold>1. Logs (was wir hier nutzen):</Text>
          <Text dimColor>   • Structured JSON Logs</Text>
          <Text dimColor>   • correlationId für Zusammenhang</Text>
          <Text dimColor>   • CloudWatch Logs Insights für Queries</Text>
          <Box marginY={1} />
          <Text color="cyan" bold>2. Metrics (automatisch von Lambda):</Text>
          <Text dimColor>   • Invocations, Duration, Errors</Text>
          <Text dimColor>   • Custom Metrics mit CloudWatch PutMetricData</Text>
          <Text dimColor>   • Alarme bei Schwellwerten</Text>
          <Box marginY={1} />
          <Text color="cyan" bold>3. Traces (in Production):</Text>
          <Text dimColor>   • AWS X-Ray: Automatisches Tracing</Text>
          <Text dimColor>   • Service Map: Visualisierung des Flows</Text>
          <Text dimColor>   • Latenz pro Service sichtbar</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="yellow" padding={1}>
            <Box flexDirection="column">
              <Text color="yellow" bold>🎯 In diesem Workshop:</Text>
              <Text>Fokus auf <Text color="cyan">Logs</Text> (Grundlage für alles)</Text>
              <Text>correlationId = DIY Tracing für Anfänger</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '10. ✅ Production Checklist',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Was fehlt für echtes Production-Ready?</Text>
          <Box marginY={1} />
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// Production Checklist für Lambda + SQS:

// [1] Security
□ Secrets in Secrets Manager (nicht Env Vars)
□ KMS Encryption für SQS Queues
□ VPC wenn DB-Zugriff (private subnets)
□ IAM Least Privilege (grant* statt addPolicy)

// [2] Observability
□ X-Ray Tracing aktiviert (tracing: Tracing.ACTIVE)
□ Custom Metrics für Business KPIs
□ Alarme für DLQ Messages > 0
□ Alarme für Error Rate > 1%

// [3] Resilience
□ Retry-Logik mit Exponential Backoff
□ Circuit Breaker für externe APIs
□ Idempotente Handler (at-least-once!)
□ Graceful Degradation

// 4️⃣ Cost Optimization
□ Reserved Concurrency setzen (Limit)
□ Provisioned Concurrency für latency-kritische
□ Memory Tuning (mehr Memory = schneller = billiger?)
□ SQS Long Polling (weniger API Calls)`}
          />
          <Box marginTop={1} borderStyle="single" borderColor="green" padding={1}>
            <Box flexDirection="column">
              <Text color="green" bold>💡 Dieser Workshop deckt ab:</Text>
              <Text>✅ IAM Basics (grant* Pattern)</Text>
              <Text>✅ Structured Logging</Text>
              <Text>✅ DLQ Handling</Text>
              <Text>✅ Idempotenz</Text>
              <Text>✅ Exponential Backoff</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '11. 🎓 Was du gelernt hast',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Zusammenfassung: CDK + Serverless Patterns</Text>
          <Box marginY={1} />
          <Text color="green" bold>✅ CDK Grundlagen:</Text>
          <Text dimColor>   • Constructs (L1, L2, L3)</Text>
          <Text dimColor>   • Infrastructure as Code</Text>
          <Text dimColor>   • cdklocal für lokale Entwicklung</Text>
          <Box marginY={1} />
          <Text color="green" bold>✅ Lambda Patterns:</Text>
          <Text dimColor>   • Handler Pattern</Text>
          <Text dimColor>   • Worker Pattern (Self-Triggering)</Text>
          <Text dimColor>   • Polling mit Exponential Backoff</Text>
          <Box marginY={1} />
          <Text color="green" bold>✅ SQS Patterns:</Text>
          <Text dimColor>   • Fan-Out (1:N Messages)</Text>
          <Text dimColor>   • Dead Letter Queues</Text>
          <Text dimColor>   • Event Source Mapping</Text>
          <Box marginY={1} />
          <Text color="green" bold>✅ Best Practices:</Text>
          <Text dimColor>   • IAM Least Privilege</Text>
          <Text dimColor>   • Structured Logging</Text>
          <Text dimColor>   • Idempotenz</Text>
          <Text dimColor>   • Correlation IDs</Text>
          <Box marginY={1} />
          <Box borderStyle="double" borderColor="cyan" padding={1}>
            <Text color="cyan" bold>🎉 Gratulation! Du hast den Workshop abgeschlossen!</Text>
          </Box>
        </Box>
      ),
    },
  ],

  hints: [
    {
      level: 1,
      title: 'E2E Flow starten',
      content: 'Drücke [R] im Phase-Screen um einen Marking-Job zu starten. Dann [L] für den LiveLogViewer. Der Job triggert: MarkingStarter → LtsExecutor (mehrere Batches) → StatusPoller.',
    },
    {
      level: 2,
      title: 'Was du sehen solltest',
      content: 'Erwartete Log-Reihenfolge:\n1. MARKING_STARTED (MarkingStarter)\n2. BATCH_PROCESSED × N (LtsExecutor, mit steigendem offset)\n3. STATUS_CHECK × N (StatusPoller, mit steigendem attempt)\n4. MARKING_COMPLETED (StatusPoller)\n\nDer gesamte Flow sollte in ~30 Sekunden durchlaufen.',
    },
  ],

  testingTips: [
    'Starte einen Marking-Job mit [R]',
    'Beobachte die Logs im LiveLogViewer [L]',
    'Achte auf die attempt-Nummern im StatusPoller',
    'Der Flow sollte in ~30 Sekunden durchlaufen',
  ],
};
