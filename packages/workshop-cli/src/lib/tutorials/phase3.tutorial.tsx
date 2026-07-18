import React from 'react';
import { Box, Text } from 'ink';
import { PhaseTutorial } from './tutorial.types.js';
import { CodeSnippet } from '../../components/display/CodeSnippet.js';

// Helper für Pfeile
const ArrowRight = () => <Box paddingX={1}><Text color="gray">➜</Text></Box>;

// Das Diagramm als echte Ink-Komponente (Flexbox statt String!)
const WorkerDiagram = () => (
  <Box flexDirection="column" marginY={1} borderStyle="single" borderColor="gray" padding={1} flexShrink={0}>
    {/* Zeile 1: Der Hauptfluss */}
    <Box flexDirection="row" alignItems="center" justifyContent="center">
      <Box borderStyle="round" borderColor="blue" paddingX={1}>
        <Text>📨 Queue</Text>
      </Box>

      <ArrowRight />

      <Box borderStyle="double" borderColor="magenta" paddingX={1} flexDirection="column" alignItems="center">
        <Text bold>λ Executor</Text>
        <Text dimColor>(100 Rows)</Text>
      </Box>

      <ArrowRight />

      <Box borderStyle="single" borderColor="yellow" paddingX={1}>
        <Text>❓ Mehr?</Text>
      </Box>
    </Box>

    {/* Zeile 2: Die Entscheidungspfade */}
    <Box flexDirection="row" justifyContent="space-evenly" marginTop={1}>

      {/* Pfad JA */}
      <Box flexDirection="column" alignItems="center" paddingX={3}>
        <Text color="green" bold>JA</Text>
        <Text color="green">│</Text>
        <Text color="green">▼</Text>
        <Box borderStyle="single" borderColor="green" paddingX={1}>
          <Text>🔄 Self-Trigger</Text>
        </Box>
      </Box>

      {/* Pfad NEIN */}
      <Box flexDirection="column" alignItems="center" paddingX={3}>
        <Text color="red" bold>NEIN</Text>
        <Text color="red">│</Text>
        <Text color="red">▼</Text>
        <Box borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text>✅ Fertig</Text>
        </Box>
      </Box>
    </Box>
  </Box>
);

