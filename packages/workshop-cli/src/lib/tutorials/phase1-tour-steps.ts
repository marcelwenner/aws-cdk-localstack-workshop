/**
 * Phase 1 Tour Steps
 *
 * Interactive tour for Phase 1: GetTableListLambda verstehen
 * Each step shows code + live proof using Node.js functions (cross-platform).
 */

import type { TourStep } from '../../components/display/InteractiveCodeTour.js';
import {
  proofLocalStackHealth,
  proofLambdaEnv,
  proofSqsQueueAttributes,
  proofLambdaInvoke,
  proofDatabaseConnection,
} from '../tour-helpers.js';
import { workshopConfig } from '../../core/config/workshop.config.js';

export const phase1TourSteps: TourStep[] = [
  {
    title: 'Docker Networking',
    file: 'local/docker-compose.yml',
    code: `services:
  localstack:
    ports:
      - "4566:4566"  # Dein Zugang zur Cloud

  postgres:
    ports:
      - "5432:5432"  # Datenbank-Port`,
    highlightLines: [4, 8],
    explanation:
      'LocalStack und PostgreSQL laufen in Docker-Containern. Die Ports werden nach außen exponiert, damit du von deinem Host-System darauf zugreifen kannst.',
    whyThisMatters: {
      problem: 'Ohne Port-Mapping sind Container isoliert',
      consequence: 'Kein Zugriff auf LocalStack/DB möglich',
      realWorld: 'AWS: VPC Endpoints, Security Groups statt Ports',
    },
    proofFn: proofLocalStackHealth,
  },
  {
    title: 'Lambda Environment Variables',
    file: 'cdk/lib/workshop-stack.ts',
    code: `const lambdaEnvironment = {
  DB_HOST: 'postgres',     // Docker-Netzwerk
  DB_PORT: '5432',
  DB_NAME: 'longtermstorage',
  LOCALSTACK_ENDPOINT: 'http://localhost:4566',
};`,
    highlightLines: [2],
    explanation:
      'Lambdas laufen INNERHALB von Docker (LocalStack). Daher ist DB_HOST="postgres" (Docker-Service-Name), nicht "localhost".',
    whyThisMatters: {
      problem: 'Lambda und Host haben unterschiedliche Netzwerk-Sichten',
      consequence: '"localhost" zeigt für Lambda auf sich selbst, nicht auf Postgres',
      realWorld: 'AWS: Lambda in VPC nutzt internen DNS-Namen der DB',
    },
    commonMistake: {
      wrong: 'DB_HOST: "localhost"',
      why: 'Lambda läuft IN Docker/LocalStack - "localhost" zeigt auf den Lambda-Container selbst, nicht auf Postgres',
      fix: 'DB_HOST: "postgres" (Docker Service Name im selben Netzwerk)',
    },
    proofFn: () => proofLambdaEnv(workshopConfig.lambdas.GetTableList),
  },
  {
    title: 'SQS Queues im Stack',
    file: 'cdk/lib/workshop-stack.ts',
    code: `const ltsWorkerQueue = new sqs.Queue(this, 'LtsWorkerQueue', {
  queueName: 'lts-worker-queue',
  visibilityTimeout: cdk.Duration.seconds(900),
  deadLetterQueue: {
    queue: ltsWorkerDLQ,
    maxReceiveCount: 3,
  },
});`,
    highlightLines: [3, 6],
    explanation:
      'CDK erstellt SQS Queues deklarativ. visibilityTimeout = wie lange eine Message "unsichtbar" ist während Verarbeitung. Nach maxReceiveCount Fehlern → DLQ.',
    whyThisMatters: {
      problem: 'Ohne visibilityTimeout könnten zwei Worker dieselbe Message gleichzeitig verarbeiten',
      consequence: 'Doppelte Verarbeitung, inkonsistente Daten, verschwendete Ressourcen',
      realWorld: 'AWS-Regel: visibilityTimeout ≥ 6 × Lambda Timeout (sonst Race Conditions)',
    },
    commonMistake: {
      wrong: 'visibilityTimeout: 30 (bei 150s Lambda Timeout)',
      why: 'Nach 30s wird die Message wieder sichtbar - aber Lambda läuft noch! Zweiter Worker holt sie.',
      fix: 'visibilityTimeout: 900 - mind. 6 × Lambda Timeout (Worker: 150s → 900s)',
    },
    proofFn: () => proofSqsQueueAttributes('lts-worker-queue'),
  },
  {
    title: 'Datenbank-Verbindung',
    file: 'packages/database-adapter-postgres/src/index.ts',
    code: `this.pool = new Pool({
  host: config.host,
  port: config.port,
  database: config.database,
  user: config.user,
  password: config.password,
  max: 1,  // Lambda-Regel: EINE Connection pro Container!
});`,
    highlightLines: [7],
    explanation:
      'Der Adapter verbindet sich zur PostgreSQL-Datenbank. Credentials kommen aus Environment Variables, und max: 1 begrenzt den Pool auf eine Connection pro Lambda-Container.',
    whyThisMatters: {
      problem: 'Lambda-Container werden eingefroren, nicht beendet - Pool-Connections überleben',
      consequence: '100 parallele Worker × Pool à 10 = 1000 Connections, Postgres-Limit ist ~100',
      realWorld: 'In AWS: RDS Proxy als Connection-Multiplexer oder serverless-native DBs',
    },
    commonMistake: {
      wrong: 'max: 10 (der Default-Reflex aus der Server-Welt)',
      why: 'Was "pro Instanz" gedacht ist, verhält sich in Lambda anders - es gibt tausende Instanzen',
      fix: 'max: 1 - eine Connection pro Container, der Container-Cache übernimmt die Wiederverwendung',
    },
    proofFn: proofDatabaseConnection,
  },
  {
    title: 'Lambda Live-Test',
    file: 'packages/get-table-list-lambda/src/interfaces/lambda-handler.ts',
    code: `// Container wird zwischen Aufrufen gecached (Cold Start!)
let container = null;

export const handler = async (_event, context) => {
  const correlationId = context.awsRequestId;

  if (!container) {
    container = await buildContainer();  // nur beim Cold Start
  }

  const result = await container.getTableListUseCase.execute(correlationId);

  if (!isSuccess(result)) {
    return { statusCode: 500, body: JSON.stringify({ error: result.error.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ tables: result.data }) };
};`,
    highlightLines: [2, 8, 12],
    explanation:
      'Der Handler ist nur die Tür: Container bauen (gecached!), Use Case ausführen, Result<T,E> behandeln. Jetzt rufen wir die echte Lambda auf!',
    whyThisMatters: {
      problem: 'Ohne Clean Architecture: Alles im Handler = untestbar, unwartbar',
      consequence: 'Handler vermischt AWS-spezifischen Code mit Business-Logik',
      realWorld: 'Use Case ist testbar ohne AWS. Adapter ist austauschbar (Mock vs. Real DB)',
    },
    proofFn: () => proofLambdaInvoke(workshopConfig.lambdas.GetTableList),
  },
];
