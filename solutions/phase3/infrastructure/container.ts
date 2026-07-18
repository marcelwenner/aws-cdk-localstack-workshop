/**
 * Dependency Injection Container
 *
 * ✅ PRE-BUILT - This container is already implemented
 */

import { PostgresAdapter } from 'database-adapter-postgres';
import { SqsAdapter } from 'queue-adapter-sqs';
import { ExecuteMarkingTaskUseCase } from '../application/use-cases/execute-marking-task.use-case.js';
import { ExecuteDeletionTaskUseCase } from '../application/use-cases/execute-deletion-task.use-case.js';

export async function buildContainer() {
  // Database config
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'longtermstorage',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  };

  // SQS config for queue operations
  const sqsConfig = {
    region: process.env.AWS_REGION || 'eu-central-1',
    endpoint: process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT,
    credentials: (process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT) ? {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    } : undefined,
    queueUrls: {
      statusCheck: process.env.STATUS_CHECK_QUEUE_URL!,
      completion: process.env.COMPLETION_QUEUE_URL!,
      ltsWorker: process.env.LTS_WORKER_QUEUE_URL!,
    },
  };

  // Create adapters
  const database = new PostgresAdapter(dbConfig);
  const queue = new SqsAdapter(sqsConfig);

  // Create use cases
  const executeMarkingTaskUseCase = new ExecuteMarkingTaskUseCase(database);
  const executeDeletionTaskUseCase = new ExecuteDeletionTaskUseCase(database);

  return {
    database,
    queue,
    executeMarkingTaskUseCase,
    executeDeletionTaskUseCase,
  };
}

export type Container = Awaited<ReturnType<typeof buildContainer>>;