export const phase3Tutorial: PhaseTutorial = {
  phase: 3,
  title: 'LtsExecutorLambda - Worker Pattern',

  learningObjectives: [
    'Worker Pattern verstehen',
    'Self-Triggering Lambda implementieren',
    'Batch Processing mit Offset',
    'SQS Message Handling',
    'Idempotenz und Fehlertoleranz',
  ],

  sections: [
    {
      title: '1. Die Architektur',
      content: (
        <Box flexDirection="column">
          <Text>Die Lambda arbeitet wie ein Fließband-Arbeiter:</Text>
          {/* Hier rendern wir jetzt die Komponente statt ASCII Text */}
          <WorkerDiagram />
          <Text>Sie nimmt ein kleines Stück Arbeit, erledigt es, und entscheidet dann:</Text>
          <Text italic color="cyan">"Muss ich nochmal ran oder bin ich fertig?"</Text>
        </Box>
      ),
    },
    {
      title: '2. Das Problem: 15 Minuten Limit',
      content: (
        <Box flexDirection="column">
          <Text color="red" bold>⚠️ AWS Lambda Timeout: max 15 min</Text>
          <Text> </Text>
          <Text>Wenn wir <Text bold>1 Million Zeilen</Text> am Stück verarbeiten, bricht die Lambda ab.</Text>
          <Text>Das Ergebnis: <Text color="red">Datenverlust</Text> oder <Text color="red">Doppelte Verarbeitung</Text>.</Text>
          <Box marginTop={1} marginBottom={1}>
            <Text color="green">Lösung: Wir teilen die Arbeit in kleine Batches (z.B. 100 Zeilen).</Text>
          </Box>
          <Box borderStyle="round" borderColor="yellow" paddingX={1}>
            <Box flexDirection="column">
              <Text color="yellow" bold>💡 Warum Timeout vs. Batch Size?</Text>
              <Text> </Text>
              <Text dimColor>Timeout = 30s, Batch = 100 → Schnelle Iterationen, mehr Cold Starts</Text>
              <Text dimColor>Timeout = 5min, Batch = 10.000 → Weniger Overhead, aber lange Läufe</Text>
              <Text> </Text>
              <Text>Trade-off: <Text color="cyan">Geschwindigkeit</Text> vs. <Text color="cyan">Kosten</Text> vs. <Text color="cyan">Resilienz</Text></Text>
              <Text dimColor>Bei Crash: Kleinere Batches = weniger verlorene Arbeit!</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '3. Batch Processing: Die Mathematik',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>LIMIT und OFFSET verstehen:</Text>
          <Box marginY={1} />
          <CodeSnippet
            language="sql"
            showLineNumbers={false}
            code={`-- Batch 1: Zeile 1-100
SELECT * FROM data LIMIT 100 OFFSET 0

-- Batch 2: Zeile 101-200
SELECT * FROM data LIMIT 100 OFFSET 100

-- Batch 3: Zeile 201-300
SELECT * FROM data LIMIT 100 OFFSET 200`}
          />
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="cyan" paddingX={1}>
            <Box flexDirection="column">
              <Text color="cyan" bold>Wann ist Schluss? (hasMoreWork)</Text>
              <Box marginY={1} />
              <Text>LIMIT = 100, Query gibt 100 zurück → <Text color="green">Mehr Arbeit</Text></Text>
              <Text>LIMIT = 100, Query gibt 73 zurück → <Text color="yellow">Fertig!</Text></Text>
              <Box marginY={1} />
              <CodeSnippet
                language="typescript"
                showLineNumbers={false}
                code={`const BATCH_SIZE = 100;
const rows = await db.query(\`SELECT ... LIMIT \${BATCH_SIZE} OFFSET \${offset}\`);

const hasMoreWork = rows.length === BATCH_SIZE;
const nextOffset = offset + rows.length;`}
              />
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '4. Der Code: Self-Triggering',
      content: (
        <Box flexDirection="column">
          <Text>Am Ende der Verarbeitung prüft die Lambda:</Text>
          <Box marginY={1}>
            <CodeSnippet language="typescript" code={`
if (hasMoreWork) {
  // Rekursion: Sende Message an MICH SELBST
  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.WORKER_QUEUE_URL,
    MessageBody: JSON.stringify({ ...task, offset: nextOffset })
  }));
} else {
  // Fertig: Marker Status updaten
  await db.query('UPDATE backup_markers SET status = $1 WHERE id = $2',
    ['COMPLETED', markerId]);
}
            `} />
          </Box>
        </Box>
      ),
    },
    {
      title: '5. Warum SQS statt rekursiver Aufruf?',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>🔁 Self-Triggering vs. Direkte Rekursion</Text>
          <Box marginY={1} />
          <Text color="red">❌ Direkter Aufruf (schlecht):</Text>
          <Text dimColor>  await lambda.invoke('LtsExecutorLambda', nextBatch)</Text>
          <Text dimColor>  → Bei Crash: Alles weg, kein Retry</Text>
          <Text dimColor>  → Call Stack wächst → Memory-Probleme</Text>
          <Box marginY={1} />
          <Text color="green">✅ SQS Message (gut):</Text>
          <Text dimColor>  await sqs.send(nextBatch)</Text>
          <Text dimColor>  → Bei Crash: SQS hat die Message noch → Auto-Retry!</Text>
          <Text dimColor>  → Jede Lambda startet frisch (Stack = 0)</Text>
          <Box marginY={1} />
          <Text color="cyan">💡 SQS = Persistence Layer. Dein Fortschritt überlebt Crashes.</Text>
        </Box>
      ),
    },
    {
      title: '6. Error Handling + Message Acknowledgment',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Wie weiß SQS ob Lambda erfolgreich war?</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="green" paddingX={1}>
            <Box flexDirection="column">
              <Text color="green" bold>✅ Lambda gibt SUCCESS zurück:</Text>
              <Text>→ SQS LÖSCHT die Message automatisch</Text>
              <Text dimColor>  (Du musst nichts tun! Event Source Mapping erledigt das)</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="red" paddingX={1}>
            <Box flexDirection="column">
              <Text color="red" bold>❌ Lambda wirft Error:</Text>
              <Text>1. SQS behält Message (sie wird wieder "sichtbar")</Text>
              <Text>2. Nach VisibilityTimeout → neue Lambda bekommt sie</Text>
              <Text>3. Nach 3 Fehlversuchen → <Text color="red">Dead Letter Queue</Text></Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Text color="cyan" bold>💡 Das ist "Implicit Acknowledgment":</Text>
          <Text dimColor>Return = ACK (Message weg), Throw = NACK (Message bleibt)</Text>
        </Box>
      ),
    },
    {
      title: '7. Was ist Idempotenz? (Wichtig!)',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Definition: Idempotent = Mehrfach ausführen = gleiches Ergebnis</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="green" paddingX={1}>
            <Box flexDirection="column">
              <Text color="green" bold>✅ Idempotente Operationen:</Text>
              <Text>• <Text color="cyan">SET status = 'DONE'</Text> → 2x ausführen = immer noch 'DONE'</Text>
              <Text>• <Text color="cyan">INSERT ... ON CONFLICT DO NOTHING</Text> → Duplikat wird ignoriert</Text>
              <Text>• <Text color="cyan">DELETE WHERE id = 5</Text> → Nochmal löschen tut nichts</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="red" paddingX={1}>
            <Box flexDirection="column">
              <Text color="red" bold>❌ NICHT Idempotente Operationen:</Text>
              <Text>• <Text color="cyan">counter = counter + 1</Text> → 2x = falscher Wert!</Text>
              <Text>• <Text color="cyan">INSERT INTO ...</Text> (ohne ON CONFLICT) → Duplikat!</Text>
              <Text>• <Text color="cyan">balance = balance - 100</Text> → Doppelte Abbuchung!</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Text color="yellow" bold>Warum ist das bei Lambda+SQS wichtig?</Text>
          <Text dimColor>SQS garantiert "at-least-once" delivery - Messages können mehrfach kommen!</Text>
          <Text dimColor>Bei Crash/Retry: Worker startet von vorn mit gleicher Message.</Text>
          <Box marginY={1} />
          <Text color="cyan">💡 Regel: Mach alle DB-Operationen idempotent!</Text>
        </Box>
      ),
    },
    {
      title: '8. Unit Test verstehen (Fix the Bug!)',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>🧪 Worker-Pattern testen</Text>
          <Box marginY={1} />
          <Text>Öffne: <Text color="cyan">src/__tests__/execute-marking-task.use-case.test.ts</Text></Text>
          <Box marginY={1} />
          <Text>Das Skeleton testet zwei Szenarien:</Text>
          <Text dimColor>  1. hasMoreWork = true → mehr Arbeit vorhanden</Text>
          <Text dimColor>  2. hasMoreWork = false → alles erledigt</Text>
          <Box marginY={1} />
          <Text>Fülle die TODOs aus, dann: <Text color="green">pnpm test</Text></Text>
          <Box marginY={1} />
          <Text color="cyan">💡 Lernziel: Mock konfigurieren für verschiedene Szenarien!</Text>
        </Box>
      ),
    },
    {
      title: '9. Visibility Timeout vs Lambda Timeout',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>⏱️ Die "Zombie Lambda" Falle</Text>
          <Box marginY={1} />
          <Text>Lambda Timeout: <Text color="cyan">30 Sekunden</Text></Text>
          <Text>Visibility Timeout: <Text color="red">20 Sekunden</Text> ← FALSCH!</Text>
          <Box marginY={1} />
          <Text color="red">Was passiert?</Text>
          <Text dimColor>  1. Lambda startet, verarbeitet Message</Text>
          <Text dimColor>  2. Nach 20s: SQS denkt "Lambda tot" → Message wieder sichtbar</Text>
          <Text dimColor>  3. ZWEITE Lambda startet mit GLEICHER Message!</Text>
          <Text dimColor>  4. Nach 30s: BEIDE Lambdas fertig → Doppelte Verarbeitung</Text>
          <Box marginY={1} />
          <Text color="green">Regel: VisibilityTimeout ≥ 6 × LambdaTimeout</Text>
        </Box>
      ),
    },
    {
      title: '10. Wer pollt die Queue? (Event Source Mapping)',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>🎣 Das Geheimnis der SQS-Trigger</Text>
          <Box marginY={1} />
          <Text>NICHT dein Code pollt! Sondern:</Text>
          <Text color="cyan" bold>  → AWS Lambda Service (Event Source Mapping)</Text>
          <Box marginY={1} />
          <Text>Was ESM tut:</Text>
          <Text dimColor>  1. Pollt Queue alle ~20 Sekunden</Text>
          <Text dimColor>  2. Sammelt bis zu <Text color="cyan">batchSize</Text> Messages</Text>
          <Text dimColor>  3. Ruft Lambda mit Records[] Array auf</Text>
          <Text dimColor>  4. Löscht Messages nach SUCCESS</Text>
          <Box marginY={1} />
          <Text color="cyan">💡 batchSize=1 → 1 Message pro Lambda</Text>
          <Text color="cyan">   batchSize=10 → 10 Messages pro Lambda</Text>
        </Box>
      ),
    },
    {
      title: '11. Partial Batch Failure',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>⚠️ Was wenn 1 von 10 Messages fehlschlägt?</Text>
          <Box marginY={1} />
          <Text color="red">Standard-Verhalten (ohne Config):</Text>
          <Text dimColor>  batchSize=10 → 1 Message fehlerhaft</Text>
          <Text dimColor>  → ALLE 10 Messages werden zurückgestellt!</Text>
          <Text dimColor>  → 9 gute Messages werden nochmal verarbeitet</Text>
          <Box marginY={1} />
          <Text color="green">Mit ReportBatchItemFailures:</Text>
          <Text dimColor>  → Nur fehlgeschlagene Message wird zurückgestellt</Text>
          <Text dimColor>  → 9 gute Messages sind erledigt</Text>
          <Box marginY={1} />
          <Text color="cyan">💡 Wir nutzen batchSize=1 → Problem existiert nicht!</Text>
          <Text dimColor>   Aber: Wissen für Prod wichtig bei größeren Batches.</Text>
        </Box>
      ),
    },
    {
      title: '12. 🔐 Worker Security (IAM)',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Least Privilege für Worker</Text>
          <Box marginY={1} />
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// CDK: Worker bekommt nur was er braucht
const ltsExecutor = new NodejsFunction(this, 'LtsExecutor', { ... });

// ✅ Receive + Delete für Input-Queue (Event Source)
ltsWorkerQueue.grantConsumeMessages(ltsExecutor);  // [1]

// ✅ Send für Self-Trigger (neue Message an sich selbst)
ltsWorkerQueue.grantSendMessages(ltsExecutor);     // [2]

// ✅ Send für Completion Queue (Fertigmeldung)
completionQueue.grantSendMessages(ltsExecutor);    // [3]

// ❌ NICHT: queue.grant(lambda, 'sqs:*')
// → Zu viele Rechte! PurgeQueue wäre möglich!`}
          />
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">Was passiert hier?</Text>
            <Text>[1] <Text color="cyan">grantConsumeMessages</Text> = ReceiveMessage + DeleteMessage</Text>
            <Text>[2] <Text color="cyan">grantSendMessages</Text> = SendMessage (Self-Trigger)</Text>
            <Text>[3] Separate Queue für Completion = <Text color="green">Audit Trail</Text></Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color="red" bold>⚠️ SQS Message Encryption</Text>
            <Text>In Production: <Text color="cyan">encryption: sqs.QueueEncryption.KMS</Text></Text>
            <Text dimColor>→ Messages sind verschlüsselt at rest</Text>
            <Text dimColor>→ Lambda braucht dann auch KMS:Decrypt</Text>
          </Box>
        </Box>
      ),
    },
    {
      title: '13. 💾 Database Connection Security',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Credentials richtig handhaben</Text>
          <Box marginY={1} />
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// ❌ FALSCH: Credentials in Environment Variables
environment: {
  DB_PASSWORD: 'supersecret123',  // Im CloudFormation SICHTBAR!
}

// ✅ RICHTIG: AWS Secrets Manager
const dbSecret = secretsmanager.Secret.fromSecretNameV2(
  this, 'DbSecret', 'prod/db/credentials'
);

const lambda = new NodejsFunction(this, 'Worker', {
  environment: {
    DB_SECRET_ARN: dbSecret.secretArn,  // Nur der ARN
  },
});

// Lambda darf das Secret lesen:
dbSecret.grantRead(lambda);`}
          />
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">Lambda Code:</Text>
            <Text dimColor>const secret = await secretsManager.getSecretValue(&#123;</Text>
            <Text dimColor>  SecretId: process.env.DB_SECRET_ARN</Text>
            <Text dimColor>&#125;);</Text>
            <Text dimColor>const credentials = JSON.parse(secret.SecretString);</Text>
          </Box>
          <Box marginTop={1} borderStyle="single" borderColor="green" padding={1}>
            <Box flexDirection="column">
              <Text color="green" bold>💡 LocalStack vs. Production</Text>
              <Text>Wir nutzen Env Vars weil: <Text color="cyan">Lokale Entwicklung</Text></Text>
              <Text>In AWS: <Text color="yellow">IMMER</Text> Secrets Manager oder SSM Parameter Store!</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
  ],

  hints: [
    {
      level: 1,
      title: 'SQS Event Parsen',
      content: 'Das `event` Objekt hat ein Array `Records`. Du musst `JSON.parse(record.body)` aufrufen, um an deine Daten zu kommen.',
    },
    {
      level: 2,
      title: 'Reschedule Helper',
      content: `Datei: packages/queue-adapter-sqs/src/queue-adapter-sqs.ts

Nutze die fertige Funktion \`rescheduleSelf\` aus \`queue-adapter-sqs\`.
Import: import { QueueAdapterSqs } from 'queue-adapter-sqs';
Sie nimmt den SQS Client und die Queue URL.`,
    },
    {
      level: 3,
      title: 'Batch Logic + hasMoreWork',
      content: `Datei: packages/lts-executor-lambda/src/application/use-cases/execute-marking-task.use-case.ts

SQL: SELECT * FROM table LIMIT 100 OFFSET ?
Das Offset kommt aus der Message (processedRows).

hasMoreWork Logik:
const BATCH_SIZE = 100;
const hasMoreWork = rows.length === BATCH_SIZE;

Wenn rows.length < BATCH_SIZE → Letzte Seite erreicht!`,
    },
  ],

  testingTips: [
    'Sende eine Test-Message via AWS CLI an die Queue',
    'Beobachte die Logs: `npm run workshop logs LtsExecutor`',
    'Du solltest sehen, wie die `processedRows` hochzählen',
  ],
};
