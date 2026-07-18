import React from 'react';
import { Box, Text } from 'ink';
import { PhaseTutorial } from './tutorial.types.js';
import { CodeSnippet } from '../../components/display/CodeSnippet.js';

export const phase4Tutorial: PhaseTutorial = {
  phase: 4,
  title: 'StatusPollerLambda - Polling Pattern',

  learningObjectives: [
    'Exponential Backoff verstehen',
    'Polling Pattern implementieren',
    'Status Checking Best Practices',
    'MessageDelaySeconds nutzen',
    'CloudWatch Alarms einrichten',
    'DLQ Redrive Workflow beherrschen',
  ],

  architecture: `
┌──────────────┐
│ completion-  │ Message: { markerId, tableName }
│    queue     │
└──────┬───────┘
       │ (SQS Event Source)
       ▼
┌──────────────┐
│StatusPoller  │ 1. Check: Backup job status in DB
│   Lambda     │ 2. Status = SUCCESS? → Done
└──────┬───────┘ 3. Status = PENDING? → Retry with backoff
       │
       ├─ Done? ──┐
       │          │
       │ No       │ Yes
       ▼          ▼
┌──────────────┐ ┌──────────────┐
│status-check- │ │   FINISHED   │
│   queue      │ │  (Log it!)   │
│ (with delay!)│ └──────────────┘
└──────────────┘
  DelaySeconds: 5 × 2^attempt (max 300)
  (5s, 10s, 20s, 40s, ...)
`,

  sections: [
    {
      title: '1. Warum Polling? Das asynchrone Problem',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>⏱️ Das Problem verstehen:</Text>
          <Box marginY={1} />
          <Text>Der Worker (LtsExecutor) läuft <Text color="cyan">asynchron</Text>.</Text>
          <Text>Er könnte 10 Sekunden oder 10 Minuten brauchen.</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="red" paddingX={1}>
            <Box flexDirection="column">
              <Text color="red" bold>❌ Warum können wir nicht warten?</Text>
              <Text>• Lambda hat max 15 min Timeout</Text>
              <Text>• Synchron blockieren = Ressourcen verschwenden</Text>
              <Text>• Bei 100 Jobs parallel: 100 Lambdas warten = 💸</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="green" paddingX={1}>
            <Box flexDirection="column">
              <Text color="green" bold>✅ Lösung: Polling (regelmäßig fragen)</Text>
              <Text>"Bist du fertig?" → Nein → Warte → Frag nochmal</Text>
              <Text dimColor>Event-driven statt blocking!</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '2. Exponential Backoff - Warum?',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>📈 Warum nicht einfach jede Sekunde pollen?</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="cyan" paddingX={1}>
            <Box flexDirection="column">
              <Text color="cyan" bold>Kostenrechnung bei 1000 Jobs:</Text>
              <Box marginY={1} />
              <Text>Konstant (1s): 1000 Jobs × 60s × 10min = <Text color="red">600.000 Polls</Text></Text>
              <Text>Exponential:   1000 Jobs × ~10 Polls   = <Text color="green">10.000 Polls</Text></Text>
              <Box marginY={1} />
              <Text bold color="green">→ 98% weniger API-Calls = 98% weniger Kosten!</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Text color="yellow" bold>Formel: 5s × 2^attempt (mit Maximum 300s)</Text>
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// So macht es calculateBackoffDelay() aus 'queue-adapter-sqs':
const delay = Math.min(300, Math.pow(2, attempt) * 5); // 5, 10, 20, 40... max 300

await sqs.send(new SendMessageCommand({
  QueueUrl: statusCheckQueueUrl,
  MessageBody: JSON.stringify({ taskId, attempt: attempt + 1 }),
  DelaySeconds: delay  // SQS-Limit wäre 900s (15 min)
}));`}
          />
          <Box marginTop={1}>
            <Text dimColor>Auch "Thundering Herd" Problem gelöst: Polls verteilen sich über Zeit</Text>
          </Box>
        </Box>
      ),
    },
    {
      title: '3. Status Checking',
      content: (
        <Box flexDirection="column">
          <Text color="yellow">✅ Status-Logik:</Text>
          <Box marginY={1} />
          <Text dimColor>const marker = await db.query(</Text>
          <Text dimColor>  'SELECT status FROM backup_markers WHERE id = $1',</Text>
          <Text dimColor>  [markerId]</Text>
          <Text dimColor>);</Text>
          <Box marginY={1} />
          <Text>if (status === <Text color="green">'SUCCESS'</Text>) &#123;</Text>
          <Text dimColor>  console.log('Backup completed!');</Text>
          <Text dimColor>  return; // Done!</Text>
          <Text>&#125; else if (status === <Text color="yellow">'PENDING'</Text>) &#123;</Text>
          <Text dimColor>  // Send to status-check-queue with backoff</Text>
          <Text>&#125;</Text>
        </Box>
      ),
    },
    {
      title: '4. Warum JSON Logs?',
      content: (
        <Box flexDirection="column">
          <Text color="yellow">📊 Structured Logging = Observability</Text>
          <Box marginY={1} />
          <Box borderStyle="round" borderColor="red" paddingX={1} marginBottom={1}>
            <Box flexDirection="column">
              <Text color="red">❌ Schlechtes Logging:</Text>
              <Text dimColor>console.log("Processing job " + jobId);</Text>
              <Text dimColor>console.log("Attempt: " + attempt);</Text>
              <Text color="gray" italic>→ Nicht filterbar, nicht aggregierbar</Text>
            </Box>
          </Box>
          <Box borderStyle="round" borderColor="green" paddingX={1}>
            <Box flexDirection="column">
              <Text color="green">✅ Structured Logging:</Text>
              <Text dimColor>console.log(JSON.stringify(&#123;</Text>
              <Text dimColor>  event: "STATUS_CHECK",</Text>
              <Text dimColor>  jobId: "abc-123",</Text>
              <Text dimColor>  attempt: 3,</Text>
              <Text dimColor>  nextDelaySeconds: 20</Text>
              <Text dimColor>&#125;));</Text>
              <Text color="gray" italic>→ CloudWatch Insights: filter @message like /STATUS_CHECK/</Text>
            </Box>
          </Box>
          <Box marginTop={1}>
            <Text>In <Text color="cyan">Phase 5 (Log Quest)</Text> nutzt du genau diese Logs!</Text>
          </Box>
        </Box>
      ),
    },
    {
      title: '5. DLQ Debugging & Redrive',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>💀 Message in der DLQ - und jetzt?</Text>
          <Box marginY={1} />
          <Text color="cyan">1. Debuggen:</Text>
          <Text dimColor>  aws sqs receive-message --queue-url DLQ_URL</Text>
          <Text dimColor>  → Schaue MessageBody + Attributes</Text>
          <Box marginY={1} />
          <Text color="cyan">2. Fehler fixen:</Text>
          <Text dimColor>  → Bug im Code? → Deploy Fix</Text>
          <Text dimColor>  → Daten-Problem? → Daten korrigieren</Text>
          <Box marginY={1} />
          <Text color="cyan">3. Redrive (zurückspielen):</Text>
          <Text dimColor>  AWS Console → DLQ → "Start DLQ redrive"</Text>
          <Text dimColor>  ODER: Message manuell an Original-Queue senden</Text>
          <Box marginY={1} />
          <Text color="red">⚠️ Nie blind redriven! Erst Fehler verstehen!</Text>
        </Box>
      ),
    },
    {
      title: '6. Poison Pills',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>💊 Die "Poison Pill" - Ein gefährliches Pattern</Text>
          <Box marginY={1} />
          <Text>Eine Message, die <Text color="red">IMMER</Text> zum Crash führt:</Text>
          <Text dimColor>  → Ungültige JSON-Struktur</Text>
          <Text dimColor>  → Fehlende Pflichtfelder</Text>
          <Text dimColor>  → Unmögliche Daten (z.B. negative ID)</Text>
          <Box marginY={1} />
          <Text color="red">❌ Ohne DLQ:</Text>
          <Text dimColor>  → Infinite Retry Loop</Text>
          <Text dimColor>  → Worker blockiert für immer</Text>
          <Text dimColor>  → Andere Messages stauen sich</Text>
          <Box marginY={1} />
          <Text color="green">✅ Mit DLQ:</Text>
          <Text dimColor>  → Nach maxReceiveCount (3x) → DLQ</Text>
          <Text dimColor>  → Worker kann andere Messages verarbeiten</Text>
          <Box marginY={1} />
          <Text color="cyan">💡 DLQ = Schutz vor Poison Pills!</Text>
        </Box>
      ),
    },
    {
      title: '7. 🚨 CloudWatch Alarms',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Wann sollst du geweckt werden?</Text>
          <Box marginY={1} />
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// CDK: Alarm wenn DLQ Messages bekommt
new cloudwatch.Alarm(this, 'DlqAlarm', {
  metric: dlq.metricApproximateNumberOfMessagesVisible(),
  threshold: 1,                    // [1]
  evaluationPeriods: 1,            // [2]
  alarmDescription: 'Messages in DLQ! Check logs!',
});

// Alarm bei zu vielen Errors:
new cloudwatch.Alarm(this, 'PollerErrorAlarm', {
  metric: pollerLambda.metricErrors(),
  threshold: 5,                    // [3]
  evaluationPeriods: 3,
  alarmDescription: 'StatusPoller hat zu viele Fehler',
});`}
          />
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">Was passiert hier?</Text>
            <Text>[1] <Text color="cyan">threshold: 1</Text> = Alarm schon bei 1 Message in DLQ</Text>
            <Text>[2] <Text color="cyan">evaluationPeriods</Text> = Wie oft muss Bedingung erfüllt sein</Text>
            <Text>[3] <Text color="cyan">threshold: 5</Text> = Erst bei 5 Errors alarm (weniger noise)</Text>
          </Box>
          <Box marginTop={1} borderStyle="single" borderColor="green" padding={1}>
            <Box flexDirection="column">
              <Text color="green" bold>💡 In Production:</Text>
              <Text>→ SNS Topic für Notifications</Text>
              <Text>→ PagerDuty/Slack Integration</Text>
              <Text>→ Runbook-Link im alarmDescription</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '8. ARN Format verstehen',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Was ist eine ARN?</Text>
          <Box marginY={1} />
          <Text>ARN = <Text color="cyan">Amazon Resource Name</Text> = Eindeutige ID für jede AWS-Ressource</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="cyan" paddingX={1}>
            <Box flexDirection="column">
              <Text color="cyan" bold>Format:</Text>
              <Text dimColor>arn:aws:SERVICE:REGION:ACCOUNT:RESOURCE</Text>
              <Box marginY={1} />
              <Text>Beispiel SQS Queue:</Text>
              <Text color="green">arn:aws:sqs:eu-central-1:123456789:my-queue</Text>
              <Box marginY={1} />
              <Text dimColor>  arn:aws = Prefix (immer gleich)</Text>
              <Text dimColor>  sqs = Service (SQS, Lambda, S3...)</Text>
              <Text dimColor>  eu-central-1 = Region</Text>
              <Text dimColor>  123456789 = Account ID</Text>
              <Text dimColor>  my-queue = Resource Name</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Text color="yellow">LocalStack ARNs:</Text>
          <Text dimColor>Account ID = 000000000000 (immer Nullen)</Text>
          <Text dimColor>Region = us-east-1 (Default)</Text>
        </Box>
      ),
    },
    {
      title: '9. ♻️ DLQ Redrive Workflow',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Der Weg einer Message - und wie man sie zurückholt</Text>
          <Box marginY={1} />
          <Text>
{`Message → Queue → Lambda holt → In Flight
                                    │
                              ┌─────┴─────┐
                             OK         Fehler
                              │           │
                           Deleted    receiveCount +1
                                          │
                                    ┌─────┴─────┐
                                   <3x        =3x
                                    │           │
                                  Retry       DLQ`}
          </Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="cyan" paddingX={1}>
            <Box flexDirection="column">
              <Text color="cyan" bold>💡 visibilityTimeout muss LÄNGER sein als Lambda-Timeout!</Text>
              <Text dimColor>Sonst: Message wird sichtbar während Lambda noch läuft.</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <CodeSnippet
            language="bash"
            showLineNumbers={false}
            code={`# Option 1: AWS Start Message Move Task (empfohlen)
awslocal sqs start-message-move-task \\
  --source-arn arn:aws:sqs:us-east-1:000000000000:lts-worker-dlq \\
  --destination-arn arn:aws:sqs:us-east-1:000000000000:lts-worker-queue

# Option 2: Manuell einzeln (für Debugging)
awslocal sqs receive-message --queue-url http://localhost:4566/000000000000/lts-worker-dlq`}
          />
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">Wann Redrive?</Text>
            <Text color="green">✅ Bug gefixt → Messages nochmal verarbeiten</Text>
            <Text color="green">✅ Externe Abhängigkeit wieder da → Retry</Text>
            <Text color="red">❌ NICHT bei Poison Pills → würden wieder fehlschlagen!</Text>
          </Box>
        </Box>
      ),
    },
  ],

  hints: [
    {
      level: 1,
      title: 'Message Structure',
      content: 'Message sollte haben: { markerId, tableName, attempt: number }',
    },
    {
      level: 2,
      title: 'SQS Delay',
      content: 'DelaySeconds ist ein Parameter von SendMessageCommand. Max = 900 Sekunden (15 min)',
    },
    {
      level: 3,
      title: 'Complete Code Pattern',
      content: `1. Parse message: taskId, attempt
2. Status holen: getMarkingStatus(taskId) → lts.marking_tasks
3. if (status === 'COMPLETED'):
     - Completion Event senden, Return (Message wird gelöscht!)
4. if (status === 'FAILED'):
     - Error werfen → Retry → DLQ
5. if (status === 'IN_PROGRESS'):
     - Delay: calculateBackoffDelay(attempt) = min(300, 5 × 2^attempt)
     - Neue Message mit attempt + 1 und DelaySeconds senden`,
    },
  ],

  testingTips: [
    'Simuliere laufenden Task: UPDATE lts.marking_tasks SET status = \'IN_PROGRESS\' WHERE id = 1',
    'Watch: Logs sollten steigende Delays zeigen (attempt: 1 → 5s, attempt: 2 → 10s)',
    'Abschließen: UPDATE lts.marking_tasks SET status = \'COMPLETED\' WHERE id = 1',
    'Verify: Polling stoppt, Completion Event in der completion-queue',
  ],
};
