import React from 'react';
import { Box, Text } from 'ink';
import { PhaseTutorial } from './tutorial.types.js';
import { CodeSnippet } from '../../components/display/CodeSnippet.js';

export const phase2Tutorial: PhaseTutorial = {
  phase: 2,
  title: 'MarkingStarterLambda implementieren',

  learningObjectives: [
    'Fan-out Pattern verstehen und implementieren',
    'SQS Messages korrekt senden',
    'Backup Markers in PostgreSQL anlegen',
    'Transaction Handling und Fehlerbehandlung',
    'Clean Architecture: Use Case Pattern',
  ],

  architecture: `
┌──────────────┐
│    Event     │  Trigger: API / Workshop-CLI
│   (tables)   │  Input: { jobId, tables: [{ tableName, cutoffDate }] }
└──────┬───────┘
       │
       ▼
┌──────────────┐
│MarkingStarter│  For each table:
│    Lambda    │  1. Task in lts.marking_tasks anlegen (status='PENDING')
└──────┬───────┘  2. Message an lts-worker-queue senden (mit taskId!)
       │
       ├─────────────┐
       ▼             ▼
┌─────────────┐  ┌──────────────┐
│  Postgres   │  │ lts-worker-  │
│marking_tasks│  │    queue     │ (Fan-out: 1 Message pro Tabelle)
└─────────────┘  └──────────────┘
`,

  sections: [
    {
      title: '1. 🌊 Fan-Out Pattern: Was und Warum?',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Das Problem:</Text>
          <Text>Du bekommst eine Liste von 100 Tabellen zum Backup.</Text>
          <Text>Eine Lambda hat max. 15 Minuten - reicht das für alle?</Text>
          <Box marginY={1} />
          <Text color="green" bold>Die Lösung: Fan-Out</Text>
          <Text>
{`
┌─────────────┐
│  Starter    │  1 Trigger (API Call mit 100 Tabellen)
│   Lambda    │
└──────┬──────┘
       │ sendet 100 Messages
       ▼
┌─────────────┐
│    SQS      │  Queue hält alle 100 Messages
│   Queue     │
└──────┬──────┘
       │ triggert parallel
       ▼
┌─────┬─────┬─────┐
│ W1  │ W2  │ ... │  Bis zu 100 Worker parallel!
└─────┴─────┴─────┘
`}
          </Text>
          <Box marginTop={1} borderStyle="single" borderColor="green" padding={1}>
            <Box flexDirection="column">
              <Text color="green" bold>💡 Vorteile des Fan-Out:</Text>
              <Text>• Skaliert automatisch mit der Last</Text>
              <Text>• Jede Tabelle hat eigenes 15-Min Timeout</Text>
              <Text>• Einzelne Fehler stoppen nicht den Rest</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '2. 📨 SQS Message Anatomie',
      content: (
        <Box flexDirection="column">
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// Was du an SQS sendest (so sieht es "roh" im SDK aus):
await sqs.sendMessage({
  QueueUrl: process.env.LTS_WORKER_QUEUE_URL, // [1]
  MessageBody: JSON.stringify({           // [2]
    taskId: 42,
    taskType: 'marking',
    jobId: 'job-456',
    tableName: 'users',
  }),
  MessageAttributes: {                    // [3]
    'correlationId': {
      DataType: 'String',
      StringValue: context.awsRequestId,
    },
  },
  DelaySeconds: 0,                        // [4]
});`}
          />
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">Was passiert hier?</Text>
            <Text>[1] <Text color="cyan">QueueUrl</Text> = Kommt aus Environment Variable (CDK setzt sie)</Text>
            <Text>[2] <Text color="cyan">MessageBody</Text> = MUSS String sein! JSON.stringify nicht vergessen</Text>
            <Text>[3] <Text color="cyan">MessageAttributes</Text> = Metadata für Tracing (correlationId!)</Text>
            <Text>[4] <Text color="cyan">DelaySeconds</Text> = 0 = sofort sichtbar, &gt;0 = verzögert</Text>
          </Box>
          <Box marginTop={1} borderStyle="single" borderColor="cyan" padding={1}>
            <Box flexDirection="column">
              <Text color="cyan" bold>💡 Pro-Tipp: correlationId</Text>
              <Text>Die correlationId ist der "Staffelstab" - sie verbindet</Text>
              <Text>alle Logs einer Anfrage über mehrere Lambdas hinweg!</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '3. 📝 Marking-Task in DB anlegen',
      content: (
        <Box flexDirection="column">
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// Der Use Case ist FERTIG - du rufst ihn nur auf:
const result = await container.startTableMarkingUseCase.execute({
  jobId,                                 // [1]
  tableName: table.tableName,
  cutoffDate: table.cutoffDate,
});

const taskId = result.data.taskId;       // [2]

// Unter der Haube ruft der Postgres-Adapter auf:
//   SELECT * FROM lts.start_table_marking($1, $2, $3)   -- [3]
//   → INSERT INTO lts.marking_tasks (...) RETURNING id  -- [4]`}
          />
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">Was passiert hier?</Text>
            <Text>[1] <Text color="cyan">jobId</Text> = Verbindet alle Tasks eines Durchlaufs</Text>
            <Text>[2] <Text color="cyan">taskId</Text> = Brauchst du für die SQS Message!</Text>
            <Text>[3] <Text color="cyan">$1, $2, $3</Text> = Prepared Statement (SQL Injection safe!)</Text>
            <Text>[4] <Text color="cyan">RETURNING id</Text> = Gibt die generierte ID zurück</Text>
          </Box>
          <Box marginTop={1} borderStyle="single" borderColor="red" padding={1}>
            <Box flexDirection="column">
              <Text color="red" bold>⚠️ Häufiger Fehler: SQL Injection</Text>
              <Text>NIEMALS: <Text strikethrough>{`\`INSERT ... VALUES ('\${tableName}')\``}</Text></Text>
              <Text>IMMER: <Text color="green">{`\`INSERT ... VALUES ($1)\`, [tableName]`}</Text></Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '4. 🔄 Die komplette Schleife',
      content: (
        <Box flexDirection="column">
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// Der Fan-Out Loop im Handler (lambda-handler.ts)
const taskIds: number[] = [];

for (const table of tables) {
  // 1. Task in DB anlegen (Use Case ist fertig!)
  const result = await container.startTableMarkingUseCase.execute({
    jobId,
    tableName: table.tableName,
    cutoffDate: table.cutoffDate,
  });
  if (!isSuccess(result)) {
    throw new Error(\`Marking failed: \${result.error.message}\`);
  }
  const taskId = result.data.taskId;
  taskIds.push(taskId);

  // 2. Message an Queue senden (Queue-Adapter ist fertig!)
  await container.queue.sendMessage(container.workerQueueUrl, {
    taskId,
    taskType: 'marking',
    jobId,
    tableName: table.tableName,
    correlationId,
  });
}

console.log(JSON.stringify({
  event: 'LAMBDA_SUCCEEDED',
  tasksCreated: taskIds.length,
  correlationId,
}));

return { tasksCreated: taskIds.length, taskIds };`}
          />
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">Wichtig:</Text>
            <Text>• Erst DB schreiben, dann SQS senden</Text>
            <Text>• taskId wird im MessageBody mitgegeben (Worker braucht sie!)</Text>
            <Text>• correlationId in Message UND jedem Log-Eintrag</Text>
          </Box>
        </Box>
      ),
    },
    {
      title: '5. ⚠️ Das 2-Phase-Commit Problem',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Das fundamentale Problem verteilter Systeme:</Text>
          <Box marginY={1} />
          <Text>Du musst ZWEI Dinge tun: DB schreiben UND SQS senden.</Text>
          <Text>Aber das sind zwei verschiedene Systeme!</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="red" paddingX={1}>
            <Box flexDirection="column">
              <Text color="red" bold>🤔 Was kann schiefgehen?</Text>
              <Box marginY={1} />
              <Text>Szenario 1: DB zuerst</Text>
              <Text dimColor>  1. INSERT in DB ✅</Text>
              <Text dimColor>  2. SQS sendMessage 💥 CRASH!</Text>
              <Text dimColor>  → Marker in DB, aber keine Message = Task wartet ewig</Text>
              <Box marginY={1} />
              <Text>Szenario 2: SQS zuerst</Text>
              <Text dimColor>  1. SQS sendMessage ✅</Text>
              <Text dimColor>  2. INSERT in DB 💥 CRASH!</Text>
              <Text dimColor>  → Message in Queue, aber kein Marker = Worker crasht</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="green" paddingX={1}>
            <Box flexDirection="column">
              <Text color="green" bold>💡 Unsere Lösung: DB zuerst + Idempotente Worker</Text>
              <Text>1. Erst Marker in DB (haben wir Kontrolle)</Text>
              <Text>2. Dann SQS senden</Text>
              <Text>3. Wenn SQS fehlschlägt → Marker bleibt PENDING</Text>
              <Text>4. Monitoring-Job findet "verwaiste" Marker → Cleanup</Text>
            </Box>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Es gibt keine perfekte Lösung - nur Trade-offs!</Text>
          </Box>
        </Box>
      ),
    },
    {
      title: '6. 🔗 correlationId: Der rote Faden',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Warum brauchst du eine correlationId?</Text>
          <Box marginY={1} />
          <Text>Stell dir vor: 100 Tabellen werden parallel verarbeitet.</Text>
          <Text>Du siehst 500 Log-Einträge von 10 verschiedenen Lambdas.</Text>
          <Text color="red">Welche Logs gehören zur Tabelle "users"?</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="cyan" paddingX={1}>
            <Box flexDirection="column">
              <Text color="cyan" bold>Lösung: correlationId als "Staffelstab"</Text>
              <Box marginY={1} />
              <Text>1. MarkingStarter generiert correlationId = context.awsRequestId</Text>
              <Text>2. Schreibt sie in die SQS Message</Text>
              <Text>3. Worker liest sie aus der Message</Text>
              <Text>4. Schreibt sie in JEDEN Log-Eintrag</Text>
              <Box marginY={1} />
              <Text color="green" bold>→ Suche nach correlationId = Alle Logs dieser Anfrage!</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// Im Starter:
MessageAttributes: {
  'correlationId': {
    DataType: 'String',
    StringValue: context.awsRequestId,  // AWS generiert unique ID
  },
}

// Im Worker:
const correlationId = record.messageAttributes?.correlationId?.stringValue;
console.log(JSON.stringify({ correlationId, message: 'Processing...' }));`}
          />
          <Box marginTop={1}>
            <Text dimColor>In Phase 5 lernst du, wie du damit Probleme debuggst!</Text>
          </Box>
        </Box>
      ),
    },
    {
      title: '7. ⚠️ Error Handling: Partial Success',
      content: (
        <Box flexDirection="column">
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// Pattern: Was passiert bei Teilfehlern?
const results = { success: [], failed: [] };

for (const tableName of tables) {
  try {
    const marker = await db.query(...);
    await sqs.sendMessage(...);
    results.success.push(tableName);
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', tableName, error: error.message,
    }));
    results.failed.push(tableName);
    // NICHT abbrechen! Nächste Tabelle versuchen.
  }
}

// Am Ende: Partial Success oder Full Failure?
if (results.failed.length === tables.length) {
  throw new Error('All tables failed');
}
return results;`}
          />
          <Box marginTop={1} borderStyle="single" borderColor="yellow" paddingX={1}>
            <Box flexDirection="column">
              <Text color="yellow" bold>💡 Design-Entscheidung: Partial Success</Text>
              <Text>Bei 100 Tabellen: Wenn 1 fehlschlägt, die anderen 99 trotzdem machen!</Text>
              <Text dimColor>Alternative: Alles oder nichts → bei 1 Fehler komplett abbrechen</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '8. 🔀 Sync vs Async Lambda-Aufrufe',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Zwei Welten:</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="cyan" padding={1} marginBottom={1}>
            <Box flexDirection="column">
              <Text color="cyan" bold>Synchron (API Gateway → Lambda)</Text>
              <Text>• Client wartet auf Response</Text>
              <Text>• Fehler → direkt 4xx/5xx an Client</Text>
              <Text>• Timeout → 502 Gateway Timeout</Text>
              <Text dimColor>MarkingStarter wird SO aufgerufen!</Text>
            </Box>
          </Box>
          <Box borderStyle="single" borderColor="green" padding={1}>
            <Box flexDirection="column">
              <Text color="green" bold>Asynchron (SQS → Lambda)</Text>
              <Text>• "Fire and forget" - Client bekommt sofort OK</Text>
              <Text>• Fehler → SQS Retry (bis zu 3x)</Text>
              <Text>• Nach 3 Fehlern → Dead Letter Queue</Text>
              <Text dimColor>Worker (LtsExecutor) wird SO getriggert!</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '9. 🏗️ Clean Architecture: Use Case Pattern',
      content: (
        <Box flexDirection="column">
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// Handler (dünn - nur Orchestration)
export const handler = async (event: Event) => {
  const useCase = new StartTableMarkingUseCase(
    new PostgresAdapter(),    // [1] Interface: DatabasePort
    new SqsAdapter(),         // [2] Interface: QueuePort
  );

  const result = await useCase.execute(event.tables);

  return { statusCode: 200, body: JSON.stringify(result) };
};

// Use Case (Business Logic)
export class StartTableMarkingUseCase {
  constructor(
    private db: DatabasePort,   // Abstraction, nicht Konkret!
    private queue: QueuePort,
  ) {}

  async execute(tables: string[]) {
    // ... die ganze Logik von oben
  }
}`}
          />
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">Warum so kompliziert?</Text>
            <Text>[1] <Text color="cyan">DatabasePort</Text> = Interface, nicht PostgresClient direkt</Text>
            <Text>[2] <Text color="cyan">QueuePort</Text> = Interface, nicht SQS direkt</Text>
            <Text bold color="green">→ Testbar ohne echte DB/Queue (Mock-Objekte!)</Text>
          </Box>
        </Box>
      ),
    },
    {
      title: '10. 🧪 Unit Test verstehen',
      content: (
        <Box flexDirection="column">
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// So testest du OHNE Infrastruktur:
describe('StartTableMarkingUseCase', () => {
  it('should create markers and send messages', async () => {
    // 1. Mock-Objekte erstellen
    const mockDb: DatabasePort = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'mock-marker-id' }]
      }),
    };
    const mockQueue: QueuePort = {
      sendMessage: vi.fn().mockResolvedValue({}),
    };

    // 2. Use Case mit Mocks
    const useCase = new StartTableMarkingUseCase(mockDb, mockQueue);

    // 3. Ausführen
    await useCase.execute(['users', 'orders']);

    // 4. Assertions
    expect(mockDb.query).toHaveBeenCalledTimes(2);
    expect(mockQueue.sendMessage).toHaveBeenCalledTimes(2);
  });
});`}
          />
          <Box marginTop={1} borderStyle="single" borderColor="green" padding={1}>
            <Box flexDirection="column">
              <Text color="green" bold>💡 Lernziel:</Text>
              <Text>UseCase ist testbar OHNE Docker, OHNE LocalStack!</Text>
              <Text>Mock = Fake-Implementierung des Interface</Text>
              <Text>Teste NUR die Business Logic, nicht AWS.</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '11. 🚨 Häufige Fehler',
      content: (
        <Box flexDirection="column">
          <Box borderStyle="single" borderColor="red" padding={1} marginBottom={1}>
            <Box flexDirection="column">
              <Text color="red" bold>❌ MessageBody vergessen zu stringifyen</Text>
              <CodeSnippet
                language="typescript"
                showLineNumbers={false}
                code={`// FALSCH:
MessageBody: { markerId, tableName }  // Object!

// RICHTIG:
MessageBody: JSON.stringify({ markerId, tableName })`}
              />
            </Box>
          </Box>
          <Box borderStyle="single" borderColor="red" padding={1} marginBottom={1}>
            <Box flexDirection="column">
              <Text color="red" bold>❌ QUEUE_URL nicht gesetzt</Text>
              <Text dimColor>CDK muss die URL als Environment Variable setzen!</Text>
              <Text dimColor>Check: cdk/lib/workshop-stack.ts → environment</Text>
            </Box>
          </Box>
          <Box borderStyle="single" borderColor="red" padding={1}>
            <Box flexDirection="column">
              <Text color="red" bold>❌ taskId nicht in die Message geschrieben</Text>
              <Text dimColor>result.data.taskId aus dem Use Case holen!</Text>
              <Text dimColor>Worker braucht die taskId um den Status zu updaten.</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
  ],

  hints: [
    {
      level: 1,
      title: 'Start Simple',
      content: 'Öffne packages/marking-starter-lambda/src/interfaces/lambda-handler.ts - die Schritte [1]-[5] stehen im Kommentar. Ersetze den NOT_IMPLEMENTED-Throw. Der Use Case und die Adapter sind schon fertig!',
    },
    {
      level: 2,
      title: 'DB Schema',
      content: `Schaue dir local/sql/tables/02_marking_tasks.sql an:

CREATE TABLE lts.marking_tasks (
  id SERIAL PRIMARY KEY,
  job_id UUID NOT NULL,
  table_name VARCHAR(255) NOT NULL,
  cutoff_date TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW()
);

Das INSERT macht die SQL-Funktion lts.start_table_marking für dich -
aufgerufen über container.startTableMarkingUseCase.execute(...).`,
    },
    {
      level: 3,
      title: 'Code Pattern Step-by-Step',
      content: `
1. if (!container) { container = await buildContainer(); }
2. const taskIds: number[] = [];
3. Für jede Tabelle in tables:
   a) const result = await container.startTableMarkingUseCase.execute({
        jobId, tableName: table.tableName, cutoffDate: table.cutoffDate })
   b) if (!isSuccess(result)) → Fehler loggen + throw
   c) const taskId = result.data.taskId; taskIds.push(taskId);
   d) await container.queue.sendMessage(container.workerQueueUrl,
        { taskId, taskType: 'marking', jobId, tableName: table.tableName, correlationId })
4. return { tasksCreated: taskIds.length, taskIds };

Vergleiche mit packages/get-table-list-lambda (Phase 1 Referenz)!`,
    },
    {
      level: 4,
      title: '2-Phase-Commit Problem (Advanced)',
      content: `DB-Insert und SQS-Send sind ZWEI Systeme - keine gemeinsame Transaktion!

Was kann passieren?
1. DB ✅ dann SQS 💥 → Task bleibt PENDING, keiner arbeitet ihn ab
2. SQS ✅ dann DB 💥 → Message ohne Task, Worker crasht

Unsere Strategie (DB zuerst):
- Task bleibt bei SQS-Fehler PENDING sichtbar in der DB
- Ein Monitoring-Job könnte "verwaiste" PENDING-Tasks finden
- Worker sind idempotent (Phase 3) → doppelte Messages sind ok

Es gibt keine perfekte Lösung - nur bewusste Trade-offs!
(Stichwort für später: Transactional Outbox Pattern)`,
    },
  ],

  testingTips: [
    'Deploy: cd cdk && npx cdklocal deploy',
    'Invoke: awslocal lambda invoke --function-name MarkingStarterLambda --payload \'{"action":"startMarking","tableCount":3}\' /dev/stdout',
    'Check Queue: awslocal sqs receive-message --queue-url http://localhost:4566/000000000000/lts-worker-queue',
    'Check DB: psql -h localhost -U postgres -d longtermstorage -c "SELECT * FROM lts.marking_tasks ORDER BY id DESC LIMIT 5;"',
    'CDK verstehen: cd cdk && npx cdklocal synth | grep -B2 -A8 sqs:SendMessage → die IAM Policy von grantSendMessages()!',
    'Unit Tests: cd packages/marking-starter-lambda && pnpm test',
  ],
};
