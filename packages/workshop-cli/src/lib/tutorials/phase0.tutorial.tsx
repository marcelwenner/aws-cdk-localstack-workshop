import React from 'react';
import { Box, Text } from 'ink';
import { PhaseTutorial } from './tutorial.types.js';
import { CodeSnippet } from '../../components/display/CodeSnippet.js';

// Docker Networking Diagramm als Komponente
const DockerNetworkDiagram = () => (
  <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
    <Text color="yellow" bold>🐳 Docker Networking</Text>
    <Box marginY={1} />
    <Text>Warum <Text color="cyan">DB_HOST: 'postgres'</Text> statt <Text color="cyan">localhost</Text>?</Text>
    <Box marginY={1} />
    <Text>Lambda läuft IN einem Docker Container (von LocalStack gestartet).</Text>
    <Text>Postgres läuft in einem ANDEREN Container - im selben Docker-Netzwerk.</Text>
    <Box marginY={1} />
    <Text dimColor>localhost = "ich selbst" (der Lambda-Container) → Postgres NICHT erreichbar!</Text>
    <Text color="green">'postgres' = Docker-Service-Name → Docker-DNS löst ihn zum Container auf!</Text>
    <Box marginY={1} />
    <Text dimColor>┌─────────────────────────────────────────────┐</Text>
    <Text dimColor>│  Docker-Netzwerk "workshop"                 │</Text>
    <Text dimColor>│   ┌───────────────┐  ┌───────────────┐      │</Text>
    <Text dimColor>│   │ LocalStack    │─▶│ postgres      │      │</Text>
    <Text dimColor>│   │ (Lambda drin) │  │ :5432         │      │</Text>
    <Text dimColor>│   └───────────────┘  └───────────────┘      │</Text>
    <Text dimColor>│      DB_HOST='postgres' (Service-Name)      │</Text>
    <Text dimColor>└─────────────────────────────────────────────┘</Text>
    <Box marginY={1} />
    <Text dimColor>💡 host.docker.internal wäre der Weg vom Container zum HOST-Rechner -</Text>
    <Text dimColor>   brauchst du nur, wenn der Service auf dem Host läuft, nicht in Docker.</Text>
  </Box>
);

// CDK Stack Code Beispiel
const StackCodeExample = () => (
  <Box flexDirection="column" marginY={1}>
    <Text dimColor>export class WorkshopStack extends cdk.Stack {'{'}</Text>
    <Text dimColor>  constructor(scope: Construct, id: string) {'{'}</Text>
    <Text dimColor>    super(scope, id);</Text>
    <Text dimColor> </Text>
    <Text dimColor>    <Text color="green">// ✅ SQS Queues (bereits implementiert)</Text></Text>
    <Text dimColor>    const ltsWorkerQueue = new sqs.Queue(...);</Text>
    <Text dimColor> </Text>
    <Text dimColor>    <Text color="green">// ✅ Lambda 1: GetTableListLambda (REFERENZ)</Text></Text>
    <Text dimColor>    const getTableListLambda = new nodejs.NodejsFunction(...);</Text>
    <Text dimColor> </Text>
    <Text dimColor>    <Text color="yellow">// ⚠️ TODO: Du fügst hier deine Lambdas hinzu!</Text></Text>
    <Text dimColor>  {'}'}</Text>
    <Text dimColor>{'}'}</Text>
  </Box>
);

// Lambda Construct Code Beispiel
const LambdaConstructExample = () => (
  <Box flexDirection="column" marginY={1}>
    <Text dimColor>const getTableListLambda = new nodejs.NodejsFunction(this, 'GetTableListLambda', {'{'}</Text>
    <Text dimColor>  functionName: 'GetTableListLambda',</Text>
    <Text dimColor>  entry: path.join(__dirname, '../../packages/.../lambda-handler.ts'),</Text>
    <Text dimColor>  handler: 'handler',</Text>
    <Text dimColor>  runtime: lambda.Runtime.NODEJS_20_X,</Text>
    <Text dimColor>  timeout: cdk.Duration.seconds(30),</Text>
    <Text dimColor>  environment: {'{'}</Text>
    <Text dimColor>    DB_HOST: '<Text color="cyan">postgres</Text>',  <Text color="gray">// ← Docker-Service-Name!</Text></Text>
    <Text dimColor>    DB_PORT: '5432',</Text>
    <Text dimColor>    DB_NAME: 'longtermstorage',</Text>
    <Text dimColor>  {'}'},</Text>
    <Text dimColor>{'}'});</Text>
  </Box>
);

