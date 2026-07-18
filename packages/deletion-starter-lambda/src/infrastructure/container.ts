/**
 * Dependency Injection Container
 *
 * ✅ PRE-BUILT - This container is already implemented
 *
 * Wires up: Database Adapter + Use Case + Queue
 */

import { PostgresAdapter } from 'database-adapter-postgres';
import { SqsAdapter } from 'queue-adapter-sqs';
import { StartTableDeletionUseCase } from '../application/use-cases/start-table-deletion.use-case.js';

export async function buildContainer() {
  // Database config from environment
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'longtermstorage',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  };

  // Queue URLs from environment
  const workerQueueUrl = process.env.LTS_WORKER_QUEUE_URL!;
  const statusCheckQueueUrl = process.env.STATUS_CHECK_QUEUE_URL!;
  const completionQueueUrl = process.env.COMPLETION_QUEUE_URL!;

  // Create adapters
  const database = new PostgresAdapter(dbConfig);
  const queue = new SqsAdapter({
    region: process.env.AWS_REGION || 'eu-central-1',
    endpoint: process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT,
    credentials: (process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT) ? {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    } : undefined,
    queueUrls: {
      ltsWorker: workerQueueUrl,
      statusCheck: statusCheckQueueUrl,
      completion: completionQueueUrl,
    },
  });

  // Create use cases
  const startTableDeletionUseCase = new StartTableDeletionUseCase(database);

  return {
    database,
    queue,
    startTableDeletionUseCase,
    workerQueueUrl,
  };
}

export type Container = Awaited<ReturnType<typeof buildContainer>>;
