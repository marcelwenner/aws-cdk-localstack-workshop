import React from 'react';
import { Box, Text } from 'ink';
import { PhaseTutorial } from './tutorial.types.js';
import { CodeSnippet } from '../../components/display/CodeSnippet.js';

export const phase1Tutorial: PhaseTutorial = {
  phase: 1,
  title: 'GetTableListLambda verstehen',

  learningObjectives: [
    'Lambda Handler Pattern verstehen',
    'Postgres Connection in Lambda',
    'Structured Logging kennenlernen',
    'Error Handling Best Practices',
    'Debugging mit LiveLogViewer',
    'Am Ende: Break-it Challenge - Secret finden!',
  ],

  architecture: `
┌─────────────┐
│   Lambda    │  GetTableListLambda
│   Handler   │  ├─ Postgres Query: SELECT table_name FROM information_schema.tables
└──────┬──────┘  └─ Returns: { tables: string[] }
       │
       ▼
┌─────────────┐
│  Postgres   │  Database: longtermstorage
│     DB      │  Schema: public
└─────────────┘
`,

  sections: [
    {
      title: '1. Lambda Handler Pattern',
      content: (
        <Box flexDirection="column">
          <Text color="yellow">📋 Jede Lambda hat diese Struktur:</Text>
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`export const handler = async (event) => {
  // 1. Parse Input
  // 2. Business Logic
  // 3. Return Response
};`}
          />
          <Text color="green">✓ GetTableListLambda ist bereits implementiert!</Text>
          <Text>Schaue dir den Code an:</Text>
          <Text color="cyan">packages/get-table-list-lambda/src/index.ts</Text>
        </Box>
      ),
    },
    {
      title: '2. Das Adapter Pattern erklärt',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>🔌 Was ist ein "Adapter"?</Text>
          <Box marginY={1} />
          <Text>Ein Adapter ist eine <Text color="cyan">austauschbare Implementierung</Text> für eine Schnittstelle.</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="cyan" paddingX={1}>
            <Box flexDirection="column">
              <Text color="cyan" bold>Warum ist das wichtig?</Text>
              <Box marginY={1} />
              <Text>In Tests: <Text color="green">MockDatabaseAdapter</Text></Text>
              <Text dimColor>  → Kein echter DB-Zugriff, schnelle Tests</Text>
              <Box marginY={1} />
              <Text>In Produktion: <Text color="green">PostgresDatabaseAdapter</Text></Text>
              <Text dimColor>  → Echte Datenbank-Operationen</Text>
              <Box marginY={1} />
              <Text bold>Gleiche Schnittstelle, unterschiedliche Implementierungen!</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// Adapter-Schnittstelle (Interface)
interface DatabaseAdapter {
  query(sql: string): Promise<Result>;
}

// Konkrete Implementierung
const adapter = new DatabaseAdapterPostgres({
  host: process.env.DB_HOST,
  // ...
});

// Lambda nutzt nur das Interface - egal welche Implementierung!
const result = await adapter.query('SELECT ...');`}
          />
          <Box marginTop={1}>
            <Text color="green">✓ Macht Code testbar, flexibel und wartbar!</Text>
          </Box>
        </Box>
      ),
    },
    {
      title: '3. 🔄 Warum KEINE Connection Pools in Lambda?',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Das Connection-Explosion Problem:</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="red" paddingX={1}>
            <Box flexDirection="column">
              <Text dimColor>1000 parallele Lambda-Instanzen</Text>
              <Text dimColor>  × 10 Pool-Connections pro Lambda</Text>
              <Text dimColor>  ─────────────────────────────</Text>
              <Text color="red" bold>  = 10.000 DB-Connections! 💀</Text>
              <Box marginY={1} />
              <Text dimColor>PostgreSQL Default-Limit: ~100 Connections</Text>
              <Text dimColor>→ DB crasht, alle Lambdas crashen</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// ❌ FALSCH: Pool in Lambda
const pool = new pg.Pool({ max: 10 }); // Connections überleben Lambda!

// ✅ RICHTIG: Einzelne Connection, sauber schließen
const client = new pg.Client(config);
await client.connect();
try {
  return await client.query('SELECT ...');
} finally {
  await client.end(); // IMMER schließen!
}`}
          />
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">Warum überleben Connections?</Text>
            <Text>Lambda-Instanzen werden <Text color="cyan">eingefroren</Text>, nicht beendet.</Text>
            <Text dimColor>Nächster Request: Selbe Instanz, selber Pool, alte Connections!</Text>
          </Box>
          <Box marginTop={1} borderStyle="single" borderColor="green" paddingX={1}>
            <Box flexDirection="column">
              <Text color="green" bold>💡 Production-Lösung:</Text>
              <Text>RDS Proxy = Zentraler Connection Pool außerhalb der Lambdas</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '4. Structured Logging',
      content: (
        <Box flexDirection="column">
          <Text color="yellow">📊 Logging Best Practice:</Text>
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`console.log(JSON.stringify({
  level: 'INFO',
  message: 'Tables fetched',
  count: tables.length
}));`}
          />
          <Text color="green">✓ JSON = Parseable in CloudWatch</Text>
          <Text color="green">✓ Besseres Filtering möglich</Text>
        </Box>
      ),
    },
    {
      title: '5. 🔒 SQL Injection Prevention',
      content: (
        <Box flexDirection="column">
          <Text color="red" bold>⚠️ NIEMALS String-Interpolation in SQL!</Text>
          <Box marginY={1} />
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// ❌ GEFÄHRLICH - SQL Injection möglich!
const sql = \`SELECT * FROM \${tableName}\`;

// Was wenn tableName = "users; DROP TABLE users; --" ?
// → SELECT * FROM users; DROP TABLE users; --
// → Deine Daten sind weg! 💀`}
          />
          <Box marginY={1} />
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// ✅ SICHER - Prepared Statements
const sql = 'INSERT INTO tasks (table_name) VALUES ($1)';
await client.query(sql, [tableName]);

// $1 wird als DATEN behandelt, nicht als SQL-Code
// Egal was tableName enthält - es wird escaped!`}
          />
          <Box marginTop={1} borderStyle="single" borderColor="green" paddingX={1}>
            <Box flexDirection="column">
              <Text color="green" bold>💡 Regel:</Text>
              <Text>Nutze IMMER $1, $2, ... für Benutzereingaben!</Text>
              <Text dimColor>Das gilt für alle Daten die von außen kommen.</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '6. Wie kommt TypeScript in die Lambda?',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>📦 Bundling mit esbuild</Text>
          <Box marginY={1} />
          <Text>NodejsFunction macht automatisch:</Text>
          <Text dimColor>  1. TypeScript → JavaScript (transpile)</Text>
          <Text dimColor>  2. Dependencies bündeln (tree-shaking)</Text>
          <Text dimColor>  3. Minifizieren (kleinere ZIP)</Text>
          <Text dimColor>  4. ZIP erstellen → S3 → Lambda</Text>
          <Box marginY={1} />
          <Text color="red">⚠️ "Module not found" Error?</Text>
          <Text dimColor>  → Dependency fehlt in package.json</Text>
          <Text dimColor>  → Oder: externalModules falsch konfiguriert</Text>
        </Box>
      ),
    },
    {
      title: '7. 🚨 Challenge: Break it!',
      content: (
        <Box flexDirection="column">
          <Text color="red" bold>🔐 Deine Mission: Finde das Secret!</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="yellow" paddingX={1}>
            <Text color="yellow">Das Secret ist dein Ticket für Phase 2 - es beweist, dass du Lambda-Logs debuggen kannst.</Text>
          </Box>
          <Box marginY={1} />
          <Text>1. Öffne: <Text color="cyan">packages/get-table-list-lambda/src/interfaces/lambda-handler.ts</Text></Text>
          <Text>2. Füge <Text color="yellow">throw new Error('test');</Text> in Zeile 72 ein (nach <Text dimColor>useCase.execute()</Text>)</Text>
          <Text>3. Speichern → Auto-Deploy abwarten</Text>
          <Text>4. Drücke <Text color="green" bold>[L]</Text> für LiveLogViewer</Text>
          <Text>5. Finde im <Text color="red">LAMBDA_ERROR</Text>-Log die <Text color="yellow">releaseId</Text>!</Text>
          <Box marginY={1} />
          <Text color="yellow">💡 Du brauchst das Secret um Phase 1 abzuschließen!</Text>
        </Box>
      ),
    },
  ],

  hints: [
    {
      level: 1,
      title: 'Wo liegt der Code?',
      content: 'Der Handler: packages/get-table-list-lambda/src/interfaces/lambda-handler.ts\nDer Use Case: packages/get-table-list-lambda/src/application/use-cases/get-table-list.use-case.ts\nDer Container: packages/get-table-list-lambda/src/infrastructure/container.ts',
    },
    {
      level: 2,
      title: 'Architektur verstehen',
      content: 'Aufruf-Pfad: lambda-handler.ts → container.getTableListUseCase() → useCase.execute() → databaseAdapter.query()\nDer Handler ist nur der Einstiegspunkt. Business-Logik steckt im Use Case.',
    },
    {
      level: 3,
      title: 'Break-it Secret finden',
      content: 'Füge throw new Error("test"); in lambda-handler.ts Zeile 72 ein (nach const result = await useCase.execute()).\nSpeichern → Auto-Deploy → [L] LiveLogViewer → Finde im LAMBDA_ERROR-Log das Feld "releaseId" - das ist dein Code.',
    },
  ],

  testingTips: [
    'Lambda ist bereits deployed',
    'Teste mit: npm run workshop logs GetTableList',
    'Oder invoke direkt: aws lambda invoke --function-name GetTableListLambda output.json',
  ],
};