export const phase0Tutorial: PhaseTutorial = {
  phase: 0,
  title: 'CDK Grundlagen',

  learningObjectives: [
    'Was ist AWS CDK?',
    'Wie ist der Workshop-Stack aufgebaut?',
    'Wie fügt man eine Lambda hinzu?',
    'Docker Networking verstehen',
    'CDK Commands kennenlernen',
    'IAM Basics: Least Privilege Principle',
    'CloudWatch: Observability verstehen',
  ],

  architecture: `
┌─────────────────────────────────────────────────────────────┐
│                    CDK WORKSHOP STACK                       │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Lambda    │  │   Lambda    │  │   Lambda    │  ...    │
│  │ GetTableList│  │MarkingStart│  │ LtsExecutor │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          ▼                                  │
│                   ┌─────────────┐                           │
│                   │  SQS Queues │                           │
│                   └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
`,

  sections: [
    {
      title: '1. Was ist AWS CDK?',
      content: (
        <Box flexDirection="column">
          <Text>AWS Cloud Development Kit (CDK) ist ein Framework für</Text>
          <Text>Infrastructure as Code mit <Text color="green" bold>TypeScript</Text>.</Text>
          <Box marginY={1} />
          <Text color="red">❌ Früher: JSON/YAML (1000+ Zeilen CloudFormation):</Text>
          <Text dimColor>   • Keine Type Safety</Text>
          <Text dimColor>   • Viel Boilerplate</Text>
          <Text dimColor>   • Copy-Paste Fehler</Text>
          <Box marginY={1} />
          <Text color="green">✅ Heute: TypeScript Code:</Text>
          <Text dimColor>   • Type-safe mit IDE Support</Text>
          <Text dimColor>   • Wiederverwendbare Konstrukte</Text>
          <Text dimColor>   • Loops, Conditions, Abstractions</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="cyan" paddingX={1}>
            <Box flexDirection="column">
              <Text color="cyan" bold>Was ist CloudFormation?</Text>
              <Text>AWS's native Infrastructure-as-Code Sprache (JSON/YAML).</Text>
              <Text dimColor>CDK generiert CloudFormation → AWS liest es → Infrastruktur entsteht</Text>
              <Box marginY={1} />
              <Text dimColor>TypeScript → <Text color="yellow">CDK compile</Text> → CloudFormation JSON → <Text color="green">AWS Deploy</Text> → Lambda existiert!</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '2. Workshop Stack Tour',
      content: (
        <Box flexDirection="column">
          <Text color="yellow">📄 Datei: <Text color="cyan">cdk/lib/workshop-stack.ts</Text></Text>
          <Box marginY={1} />
          <Text dimColor>Der Stack definiert deine gesamte Infrastruktur:</Text>
          <StackCodeExample />
          <Box marginTop={1}>
            <Text>• SQS Queues sind <Text color="green">bereits implementiert</Text></Text>
          </Box>
          <Text>• GetTableListLambda ist <Text color="green">Referenz-Implementierung</Text></Text>
          <Text>• Andere Lambdas sind <Text color="yellow">TODOs</Text> - du implementierst sie!</Text>
        </Box>
      ),
    },
    {
      title: '3. Lambda Construct verstehen',
      content: (
        <Box flexDirection="column">
          <Text color="yellow">Schauen wir uns GetTableListLambda an:</Text>
          <LambdaConstructExample />
          <Box marginTop={1}>
            <Text color="cyan" bold>🔑 Wichtige Teile:</Text>
          </Box>
          <Text>• <Text color="green">functionName</Text>: Name in AWS</Text>
          <Text>• <Text color="green">entry</Text>: Pfad zum Handler</Text>
          <Text>• <Text color="green">environment</Text>: Umgebungsvariablen</Text>
          <Text>• <Text color="green">bundling</Text>: External Modules</Text>
        </Box>
      ),
    },
    {
      title: '4. Docker Networking',
      content: <DockerNetworkDiagram />,
    },
    {
      title: '5. CDK Commands & Approval',
      content: (
        <Box flexDirection="column">
          <Text color="green" bold>📦 cdklocal bootstrap</Text>
          <Text dimColor>   → Einmalig: Richtet CDK in LocalStack ein</Text>
          <Box marginY={1} />
          <Text color="green" bold>🚀 cdklocal deploy</Text>
          <Text dimColor>   → Deployed deinen Stack nach LocalStack</Text>
          <Text dimColor>   → Im Workshop macht das die CLI automatisch bei jedem Speichern!</Text>
          <Text dimColor>   → Manuell brauchst du es nur ohne die CLI (z.B. montags im Job)</Text>
          <Box marginY={1} />
          <Text color="green" bold>🔍 cdklocal diff</Text>
          <Text dimColor>   → Zeigt Änderungen seit letztem Deploy</Text>
          <Box marginY={1} />
          <Text color="yellow" bold>💡 Workflow:</Text>
          <Text>   1. Code ändern (Lambda hinzufügen)</Text>
          <Text>   2. <Text color="cyan">cd cdk</Text></Text>
          <Text>   3. <Text color="cyan">cdklocal deploy</Text></Text>
          <Text>   4. Testen!</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="yellow" paddingX={1}>
            <Box flexDirection="column">
              <Text color="yellow" bold>🔐 --require-approval erklärt</Text>
              <Text>Bei IAM/Security-Änderungen fragt CDK nach Bestätigung.</Text>
              <Box marginY={1} />
              <Text>• <Text color="green">never</Text>: Keine Nachfrage (Workshop/CI)</Text>
              <Text>• <Text color="yellow">broadening</Text>: Nur bei neuen Permissions (Default)</Text>
              <Text>• <Text color="red">always</Text>: Bei JEDER Security-Änderung</Text>
              <Box marginY={1} />
              <Text color="green">✅ Workshop: <Text color="cyan">--require-approval never</Text> ist OK</Text>
              <Text dimColor>   (LocalStack = keine echten AWS-Kosten/Risiken)</Text>
              <Text color="red">⚠️ PRODUKTION: Nie --require-approval never!</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '6. CDK Construct Levels',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>🏗️ Die CDK Pyramide</Text>
          <Box marginY={1} />
          <Text color="red">L1 (Low Level):</Text>
          <Text dimColor>  CfnQueue, CfnFunction - 1:1 CloudFormation, keine Defaults</Text>
          <Box marginY={1} />
          <Text color="yellow">L2 (High Level):</Text>
          <Text dimColor>  sqs.Queue, lambda.Function - Sensible Defaults, IAM Magic</Text>
          <Box marginY={1} />
          <Text color="green">L3 (Patterns):</Text>
          <Text dimColor>  NodejsFunction, LambdaRestApi - Komplette Lösungen</Text>
          <Box marginY={1} />
          <Text color="cyan">💡 Wir nutzen L2/L3 → weniger Code, mehr Sicherheit!</Text>
        </Box>
      ),
    },
    {
      title: '7. Cold Starts in LocalStack',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>🥶 Warum dauert der erste Request so lange?</Text>
          <Box marginY={1} />
          <Text>Erster Aufruf: <Text color="red">~3 Sekunden</Text></Text>
          <Text dimColor>  → Container wird gestartet</Text>
          <Text dimColor>  → Code wird geladen</Text>
          <Text dimColor>  → Dependencies werden initialisiert</Text>
          <Box marginY={1} />
          <Text>Zweiter Aufruf: <Text color="green">~100ms</Text></Text>
          <Text dimColor>  → Container wiederverwendet (warm)</Text>
          <Box marginY={1} />
          <Text color="cyan">💡 In AWS: Nach ~15min Inaktivität → Cold Start</Text>
          <Text dimColor>   LocalStack: Container bleiben länger warm (Dev-Freundlich)</Text>
        </Box>
      ),
    },
    {
      title: '8. Infrastructure as Code State',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>📊 Warum "State" so wichtig ist</Text>
          <Box marginY={1} />
          <Text>CloudFormation merkt sich pro Stack, was deployed wurde (der "State").</Text>
          <Text dimColor>Das ermöglicht: "Ich hatte 3 Lambdas. Du willst 4. Ich erstelle NUR die neue."</Text>
          <Text dimColor>(Der Bootstrap-S3-Bucket ist nur der Transportweg für Templates und Assets,</Text>
          <Text dimColor> z.B. dein Lambda-ZIP. Der State selbst lebt im CloudFormation-Service.)</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="red" paddingX={1}>
            <Box flexDirection="column">
              <Text color="red" bold>⚠️ Was passiert bei manuellem Löschen?</Text>
              <Box marginY={1} />
              <Text>1. Du löschst Lambda in AWS Console</Text>
              <Text>2. CDK State sagt: "Lambda existiert"</Text>
              <Text>3. Nächster Deploy: CDK will Lambda UPDATEN</Text>
              <Text>4. <Text color="red">CRASH!</Text> "Resource does not exist"</Text>
              <Box marginY={1} />
              <Text dimColor>Lösung: <Text color="cyan">cdk destroy</Text> statt manuell löschen</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <Text color="green">✅ Goldene Regel:</Text>
          <Text>State = Single Source of Truth. Alle Änderungen NUR über CDK!</Text>
        </Box>
      ),
    },
    {
      title: '9. 🔐 IAM: Wer darf was?',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Least Privilege Principle</Text>
          <Box marginY={1} />
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// CDK erstellt automatisch IAM Role für jede Lambda
const myLambda = new NodejsFunction(this, 'MyLambda', {...});

// Zusätzliche Permissions explizit vergeben:
myQueue.grantSendMessages(myLambda);  // ✅ Nur sqs:SendMessage
// NICHT: myLambda.role.addManagedPolicy(...) // ❌ Zu breit!`}
          />
          <Box marginTop={1} borderStyle="single" borderColor="red" paddingX={1}>
            <Box flexDirection="column">
              <Text color="red" bold>🚨 Warum das wichtig ist - Angriffsszenario:</Text>
              <Box marginY={1} />
              <Text>Stell dir vor: Dein Lambda-Code hat eine Sicherheitslücke.</Text>
              <Text>Ein Angreifer kann beliebigen Code ausführen.</Text>
              <Box marginY={1} />
              <Text color="green">Mit grantSendMessages:</Text>
              <Text dimColor>  Angreifer kann NUR Messages senden. Schlimm, aber begrenzt.</Text>
              <Box marginY={1} />
              <Text color="red">Mit addManagedPolicy (Admin):</Text>
              <Text dimColor>  Angreifer kann ALLES: Daten löschen, andere Lambdas</Text>
              <Text dimColor>  ändern, Secrets auslesen, Kosten verursachen...</Text>
            </Box>
          </Box>
          <Box marginTop={1}>
            <Text color="cyan" bold>💡 Least Privilege = Schadensbegrenzung bei Kompromittierung</Text>
          </Box>
        </Box>
      ),
    },
    {
      title: '10. 📊 CloudWatch: Dein Observability-Dashboard',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Automatische Lambda Metrics</Text>
          <Box marginY={1} />
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// Diese Metrics bekommst du GRATIS:
// • Invocations     - Wie oft wurde Lambda aufgerufen?
// • Duration        - Wie lange lief sie? (Billing!)
// • Errors          - Wie viele Crashes?
// • Throttles       - Wurde Lambda gedrosselt?
// • ConcurrentExecutions - Wie viele parallel?

// Structured Logging für bessere Filterung:
console.log(JSON.stringify({
  level: 'INFO',
  message: 'Processing completed',
  tableName: 'users',
  duration: 150,
}));`}
          />
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">Warum JSON Logging?</Text>
            <Text>• CloudWatch Logs Insights kann JSON parsen</Text>
            <Text>• Filterbar: <Text color="cyan">fields @timestamp, tableName | filter level = 'ERROR'</Text></Text>
            <Text>• Aggregierbar: Durchschnittliche Duration berechnen</Text>
          </Box>
          <Box marginTop={1} borderStyle="single" borderColor="cyan" padding={1}>
            <Box flexDirection="column">
              <Text color="cyan" bold>💡 LocalStack CloudWatch:</Text>
              <Text>http://localhost:4566/_localstack/cloudwatch/metrics</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
    {
      title: '11. ⏰ Environment Variables Lifecycle',
      content: (
        <Box flexDirection="column">
          <Text color="yellow" bold>Wann werden ENV Vars gesetzt?</Text>
          <Box marginY={1} />
          <Box borderStyle="single" borderColor="yellow" paddingX={1}>
            <Box flexDirection="column">
              <Text color="yellow" bold>⚠️ Wichtig zu verstehen:</Text>
              <Text>ENV Vars werden bei <Text color="cyan" bold>DEPLOYMENT</Text> gesetzt, nicht zur Laufzeit!</Text>
            </Box>
          </Box>
          <Box marginY={1} />
          <CodeSnippet
            language="typescript"
            showLineNumbers={false}
            code={`// In CDK (workshop-stack.ts):
environment: {
  DB_HOST: 'postgres',              // ← Wird beim Deploy "eingebrannt"
  QUEUE_URL: queue.queueUrl,        // ← CDK resolved das beim Deploy
}

// In Lambda (zur Laufzeit):
const host = process.env.DB_HOST;   // ← Liest den eingebrannten Wert`}
          />
          <Box marginTop={1} flexDirection="column">
            <Text bold>Was bedeutet das?</Text>
            <Text>• Änderst du ENV Vars in CDK → <Text color="yellow">Re-Deploy nötig!</Text></Text>
            <Text>• Lambda sieht erst nach Deploy die neuen Werte</Text>
            <Text>• <Text color="cyan">queue.queueUrl</Text> wird von CDK zur Deploy-Zeit aufgelöst</Text>
          </Box>
          <Box marginTop={1} borderStyle="single" borderColor="green" paddingX={1}>
            <Box flexDirection="column">
              <Text color="green" bold>💡 Typischer Fehler:</Text>
              <Text>"Ich habe DB_HOST geändert aber Lambda nutzt noch den alten!"</Text>
              <Text dimColor>→ Hast du nach der Änderung <Text color="cyan">cdklocal deploy</Text> ausgeführt?</Text>
            </Box>
          </Box>
        </Box>
      ),
    },
  ],

  hints: [
    {
      level: 1,
      title: 'Workshop-Stack finden',
      content: 'Öffne cdk/lib/workshop-stack.ts - dort ist die gesamte Infrastruktur definiert. Alle Lambdas, Queues und Permissions an einem Ort.',
    },
    {
      level: 2,
      title: 'CDK Deploy Workflow',
      content: 'Der Standard-Ablauf: 1. Code ändern → 2. cd cdk → 3. cdklocal deploy --require-approval never → 4. Testen. Bei Fehlern: cdklocal diff zeigt was sich ändert. (Im Workshop deployed die CLI automatisch bei jedem Speichern.)',
    },
    {
      level: 3,
      title: 'synth-Output lesen',
      content: 'cd cdk && cdklocal synth zeigt das generierte CloudFormation. Suche darin: "AWS::SQS::Queue" (die Queues), "AWS::Lambda::Function" (die Lambda) und "AWS::IAM::Role" (die Role, die niemand geschrieben hat: CDK erzeugt sie). So findest du zu jeder CDK-Zeile die generierte Ressource.',
    },
  ],

  testingTips: [
    'Nach dem Tutorial: cd cdk && cdklocal bootstrap && cdklocal deploy',
    'GetTableListLambda wird beim Deploy erstellt',
    'Teste mit: awslocal lambda invoke --function-name GetTableListLambda /dev/stdout',
    'Blick unter die Haube: cdklocal synth → das generierte CloudFormation Template. Finde die SQS Queues und die IAM Role der Lambda!',
  ],
};
