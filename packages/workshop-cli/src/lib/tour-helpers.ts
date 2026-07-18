/**
 * Tour Helpers
 *
 * Cross-platform proof functions for the Interactive Code Tour.
 * Uses Node.js/AWS SDK instead of shell commands (curl, jq, grep)
 * so it works on Windows too!
 *
 * Uses zod for runtime validation of external API responses.
 */

import { Lambda } from '@aws-sdk/client-lambda';
import { SQS } from '@aws-sdk/client-sqs';
import { z } from 'zod';
import { workshopConfig } from '../core/config/workshop.config.js';

export interface ProofResult {
  success: boolean;
  output: string;
  cliEquivalent: string; // What you'd type in terminal
}

/**
 * A single step in an experiment - represents one query/check
 */
export interface ExperimentStep {
  id: string;                      // "db-check", "queue-check"
  title: string;                   // "Datenbank prüfen"
  description: string;             // "Lass uns die Datenbank prüfen..."
  command: string;                 // CLI equivalent: "psql -c ..."
  result?: string;                 // Filled after execution
  narrativeAfter?: string;         // "Okay, 5 Tasks warten in der DB..."

  // NEU: Pause zum Nachdenken
  thinkAboutIt?: string;           // "Was bedeutet das für unsere Lambda?"
  minPauseSeconds?: number;        // Mindest-Wartezeit bevor [Enter] erlaubt (default: 2)
}

/**
 * Conclusion shown after all steps complete
 */
export interface ExperimentConclusion {
  measuredValues: Record<string, string | number>;  // { "DB Tasks": 5, "Queue": 3 }
  ahaMessage: string;                               // "Ohne SQS Message weiß niemand..."
  learnedMessage: string;                           // For wrong answers: "Aber trotzdem was gelernt..."
}

/**
 * Result of an experiment with step-by-step transparency
 */
export interface ExperimentResult {
  success: boolean;
  observation: string;             // Brief summary
  steps: ExperimentStep[];         // Detailed steps with results
  conclusion: ExperimentConclusion;
}

// Zod schemas for API response validation
const LocalStackHealthSchema = z.object({
  services: z.record(z.string()).optional(),
  features: z.record(z.string()).optional(),
  version: z.string().optional(),
}).passthrough(); // Allow additional fields

const LambdaPayloadSchema = z.object({
  statusCode: z.number().optional(),
  body: z.string().optional(),
}).passthrough();

/**
 * Check LocalStack Health
 */
export async function proofLocalStackHealth(): Promise<ProofResult> {
  try {
    const response = await fetch(`${workshopConfig.aws.endpoint}/_localstack/health`);
    const rawData = await response.json();

    // Validate response with zod
    const parseResult = LocalStackHealthSchema.safeParse(rawData);

    if (!parseResult.success) {
      return {
        success: false,
        output: `Invalid response format: ${parseResult.error.message}`,
        cliEquivalent: 'curl localhost:4566/_localstack/health',
      };
    }

    const data = parseResult.data;
    const services = data.services || {};

    // Only show workshop-relevant services
    const relevantServiceNames = ['lambda', 'sqs', 'cloudformation', 'iam', 's3'];
    const relevantServices = Object.fromEntries(
      Object.entries(services)
        .filter(([name]) => relevantServiceNames.includes(name))
    );

    return {
      success: true,
      output: JSON.stringify(relevantServices, null, 2),
      cliEquivalent: 'curl localhost:4566/_localstack/health | jq .services',
    };
  } catch (e) {
    return {
      success: false,
      output: e instanceof Error ? e.message : 'Connection failed',
      cliEquivalent: 'curl localhost:4566/_localstack/health',
    };
  }
}

/**
 * Check Lambda Environment Variables
 */
