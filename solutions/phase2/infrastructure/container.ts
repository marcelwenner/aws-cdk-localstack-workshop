/**
 * Dependency Injection Container
 *
 * ✅ PRE-BUILT - Already wired up, nothing to do here
 *
 * Wires up: Database Adapter + Queue Adapter + Use Case
 */

import { PostgresAdapter } from 'database-adapter-postgres';
import { SqsAdapter } from 'queue-adapter-sqs';
import { StartTableMarkingUseCase } from '../application/use-cases/start-table-marking.use-case.js';

export async function buildContainer() {
  // Database config from environment
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'longtermstorage',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  };

  // SQS config from environment
  const sqsConfig = {
    region: process.env.AWS_REGION || 'eu-central-1',
    endpoint: process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
    },
    queueUrls: {
      statusCheck: process.env.STATUS_CHECK_QUEUE_URL || '',
      completion: process.env.COMPLETION_QUEUE_URL || '',
      ltsWorker: process.env.LTS_WORKER_QUEUE_URL || '',
    },
  };

  // Create adapters
  const database = new PostgresAdapter(dbConfig);
  const queue = new SqsAdapter(sqsConfig);

  // Create use cases
  const startTableMarkingUseCase = new StartTableMarkingUseCase(database);

  // Return container with all dependencies
  return {
    database,
    queue,
    startTableMarkingUseCase,
    workerQueueUrl: sqsConfig.queueUrls.ltsWorker,
  };
}

export type Container = Awaited<ReturnType<typeof buildContainer>>;