export async function proofLambdaEnv(functionName: string): Promise<ProofResult> {
  try {
    const lambda = new Lambda({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    const config = await lambda.getFunctionConfiguration({
      FunctionName: functionName,
    });

    const allVars = config.Environment?.Variables || {};

    // Filter to only show relevant env vars (DB_*, QUEUE_*, LOCALSTACK_*)
    const relevantVars = Object.fromEntries(
      Object.entries(allVars).filter(([key]) =>
        key.startsWith('DB_') ||
        key.startsWith('QUEUE_') ||
        key.startsWith('LOCALSTACK_') ||
        key.startsWith('AWS_')
      )
    );

    return {
      success: true,
      output: JSON.stringify(relevantVars, null, 2),
      cliEquivalent: `awslocal lambda get-function-configuration --function-name ${functionName} | jq .Environment.Variables`,
    };
  } catch (e) {
    return {
      success: false,
      output: e instanceof Error ? e.message : 'Lambda not found',
      cliEquivalent: `awslocal lambda get-function-configuration --function-name ${functionName}`,
    };
  }
}

/**
 * List SQS Queues
 */
export async function proofSqsQueues(): Promise<ProofResult> {
  try {
    const sqs = new SQS({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    const result = await sqs.listQueues({});
    const queueUrls = result.QueueUrls || [];

    // Format queue names for readability
    const queueNames = queueUrls.map(url => {
      const parts = url.split('/');
      return parts[parts.length - 1];
    });

    return {
      success: true,
      output: queueNames.length > 0
        ? queueNames.map(name => `• ${name}`).join('\n')
        : '(keine Queues gefunden)',
      cliEquivalent: 'awslocal sqs list-queues --query QueueUrls',
    };
  } catch (e) {
    return {
      success: false,
      output: e instanceof Error ? e.message : 'SQS error',
      cliEquivalent: 'awslocal sqs list-queues',
    };
  }
}

/**
 * Get SQS Queue Attributes
 */
export async function proofSqsQueueAttributes(queueName: string): Promise<ProofResult> {
  try {
    const sqs = new SQS({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    // First get queue URL - must match exactly (not just prefix)
    const queues = await sqs.listQueues({ QueueNamePrefix: queueName });
    const queueUrl = queues.QueueUrls?.find(url => url.endsWith(`/${queueName}`));

    if (!queueUrl) {
      return {
        success: false,
        output: `Queue "${queueName}" nicht gefunden`,
        cliEquivalent: `awslocal sqs get-queue-attributes --queue-url <url>`,
      };
    }

    const attrs = await sqs.getQueueAttributes({
      QueueUrl: queueUrl,
      AttributeNames: ['VisibilityTimeout', 'RedrivePolicy', 'MessageRetentionPeriod'],
    });

    return {
      success: true,
      output: JSON.stringify(attrs.Attributes || {}, null, 2),
      cliEquivalent: `awslocal sqs get-queue-attributes --queue-url ${queueUrl}`,
    };
  } catch (e) {
    return {
      success: false,
      output: e instanceof Error ? e.message : 'SQS error',
      cliEquivalent: `awslocal sqs get-queue-attributes --queue-url <url>`,
    };
  }
}

/**
 * Invoke Lambda and show response
 */
export async function proofLambdaInvoke(functionName: string): Promise<ProofResult> {
  try {
    const lambda = new Lambda({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    const response = await lambda.invoke({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
    });

    const rawPayload = JSON.parse(
      new TextDecoder().decode(response.Payload)
    );

    // Validate with zod
    const parseResult = LambdaPayloadSchema.safeParse(rawPayload);
    const payload = parseResult.success ? parseResult.data : rawPayload;

    // Format output nicely
    let output = '';
    if (payload.statusCode) {
      output = `Status: ${payload.statusCode}\n`;
      if (payload.body) {
        try {
          const body = JSON.parse(payload.body);
          output += JSON.stringify(body, null, 2);
        } catch {
          output += payload.body;
        }
      }
    } else {
      output = JSON.stringify(payload, null, 2);
    }

    return {
      success: payload.statusCode === 200,
      output: output.substring(0, 500),
      cliEquivalent: `awslocal lambda invoke --function-name ${functionName} /dev/stdout`,
    };
  } catch (e) {
    return {
      success: false,
      output: e instanceof Error ? e.message : 'Lambda invocation failed',
      cliEquivalent: `awslocal lambda invoke --function-name ${functionName} /dev/stdout`,
    };
  }
}

/**
 * Check Database Connection
 */
export async function proofDatabaseConnection(): Promise<ProofResult> {
  try {
    const pg = await import('pg');
    const client = new pg.Client({
      host: workshopConfig.db.postgres.host,
      port: workshopConfig.db.postgres.port,
      database: workshopConfig.db.postgres.database,
      user: workshopConfig.db.postgres.user,
      password: workshopConfig.db.postgres.password,
      connectionTimeoutMillis: 5000,
    });

    await client.connect();
    // Tables are in 'lts' schema, not 'public'
    const result = await client.query('SELECT table_name FROM information_schema.tables WHERE table_schema = $1 LIMIT 5', ['lts']);
    await client.end();

    const tables = result.rows.map((r: { table_name: string }) => r.table_name);

    return {
      success: true,
      output: tables.length > 0
        ? `Tabellen im lts Schema:\n${tables.map(t => `• ${t}`).join('\n')}`
        : '(keine Tabellen gefunden)',
      cliEquivalent: 'psql -h localhost -U postgres -d longtermstorage -c "\\dt lts.*"',
    };
  } catch (e) {
    return {
      success: false,
      output: e instanceof Error ? e.message : 'Database connection failed',
      cliEquivalent: 'psql -h localhost -U postgres -d longtermstorage',
    };
  }
}

/**
 * Show database schema - tables that exist in lts schema
 */
export async function proofDatabaseSchema(): Promise<ProofResult> {
  try {
    const pg = await import('pg');
    const client = new pg.Client({
      host: workshopConfig.db.postgres.host,
      port: workshopConfig.db.postgres.port,
      database: workshopConfig.db.postgres.database,
      user: workshopConfig.db.postgres.user,
      password: workshopConfig.db.postgres.password,
      connectionTimeoutMillis: 5000,
    });

    await client.connect();
    const result = await client.query(`
      SELECT table_name,
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'lts' AND table_name = t.table_name) as columns
      FROM information_schema.tables t
      WHERE table_schema = 'lts'
      ORDER BY table_name
    `);
    await client.end();

    const tables = result.rows.map((r: { table_name: string; columns: string }) =>
      `• ${r.table_name} (${r.columns} Spalten)`
    );

    return {
      success: true,
      output: tables.length > 0
        ? `lts Schema:\n${tables.join('\n')}`
        : 'Schema lts existiert, aber keine Tabellen',
      cliEquivalent: 'psql -c "\\dt lts.*"',
    };
  } catch (e) {
    return {
      success: false,
      output: e instanceof Error ? e.message : 'Database error',
      cliEquivalent: 'psql -c "\\dt lts.*"',
    };
  }
}

/**
 * Check SQS Message Count for a specific queue
 */
export async function proofSqsMessageCount(queueName: string): Promise<ProofResult> {
  try {
    const sqs = new SQS({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    // Find queue URL
    const queues = await sqs.listQueues({ QueueNamePrefix: queueName });
    const queueUrl = queues.QueueUrls?.find(url => url.includes(queueName));

    if (!queueUrl) {
      return {
        success: false,
        output: `Queue "${queueName}" nicht gefunden`,
        cliEquivalent: `awslocal sqs get-queue-attributes --queue-url <url>`,
      };
    }

    const attrs = await sqs.getQueueAttributes({
      QueueUrl: queueUrl,
      AttributeNames: [
        'ApproximateNumberOfMessages',
        'ApproximateNumberOfMessagesNotVisible',
        'ApproximateNumberOfMessagesDelayed',
      ],
    });

    const visible = attrs.Attributes?.ApproximateNumberOfMessages || '0';
    const inFlight = attrs.Attributes?.ApproximateNumberOfMessagesNotVisible || '0';
    const delayed = attrs.Attributes?.ApproximateNumberOfMessagesDelayed || '0';

    return {
      success: true,
      output: `Queue: ${queueName}\n• Wartend: ${visible}\n• In Bearbeitung: ${inFlight}\n• Verzögert: ${delayed}`,
      cliEquivalent: `awslocal sqs get-queue-attributes --queue-url ${queueUrl} --attribute-names All`,
    };
  } catch (e) {
    return {
      success: false,
      output: e instanceof Error ? e.message : 'SQS error',
      cliEquivalent: `awslocal sqs get-queue-attributes --queue-url <url>`,
    };
  }
}

/**
 * Check DLQ Status
 */
export async function proofDlqStatus(): Promise<ProofResult> {
  try {
    const sqs = new SQS({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    // Find all DLQ queues (typically contain 'dlq' in name)
    const queues = await sqs.listQueues({});
    const dlqUrls = queues.QueueUrls?.filter(url => url.toLowerCase().includes('dlq')) || [];

    if (dlqUrls.length === 0) {
      return {
        success: true,
        output: '(keine DLQs gefunden)',
        cliEquivalent: 'awslocal sqs list-queues',
      };
    }

    const results: string[] = [];
    for (const queueUrl of dlqUrls) {
      const parts = queueUrl.split('/');
      const queueName = parts[parts.length - 1];

      const attrs = await sqs.getQueueAttributes({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
      });

      const msgCount = attrs.Attributes?.ApproximateNumberOfMessages || '0';
      const status = msgCount === '0' ? '✅' : '⚠️';
      results.push(`${status} ${queueName}: ${msgCount} Messages`);
    }

    return {
      success: true,
      output: results.join('\n'),
      cliEquivalent: 'awslocal sqs list-queues --query "QueueUrls[?contains(@, `dlq`)]"',
    };
  } catch (e) {
    return {
      success: false,
      output: e instanceof Error ? e.message : 'SQS error',
      cliEquivalent: 'awslocal sqs list-queues',
    };
  }
}

/**
 * Check Marking Tasks in Database
 */
export async function proofMarkingTasks(): Promise<ProofResult> {
  try {
    const pg = await import('pg');
    const client = new pg.Client({
      host: workshopConfig.db.postgres.host,
      port: workshopConfig.db.postgres.port,
      database: workshopConfig.db.postgres.database,
      user: workshopConfig.db.postgres.user,
      password: workshopConfig.db.postgres.password,
      connectionTimeoutMillis: 5000,
    });

    await client.connect();
    const result = await client.query(`
      SELECT status, COUNT(*) as count
      FROM lts.marking_tasks
      GROUP BY status
      ORDER BY status
    `);
    await client.end();

    if (result.rows.length === 0) {
      return {
        success: true,
        output: '(keine Marking Tasks gefunden)',
        cliEquivalent: 'psql -c "SELECT status, COUNT(*) FROM lts.marking_tasks GROUP BY status"',
      };
    }

    const statusLines = result.rows.map((r: { status: string; count: string }) => {
      const emoji = r.status === 'COMPLETED' ? '✅' :
                    r.status === 'PENDING' ? '⏳' :
                    r.status === 'IN_PROGRESS' ? '🔄' :
                    r.status === 'FAILED' ? '❌' : '❓';
      return `${emoji} ${r.status}: ${r.count}`;
    });

    return {
      success: true,
      output: statusLines.join('\n'),
      cliEquivalent: 'psql -c "SELECT status, COUNT(*) FROM lts.marking_tasks GROUP BY status"',
    };
  } catch (e) {
    return {
      success: false,
      output: e instanceof Error ? e.message : 'Database error',
      cliEquivalent: 'psql -c "SELECT * FROM lts.marking_tasks LIMIT 5"',
    };
  }
}

// Backwards compatibility alias
export const proofBackupMarkers = proofMarkingTasks;

/**
 * Check Lambda Event Source Mappings (shows what triggers the Lambda)
 */
export async function proofLambdaEventSources(functionName: string): Promise<ProofResult> {
  try {
    const lambda = new Lambda({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    const result = await lambda.listEventSourceMappings({
      FunctionName: functionName,
    });

    const mappings = result.EventSourceMappings || [];

    if (mappings.length === 0) {
      return {
        success: true,
        output: `Lambda "${functionName}" hat keine Event Source Mappings\n(wird manuell aufgerufen)`,
        cliEquivalent: `awslocal lambda list-event-source-mappings --function-name ${functionName}`,
      };
    }

    const lines: string[] = [];
    for (const mapping of mappings) {
      const source = mapping.EventSourceArn?.split(':').slice(-1)[0] || 'unknown';
      lines.push(`Event Source: ${source}`);
      lines.push(`  • Status: ${mapping.State || 'unknown'}`);
      lines.push(`  • BatchSize: ${mapping.BatchSize || 'default'}`);
      if (mapping.FunctionResponseTypes?.includes('ReportBatchItemFailures')) {
        lines.push(`  • ReportBatchItemFailures: ✅`);
      }
    }

    return {
      success: true,
      output: lines.join('\n'),
      cliEquivalent: `awslocal lambda list-event-source-mappings --function-name ${functionName}`,
    };
  } catch (e) {
    return {
      success: false,
      output: e instanceof Error ? e.message : 'Lambda error',
      cliEquivalent: `awslocal lambda list-event-source-mappings --function-name ${functionName}`,
    };
  }
}

/**
 * Check Lambda IAM Policy (shows what the Lambda can do)
 */
export async function proofLambdaIamPolicy(functionName: string): Promise<ProofResult> {
  try {
    const lambda = new Lambda({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    const config = await lambda.getFunctionConfiguration({
      FunctionName: functionName,
    });

    const roleArn = config.Role;
    if (!roleArn) {
      return {
        success: false,
        output: 'Keine IAM Role gefunden',
        cliEquivalent: `awslocal lambda get-function-configuration --function-name ${functionName}`,
      };
    }

    // Extract role name from ARN
    const roleName = roleArn.split('/').pop() || '';

    return {
      success: true,
      output: `Lambda Role: ${roleName}\n\nCDK generiert Policies automatisch:\n• sqs:SendMessage (wenn grantSendMessages)\n• sqs:ReceiveMessage (bei Event Source)\n• sqs:DeleteMessage (bei Event Source)`,
      cliEquivalent: `awslocal iam get-role-policy --role-name ${roleName} --policy-name <policy>`,
    };
  } catch (e) {
    return {
      success: false,
      output: e instanceof Error ? e.message : 'IAM error',
      cliEquivalent: `awslocal iam list-role-policies --role-name <role>`,
    };
  }
}

/**
 * Invoke Lambda with custom payload
 */
export async function proofLambdaInvokeWithPayload(
  functionName: string,
  payload: Record<string, unknown>
): Promise<ProofResult> {
  try {
    const lambda = new Lambda({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    const response = await lambda.invoke({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload),
    });

    const rawPayload = JSON.parse(
      new TextDecoder().decode(response.Payload)
    );

    // Format output nicely
    let output = '';
    if (rawPayload.statusCode) {
      output = `Status: ${rawPayload.statusCode}\n`;
      if (rawPayload.body) {
        try {
          const body = JSON.parse(rawPayload.body);
          output += JSON.stringify(body, null, 2);
        } catch {
          output += rawPayload.body;
        }
      }
    } else {
      output = JSON.stringify(rawPayload, null, 2);
    }

    return {
      success: rawPayload.statusCode === 200,
      output: output.substring(0, 500),
      cliEquivalent: `awslocal lambda invoke --function-name ${functionName} --payload '${JSON.stringify(payload)}' /dev/stdout`,
    };
  } catch (e) {
    return {
      success: false,
      output: e instanceof Error ? e.message : 'Lambda invocation failed',
      cliEquivalent: `awslocal lambda invoke --function-name ${functionName} /dev/stdout`,
    };
  }
}

// =============================================================================
// EXPERIMENT FUNCTIONS
// =============================================================================

/**
 * Experiment 1: Visibility Timeout zu kurz
 *
 * Demonstriert Doppelverarbeitung wenn visibilityTimeout < Lambda Processing Time
 * Multi-Step: 1) Queue Attribute prüfen 2) Mit Lambda Timeout vergleichen
 */
export async function experimentVisibilityTimeout(): Promise<ExperimentResult> {
  const steps: ExperimentStep[] = [];
  let visibilityTimeout = 0;
  const lambdaTimeout = 150; // Worker-Lambda-Timeout aus dem Stack (2,5 min)

  // Step 1: Queue Attribute abfragen
  const step1: ExperimentStep = {
    id: 'queue-attrs',
    title: 'Queue-Konfiguration prüfen',
    description: 'Schauen wir uns die SQS Queue-Einstellungen an...',
    command: 'awslocal sqs get-queue-attributes --queue-url .../lts-worker-queue --attribute-names VisibilityTimeout',
    thinkAboutIt: 'Was bedeutet VisibilityTimeout? Warum ist das wichtig für parallele Consumer?',
    minPauseSeconds: 3,
  };

  try {
    const sqs = new SQS({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    const queues = await sqs.listQueues({ QueueNamePrefix: 'lts-worker' });
    const queueUrl = queues.QueueUrls?.find(url => url.includes('lts-worker-queue'));

    if (!queueUrl) {
      step1.result = 'Queue "lts-worker-queue" nicht gefunden';
      step1.narrativeAfter = 'Die Queue existiert nicht. Ist das CDK-Stack deployed?';
    } else {
      const attrs = await sqs.getQueueAttributes({
        QueueUrl: queueUrl,
        AttributeNames: ['VisibilityTimeout'],
      });
      visibilityTimeout = parseInt(attrs.Attributes?.VisibilityTimeout || '0', 10);
      step1.result = `VisibilityTimeout: ${visibilityTimeout} Sekunden`;
      step1.narrativeAfter = `Die Queue versteckt Messages für ${visibilityTimeout}s vor anderen Consumern. Aber wie lange läuft der Worker?`;
    }
  } catch (e) {
    step1.result = `Fehler: ${e instanceof Error ? e.message : 'SQS nicht erreichbar'}`;
    step1.narrativeAfter = 'SQS ist nicht erreichbar.';
  }
  steps.push(step1);

  // Step 2: Lambda Timeout (aus CDK bekannt)
  const step2: ExperimentStep = {
    id: 'lambda-timeout',
    title: 'Lambda Timeout prüfen',
    description: 'Jetzt der Lambda Timeout...',
    command: 'awslocal lambda get-function-configuration --function-name LtsExecutorLambda | jq .Timeout',
    thinkAboutIt: 'Vergleiche: Wie verhalten sich VisibilityTimeout und Lambda Timeout zueinander?',
    minPauseSeconds: 4,
  };

  step2.result = `Lambda Timeout: ${lambdaTimeout} Sekunden (2,5 Minuten)`;
  step2.narrativeAfter = visibilityTimeout >= 6 * lambdaTimeout
    ? `${visibilityTimeout}s >= 6 × ${lambdaTimeout}s - die Message bleibt lange genug versteckt (AWS-Regel: mind. 6× Lambda-Timeout)!`
    : `${visibilityTimeout}s < 6 × ${lambdaTimeout}s - PROBLEM! Die Message kann sichtbar werden BEVOR der Lambda fertig ist!`;
  steps.push(step2);

  const isDanger = visibilityTimeout < 6 * lambdaTimeout;

  return {
    success: true,
    observation: isDanger
      ? `GEFAHR! VisibilityTimeout zu kurz!`
      : 'Korrekt konfiguriert.',
    steps,
    conclusion: {
      measuredValues: {
        'VisibilityTimeout': `${visibilityTimeout}s`,
        'Lambda Timeout': `${lambdaTimeout}s (2,5 Min)`,
        'Risiko': isDanger ? '⚠️ Doppelverarbeitung!' : '✅ Sicher',
      },
      ahaMessage: 'Visibility Timeout muss deutlich länger sein als der Lambda Timeout (AWS empfiehlt mind. 6×)! Sonst wird die Message wieder sichtbar während sie noch verarbeitet wird.',
      learnedMessage: 'Wenn zwei Lambdas dieselbe Message parallel verarbeiten, entstehen Duplikate oder Race Conditions.',
    },
  };
}

/**
 * Experiment 2: Zeit bis DLQ
 *
 * Berechnet die theoretische Zeit bis eine fehlgeschlagene Message in der DLQ landet
 * Formel: visibilityTimeout × maxReceiveCount
 * Multi-Step: 1) VisibilityTimeout 2) RedrivePolicy 3) Berechnung
 */
export async function experimentTimeToDLQ(): Promise<ExperimentResult> {
  const steps: ExperimentStep[] = [];
  let visibilityTimeout = 30;
  let maxReceiveCount = 3;

  // Step 1: Visibility Timeout abfragen
  const step1: ExperimentStep = {
    id: 'visibility',
    title: 'VisibilityTimeout prüfen',
    description: 'Erst mal schauen wie lange eine Message unsichtbar bleibt...',
    command: 'awslocal sqs get-queue-attributes --attribute-names VisibilityTimeout',
    thinkAboutIt: 'Nach dem VisibilityTimeout wird die Message wieder sichtbar. Was passiert dann?',
    minPauseSeconds: 3,
  };

  try {
    const sqs = new SQS({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    const queues = await sqs.listQueues({ QueueNamePrefix: 'lts-worker' });
    const queueUrl = queues.QueueUrls?.find(url => url.includes('lts-worker-queue'));

    if (queueUrl) {
      const attrs = await sqs.getQueueAttributes({
        QueueUrl: queueUrl,
        AttributeNames: ['VisibilityTimeout', 'RedrivePolicy'],
      });

      visibilityTimeout = parseInt(attrs.Attributes?.VisibilityTimeout || '30', 10);
      step1.result = `VisibilityTimeout: ${visibilityTimeout} Sekunden`;
      step1.narrativeAfter = `Nach jedem fehlgeschlagenen Versuch wartet SQS ${visibilityTimeout}s bevor die Message erneut zugestellt wird.`;

      // Parse RedrivePolicy für Step 2
      const redrivePolicy = attrs.Attributes?.RedrivePolicy;
      if (redrivePolicy) {
        try {
          const policy = JSON.parse(redrivePolicy);
          maxReceiveCount = policy.maxReceiveCount || 3;
        } catch {
          // Keep default
        }
      }
    } else {
      step1.result = 'Queue nicht gefunden';
      step1.narrativeAfter = 'Die Queue existiert nicht.';
    }
  } catch (e) {
    step1.result = `Fehler: ${e instanceof Error ? e.message : 'SQS nicht erreichbar'}`;
  }
  steps.push(step1);

  // Step 2: RedrivePolicy (maxReceiveCount)
  const step2: ExperimentStep = {
    id: 'redrive',
    title: 'RedrivePolicy prüfen',
    description: 'Wie oft darf eine Message fehlschlagen bevor sie in die DLQ wandert?',
    command: 'awslocal sqs get-queue-attributes --attribute-names RedrivePolicy',
    thinkAboutIt: 'Überlege: Wie viele Versuche sind sinnvoll? Zu wenige = echte Fehler. Zu viele = verschwendete Ressourcen.',
    minPauseSeconds: 3,
  };

  step2.result = `maxReceiveCount: ${maxReceiveCount}`;
  step2.narrativeAfter = `Nach ${maxReceiveCount} fehlgeschlagenen Versuchen geht die Message in die Dead Letter Queue.`;
  steps.push(step2);

  // Step 3: Berechnung
  const timeToDLQSeconds = visibilityTimeout * maxReceiveCount;
  const timeToDLQMinutes = (timeToDLQSeconds / 60).toFixed(1);

  const step3: ExperimentStep = {
    id: 'calculation',
    title: 'Zeit bis DLQ berechnen',
    description: 'Jetzt die Mathematik...',
    command: `# Formel: VisibilityTimeout × maxReceiveCount = Zeit bis DLQ`,
    thinkAboutIt: 'Wie würdest du einen CloudWatch Alarm konfigurieren der anschlägt BEVOR Messages in der DLQ landen?',
    minPauseSeconds: 4,
  };

  step3.result = `${visibilityTimeout}s × ${maxReceiveCount} = ${timeToDLQSeconds}s (${timeToDLQMinutes} Minuten)`;
  step3.narrativeAfter = 'Diese Zeit ist MATHEMATISCH VORHERSAGBAR! Nützlich für Monitoring und Alarme.';
  steps.push(step3);

  return {
    success: true,
    observation: `Zeit bis DLQ: ${timeToDLQSeconds}s (${timeToDLQMinutes} Min)`,
    steps,
    conclusion: {
      measuredValues: {
        'VisibilityTimeout': `${visibilityTimeout}s`,
        'Max Retries': maxReceiveCount,
        'Zeit bis DLQ': `${timeToDLQSeconds}s (${timeToDLQMinutes} Min)`,
      },
      ahaMessage: `Nach exakt ${timeToDLQSeconds} Sekunden landet eine fehlschlagende Message in der DLQ - mathematisch vorhersagbar!`,
      learnedMessage: 'Die DLQ-Latenz ist kein Zufall sondern berechenbar. Das hilft bei der Planung von Monitoring und Alarmen.',
    },
  };
}

/**
 * Experiment 3: Exponential Backoff vs Konstant
 *
 * Vergleicht die Anzahl der Polls bei konstantem vs. exponentiellem Backoff
 * Multi-Step: 1) Konstantes Polling 2) Exponentielles Backoff 3) Vergleich
 */
export async function experimentBackoffComparison(): Promise<ExperimentResult> {
  const steps: ExperimentStep[] = [];
  const totalTimeSeconds = 120;

  // Step 1: Konstantes Polling berechnen
  const constantInterval = 5;
  const constantPolls = Math.floor(totalTimeSeconds / constantInterval);

  const step1: ExperimentStep = {
    id: 'constant',
    title: 'Konstantes Polling (alle 5s)',
    description: 'Zuerst simulieren wir konstantes Polling alle 5 Sekunden...',
    command: '# Simulation: while true; do poll(); sleep 5; done',
    result: `${constantPolls} Polls in 2 Minuten`,
    narrativeAfter: `Bei konstantem Polling: ${constantPolls} API-Aufrufe. Jetzt schauen wir uns Exponential Backoff an...`,
    thinkAboutIt: 'Was passiert wenn 1000 Jobs gleichzeitig alle 5s pollen? Stichwort: Thundering Herd.',
    minPauseSeconds: 3,
  };
  steps.push(step1);

  // Step 2: Exponentielles Backoff berechnen
  let exponentialPolls = 0;
  let currentDelay = 5;
  let elapsed = 0;
  const maxDelay = 60;
  const delays: number[] = [];

  while (elapsed < totalTimeSeconds) {
    exponentialPolls++;
    delays.push(currentDelay);
    elapsed += currentDelay;
    currentDelay = Math.min(currentDelay * 2, maxDelay);
  }

  const step2: ExperimentStep = {
    id: 'exponential',
    title: 'Exponential Backoff (5, 10, 20, 40, 60...)',
    description: 'Jetzt mit Exponential Backoff: Verdopplung der Wartezeit nach jedem Poll...',
    command: '# Delays: 5s → 10s → 20s → 40s → 60s → 60s...',
    result: `${exponentialPolls} Polls in 2 Minuten\nDelays: ${delays.slice(0, 6).join('s → ')}s...`,
    narrativeAfter: `Nur ${exponentialPolls} statt ${constantPolls} Polls! Aber wie viel spart das?`,
    thinkAboutIt: 'Warum ist es wichtig, ein Maximum (60s) zu setzen? Was wäre ohne Cap?',
    minPauseSeconds: 3,
  };
  steps.push(step2);

  // Step 3: Vergleich
  const savings = Math.round((1 - exponentialPolls / constantPolls) * 100);

  const step3: ExperimentStep = {
    id: 'comparison',
    title: 'Ersparnis berechnen',
    description: 'Jetzt der Vergleich...',
    command: `# (1 - ${exponentialPolls}/${constantPolls}) × 100 = Ersparnis`,
    result: `🎉 ${savings}% weniger API-Calls!`,
    narrativeAfter: 'Das reduziert Kosten UND verhindert Throttling bei AWS!',
  };
  steps.push(step3);

  return {
    success: true,
    observation: `${savings}% Ersparnis durch Exponential Backoff`,
    steps,
    conclusion: {
      measuredValues: {
        'Konstant (5s)': `${constantPolls} Polls`,
        'Exponential': `${exponentialPolls} Polls`,
        'Ersparnis': `${savings}%`,
      },
      ahaMessage: `Exponential Backoff spart ${savings}% API-Calls - das ist bares Geld bei AWS!`,
      learnedMessage: 'Backoff verhindert auch Throttling: AWS limitiert zu häufige Anfragen. Mit Backoff bleibst du unter dem Limit.',
    },
  };
}

/**
 * Experiment 4: SQS Message vergessen
 *
 * Zeigt was passiert wenn DB-Task erstellt wird aber keine SQS Message gesendet wird
 * Multi-Step: 1) DB prüfen 2) Queue prüfen 3) Vergleich
 */
export async function experimentSqsMessageForgotten(): Promise<ExperimentResult> {
  const steps: ExperimentStep[] = [];
  let dbTasks = 0;
  let queueMessages = 0;

  // Step 1: Datenbank abfragen
  const step1: ExperimentStep = {
    id: 'db-check',
    title: 'Datenbank prüfen',
    description: 'Lass uns die Datenbank prüfen...',
    command: 'psql -c "SELECT COUNT(*) FROM lts.marking_tasks WHERE status = \'PENDING\'"',
    thinkAboutIt: 'Wenn Tasks in der DB sind - woher weiß der Worker dass er sie verarbeiten soll?',
    minPauseSeconds: 3,
  };

  try {
    const pg = await import('pg');
    const client = new pg.Client({
      host: workshopConfig.db.postgres.host,
      port: workshopConfig.db.postgres.port,
      database: workshopConfig.db.postgres.database,
      user: workshopConfig.db.postgres.user,
      password: workshopConfig.db.postgres.password,
      connectionTimeoutMillis: 3000,
    });
    await client.connect();
    const result = await client.query(`SELECT COUNT(*) as count FROM lts.marking_tasks WHERE status = 'PENDING'`);
    dbTasks = parseInt(result.rows[0]?.count || '0', 10);
    await client.end();

    step1.result = `${dbTasks} Tasks mit Status PENDING gefunden`;
    step1.narrativeAfter = dbTasks > 0
      ? `Okay, ${dbTasks} Tasks warten in der DB. Jetzt schauen wir ob entsprechende Messages in der Queue sind...`
      : 'Keine PENDING Tasks in der DB. Experiment nicht aussagekräftig ohne Tasks.';
  } catch (e) {
    step1.result = `Fehler: ${e instanceof Error ? e.message : 'DB nicht erreichbar'}`;
    step1.narrativeAfter = 'Die Datenbank ist nicht erreichbar. Trotzdem schauen wir mal in die Queue...';
  }
  steps.push(step1);

  // Step 2: SQS Queue abfragen
  const step2: ExperimentStep = {
    id: 'queue-check',
    title: 'Queue prüfen',
    description: 'Jetzt die SQS Queue...',
    command: 'awslocal sqs get-queue-attributes --queue-url .../lts-worker-queue --attribute-names ApproximateNumberOfMessages',
    thinkAboutIt: 'Der Worker schaut NUR in die Queue - nie in die DB! Was bedeutet das für unsere Tasks?',
    minPauseSeconds: 3,
  };

  try {
    const sqs = new SQS({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    const queues = await sqs.listQueues({ QueueNamePrefix: 'lts-worker' });
    const queueUrl = queues.QueueUrls?.find(url => url.includes('lts-worker-queue'));

    if (queueUrl) {
      const attrs = await sqs.getQueueAttributes({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
      });
      queueMessages = parseInt(attrs.Attributes?.ApproximateNumberOfMessages || '0', 10);
      step2.result = `ApproximateNumberOfMessages: ${queueMessages}`;
      step2.narrativeAfter = dbTasks !== queueMessages
        ? `Hmm, ${queueMessages} Messages für ${dbTasks} DB-Tasks...`
        : `Perfekt synchron: ${queueMessages} Messages für ${dbTasks} Tasks.`;
    } else {
      step2.result = 'Queue "lts-worker-queue" nicht gefunden';
      step2.narrativeAfter = 'Die Queue existiert nicht. Ist das CDK-Stack deployed?';
    }
  } catch (e) {
    step2.result = `Fehler: ${e instanceof Error ? e.message : 'SQS nicht erreichbar'}`;
    step2.narrativeAfter = 'SQS ist nicht erreichbar.';
  }
  steps.push(step2);

  // Step 3: Vergleich
  const discrepancy = dbTasks - queueMessages;
  const step3: ExperimentStep = {
    id: 'comparison',
    title: 'Vergleich',
    description: 'Jetzt der entscheidende Vergleich...',
    command: `# Rechnung: ${dbTasks} DB-Tasks - ${queueMessages} Queue-Messages = ?`,
  };

  if (discrepancy > 0) {
    step3.result = `⚠️ ${discrepancy} Tasks OHNE Queue-Message!`;
    step3.narrativeAfter = `Diese ${discrepancy} Tasks werden NIEMALS vom Worker abgeholt!`;
  } else if (discrepancy < 0) {
    step3.result = `🤔 ${Math.abs(discrepancy)} mehr Messages als Tasks`;
    step3.narrativeAfter = 'Mehr Messages als Tasks - vielleicht wurden Tasks schon verarbeitet?';
  } else {
    step3.result = '✅ Alles synchron!';
    step3.narrativeAfter = 'Jeder Task hat seine Message. Kein Problem hier.';
  }
  steps.push(step3);

  return {
    success: true,
    observation: discrepancy > 0
      ? `${discrepancy} verwaiste Tasks gefunden!`
      : 'Keine verwaisten Tasks.',
    steps,
    conclusion: {
      measuredValues: {
        'DB Tasks (PENDING)': dbTasks,
        'Queue Messages': queueMessages,
        'Verwaiste Tasks': discrepancy > 0 ? discrepancy : 0,
      },
      ahaMessage: 'Ohne SQS Message weiß NIEMAND dass Arbeit wartet! Der Worker schaut NUR in die Queue.',
      learnedMessage: 'SQS und DB sind NICHT automatisch synchron. Wenn du einen Task in die DB schreibst, MUSST du auch eine Message senden!',
    },
  };
}

/**
 * Experiment 5: correlationId fehlt
 *
 * Demonstriert das Debugging-Problem ohne durchgängige Tracing IDs
 * Multi-Step: 1) Logs OHNE correlationId 2) Logs MIT correlationId 3) Vergleich
 */
export async function experimentCorrelationIdMissing(): Promise<ExperimentResult> {
  const steps: ExperimentStep[] = [];

  // Step 1: Logs ohne correlationId
  const logsWithout = [
    'MarkingStarter: Processing table users',
    'MarkingStarter: Processing table orders',
    'LtsExecutor: Starting batch 1/5',
    'LtsExecutor: Starting batch 1/3',
    'LtsExecutor: ERROR: Connection timeout',
    'StatusPoller: Checking status',
  ];

  const step1: ExperimentStep = {
    id: 'logs-without',
    title: 'Logs OHNE correlationId',
    description: 'Stell dir vor du bekommst einen Alarm: "LtsExecutor Error". Du schaust in die Logs...',
    command: 'awslocal logs filter-log-events --log-group /aws/lambda/LtsExecutor',
    result: logsWithout.map(l => `  ${l}`).join('\n'),
    narrativeAfter: 'Welcher Fehler gehört zu welcher Tabelle? 🤔 users? orders? Unmöglich zu sagen!',
    thinkAboutIt: 'Versuche den Fehler zu finden: Welche Tabelle ist betroffen? Welcher Request?',
    minPauseSeconds: 5,
  };
  steps.push(step1);

  // Step 2: Logs mit correlationId
  const logsWith = [
    '[corr-abc-123] MarkingStarter: Processing table users',
    '[corr-abc-123] LtsExecutor: Starting batch 1/5',
    '[corr-abc-123] LtsExecutor: Batch completed',
    '[corr-abc-123] StatusPoller: All batches done!',
  ];

  const step2: ExperimentStep = {
    id: 'logs-with',
    title: 'Logs MIT correlationId',
    description: 'Jetzt mit correlationId - ein grep zeigt den kompletten Flow:',
    command: 'awslocal logs filter-log-events --filter-pattern "corr-abc-123"',
    result: logsWith.map(l => `  ${l}`).join('\n'),
    narrativeAfter: 'Der komplette Request-Flow von Anfang bis Ende - in 30 Sekunden gefunden!',
    thinkAboutIt: 'Wie viel Zeit hätte die Suche OHNE correlationId gedauert?',
    minPauseSeconds: 3,
  };
  steps.push(step2);

  // Step 3: Zeitvergleich
  const step3: ExperimentStep = {
    id: 'time-comparison',
    title: 'Debug-Zeit Vergleich',
    description: 'Wie lange dauert das Debugging?',
    command: '# Zeit für Fehlersuche',
    result: 'OHNE correlationId: 30+ Minuten\nMIT correlationId: 30 Sekunden',
    narrativeAfter: 'Das ist ein Faktor 60x! In Production mit 1000 parallelen Requests ist es noch schlimmer.',
  };
  steps.push(step3);

  return {
    success: true,
    observation: 'correlationId spart 60x Debug-Zeit!',
    steps,
    conclusion: {
      measuredValues: {
        'Logs ohne Kontext': `${logsWithout.length} Zeilen`,
        'Debug ohne ID': '30+ Minuten',
        'Debug mit ID': '30 Sekunden',
      },
      ahaMessage: 'Ohne correlationId ist Distributed Debugging ein Albtraum! Ein einfacher String spart Stunden.',
      learnedMessage: 'Führe IMMER eine correlationId durch alle Services durch. Generiere sie am Anfang und logge sie überall.',
    },
  };
}

/**
 * Experiment 6: DLQ Redrive Demo
 *
 * Zeigt den korrekten Workflow für DLQ Messages: Debug → Fix → Redrive
 * Multi-Step: 1) DLQs finden 2) Messages zählen 3) Workflow erklären
 */
export async function experimentDlqRedrive(): Promise<ExperimentResult> {
  const steps: ExperimentStep[] = [];
  let totalDlqMessages = 0;
  const dlqDetails: Array<{ name: string; messages: number }> = [];

  // Step 1: DLQs finden
  const step1: ExperimentStep = {
    id: 'find-dlqs',
    title: 'Dead Letter Queues finden',
    description: 'Zuerst schauen wir welche DLQs existieren...',
    command: 'awslocal sqs list-queues --query "QueueUrls[?contains(@, `dlq`)]"',
    thinkAboutIt: 'Warum braucht jede wichtige Queue eine eigene DLQ? Was wäre mit einer gemeinsamen DLQ?',
    minPauseSeconds: 3,
  };

  try {
    const sqs = new SQS({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    const queues = await sqs.listQueues({});
    const dlqUrls = queues.QueueUrls?.filter(url => url.toLowerCase().includes('dlq')) || [];

    if (dlqUrls.length === 0) {
      step1.result = 'Keine DLQs gefunden';
      step1.narrativeAfter = 'Es gibt noch keine Dead Letter Queues. Das CDK-Stack definiert sie aber!';
    } else {
      const dlqNames = dlqUrls.map(url => url.split('/').pop());
      step1.result = dlqNames.map(n => `• ${n}`).join('\n');
      step1.narrativeAfter = `${dlqUrls.length} DLQ(s) gefunden. Schauen wir ob Messages drin sind...`;

      // Messages zählen für Step 2
      for (const queueUrl of dlqUrls) {
        const attrs = await sqs.getQueueAttributes({
          QueueUrl: queueUrl,
          AttributeNames: ['ApproximateNumberOfMessages'],
        });
        const msgCount = parseInt(attrs.Attributes?.ApproximateNumberOfMessages || '0', 10);
        totalDlqMessages += msgCount;
        dlqDetails.push({
          name: queueUrl.split('/').pop() || 'unknown',
          messages: msgCount,
        });
      }
    }
  } catch (e) {
    step1.result = `Fehler: ${e instanceof Error ? e.message : 'SQS nicht erreichbar'}`;
  }
  steps.push(step1);

  // Step 2: Messages zählen
  const step2: ExperimentStep = {
    id: 'count-messages',
    title: 'Messages in DLQs zählen',
    description: 'Wie viele fehlgeschlagene Messages warten?',
    command: 'awslocal sqs get-queue-attributes --attribute-names ApproximateNumberOfMessages',
    thinkAboutIt: 'DLQ Messages sind wie Bug-Tickets: Was ist der nächste Schritt wenn du welche findest?',
    minPauseSeconds: 3,
  };

  if (dlqDetails.length > 0) {
    step2.result = dlqDetails.map(d => `${d.name}: ${d.messages} Messages`).join('\n');
    step2.narrativeAfter = totalDlqMessages > 0
      ? `${totalDlqMessages} Messages warten auf Behandlung! Was tun?`
      : 'Alle DLQs sind leer - super, keine Fehler!';
  } else {
    step2.result = 'Keine DLQs vorhanden';
    step2.narrativeAfter = 'Ohne DLQs können wir den Workflow nicht demonstrieren.';
  }
  steps.push(step2);

  // Step 3: Workflow erklären
  const step3: ExperimentStep = {
    id: 'workflow',
    title: 'Der richtige Redrive-Workflow',
    description: 'WICHTIG: Wie geht man mit DLQ-Messages um?',
    command: '# Korrekter Workflow für DLQ-Handling',
    thinkAboutIt: 'Warum ist "Redrive → Fixen → Redrive" ein Anti-Pattern? Was ist das Risiko?',
    minPauseSeconds: 4,
  };

  step3.result = [
    '1️⃣  Message inspizieren (receive-message)',
    '2️⃣  Fehlerursache analysieren',
    '3️⃣  Bug fixen und deployen',
    '4️⃣  DANN erst redriven (start-message-move-task)',
  ].join('\n');
  step3.narrativeAfter = 'BLINDES REDRIVEN = gleicher Fehler erneut! Erst debuggen, dann redriven.';
  steps.push(step3);

  return {
    success: true,
    observation: totalDlqMessages > 0
      ? `${totalDlqMessages} Messages in DLQs!`
      : 'Keine fehlgeschlagenen Messages.',
    steps,
    conclusion: {
      measuredValues: {
        'DLQs gefunden': dlqDetails.length,
        'Messages gesamt': totalDlqMessages,
        'Workflow-Schritte': 4,
      },
      ahaMessage: 'Blindes Redriven führt nur zu erneuten Fehlern! Erst Ursache finden, dann fixen, dann redriven.',
      learnedMessage: 'DLQ Messages sind wie Tickets: Du musst das Problem lösen bevor du sie schließt.',
    },
  };
}
