/**
 * Workshop CDK Stack
 *
 * ✅ PRE-BUILT: SQS Queues + GetTableListLambda (Referenz)
 * ⚠️ TODO: Andere Lambdas werden Phase für Phase hinzugefügt!
 *
 * Workshop-Ablauf:
 * - Phase 1: GetTableListLambda verstehen (✅ bereits deployed)
 * - Phase 2: MarkingStarterLambda implementieren + deployen
 * - Phase 3: LtsExecutorLambda implementieren + deployen
 * - Phase 4: StatusPollerLambda implementieren + deployen
 * - Phase 5: Log Quest (Debugging, kein CDK)
 * - Phase 6: DeletionStarterLambda (Stretch - CDK komplett selbst schreiben!)
 *
 * Für jede Phase:
 * 1. Use Case in packages/{lambda}/src/application/use-cases/ implementieren
 * 2. Lambda-Definition hier auskommentieren
 * 3. `cdklocal deploy` ausführen
 *
 * Simplified for workshop - no VPC, no EventBridge
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import * as path from 'path';

export class WorkshopStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================================================
    // SQS Queues (✅ PRE-BUILT - Infrastructure)
    // ========================================================================

    // Dead Letter Queues
    const ltsWorkerDLQ = new sqs.Queue(this, 'LtsWorkerDLQ', {
      queueName: 'lts-worker-queue-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    const statusCheckDLQ = new sqs.Queue(this, 'StatusCheckDLQ', {
      queueName: 'status-check-queue-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    // Worker Queue (for LtsExecutorLambda)
    const ltsWorkerQueue = new sqs.Queue(this, 'LtsWorkerQueue', {
      queueName: 'lts-worker-queue',
      visibilityTimeout: cdk.Duration.seconds(900), // 15 min = 6 × Worker-Lambda-Timeout (AWS-Regel)
      deadLetterQueue: {
        queue: ltsWorkerDLQ,
        maxReceiveCount: 3,
      },
    });

    // Status Check Queue (for StatusPollerLambda)
    const statusCheckQueue = new sqs.Queue(this, 'StatusCheckQueue', {
      queueName: 'status-check-queue',
      visibilityTimeout: cdk.Duration.seconds(300), // 5 minutes
      deadLetterQueue: {
        queue: statusCheckDLQ,
        maxReceiveCount: 10,
      },
    });

    // Completion Queue (for completion events)
    const completionQueue = new sqs.Queue(this, 'CompletionQueue', {
      queueName: 'completion-queue',
      visibilityTimeout: cdk.Duration.seconds(30),
    });

    // ========================================================================
    // Lambda Environment Variables (shared)
    // ========================================================================

    const lambdaEnvironment = {
      // Database
      // Lambdas run in LocalStack (Docker), so use Docker service name 'postgres'
      // not 'host.docker.internal' which is for container-to-host communication
      DB_HOST: process.env.DB_HOST || 'postgres',
      DB_PORT: process.env.DB_PORT || '5432',
      DB_NAME: process.env.DB_NAME || 'longtermstorage',
      DB_USER: process.env.DB_USER || 'postgres',
      DB_PASSWORD: process.env.DB_PASSWORD || 'postgres',

      // AWS - Note: AWS_REGION is automatically set by Lambda runtime
      LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566',

      // Release-Marker für Error-Logs (Incident-Zuordnung). Die Workshop-CLI
      // setzt WORKSHOP_RELEASE_ID pro Session - Deploys erben ihn automatisch.
      RELEASE_ID: process.env.WORKSHOP_RELEASE_ID || 'local-dev',

      // Queue URLs
      LTS_WORKER_QUEUE_URL: ltsWorkerQueue.queueUrl,
      STATUS_CHECK_QUEUE_URL: statusCheckQueue.queueUrl,
      COMPLETION_QUEUE_URL: completionQueue.queueUrl,
    };

    // ========================================================================
    // Lambda Functions
    // ========================================================================

    // ✅ Lambda 1: GetTableList (PRE-BUILT Reference)
    // This is your REFERENCE - study this!
    const getTableListLambda = new nodejs.NodejsFunction(this, 'GetTableListLambda', {
      functionName: 'GetTableListLambda',
      entry: path.join(__dirname, '../../packages/get-table-list-lambda/src/interfaces/lambda-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: lambdaEnvironment,
      bundling: {
        minify: false,
        sourceMap: true,
        externalModules: [],
      },
    });

    // ⚠️ TODO PHASE 2: MarkingStarterLambda
    // 📋 SCHRITTE:
    // 1. Implementiere den Use Case in:
    //    packages/marking-starter-lambda/src/application/use-cases/start-table-marking.use-case.ts
    // 2. Entferne die Blockkommentare um den Code unten (lösche /* und */)
    // 3. Führe `cdklocal deploy` aus
    // 📝 LEARNING: NodejsFunction automatically bundles TypeScript to JavaScript
    // 📝 LEARNING: grantSendMessages() adds IAM permissions to send to queue
    /*
    const markingStarterLambda = new nodejs.NodejsFunction(this, 'MarkingStarterLambda', {
      functionName: 'MarkingStarterLambda',
      entry: path.join(__dirname, '../../packages/marking-starter-lambda/src/interfaces/lambda-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: lambdaEnvironment,
      bundling: {
        minify: false,
        sourceMap: true,
      },
    });
    // Grant SQS permissions (this Lambda sends to worker queue)
    ltsWorkerQueue.grantSendMessages(markingStarterLambda);
    */

    // ⚠️ TODO PHASE 3: LtsExecutorLambda
    // 📋 SCHRITTE:
    // 1. Implementiere die Use Cases in:
    //    - packages/lts-executor-lambda/src/application/use-cases/execute-marking-task.use-case.ts
    //    - packages/lts-executor-lambda/src/application/use-cases/execute-deletion-task.use-case.ts
    // 2. Entferne die Blockkommentare um den Code unten (lösche /* und */)
    // 3. Führe `cdklocal deploy` aus
    // 💡 HINT: This one is TRIGGERED by SQS, so it needs an Event Source!
    // 📝 LEARNING: SqsEventSource triggers Lambda when messages arrive
    // 📝 LEARNING: Worker needs both consume AND send permissions (self-triggering!)
    /*
    const ltsExecutorLambda = new nodejs.NodejsFunction(this, 'LtsExecutorLambda', {
      functionName: 'LtsExecutorLambda',
      entry: path.join(__dirname, '../../packages/lts-executor-lambda/src/interfaces/lambda-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(150), // 2,5 min pro Batch - Queue-VisibilityTimeout (900s) = 6× davon
      memorySize: 1024,
      environment: lambdaEnvironment,
      bundling: {
        minify: false,
        sourceMap: true,
      },
    });
    // SQS Event Source (this makes the Lambda triggered by the queue)
    ltsExecutorLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(ltsWorkerQueue, {
        batchSize: 1, // Process one message at a time
        maxBatchingWindow: cdk.Duration.seconds(0),
      })
    );
    // Grant permissions
    ltsWorkerQueue.grantConsumeMessages(ltsExecutorLambda); // Read from queue
    ltsWorkerQueue.grantSendMessages(ltsExecutorLambda);    // Send back (self-trigger!)
    completionQueue.grantSendMessages(ltsExecutorLambda);   // Send completion
    */

    // ⚠️ TODO PHASE 4: StatusPollerLambda
    // 📋 SCHRITTE:
    // 1. Implementiere den Use Case in:
    //    packages/status-poller-lambda/src/application/use-cases/check-marking-status.use-case.ts
    // 2. Entferne die Blockkommentare um den Code unten (lösche /* und */)
    // 3. Führe `cdklocal deploy` aus
    // 💡 HINT: Very similar to LtsExecutorLambda, but uses statusCheckQueue
    // 📝 LEARNING: Poller also needs send permission (for delayed messages!)
    /*
    const statusPollerLambda = new nodejs.NodejsFunction(this, 'StatusPollerLambda', {
      functionName: 'StatusPollerLambda',
      entry: path.join(__dirname, '../../packages/status-poller-lambda/src/interfaces/lambda-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: lambdaEnvironment,
      bundling: {
        minify: false,
        sourceMap: true,
      },
    });
    // SQS Event Source
    statusPollerLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(statusCheckQueue, {
        batchSize: 1,
      })
    );
    // Grant permissions
    statusCheckQueue.grantConsumeMessages(statusPollerLambda);
    statusCheckQueue.grantSendMessages(statusPollerLambda); // For rescheduling with delay
    completionQueue.grantSendMessages(statusPollerLambda);
    */

    // ⚠️ TODO PHASE 6 (Stretch): DeletionStarterLambda - JETZT OHNE NETZ!
    //
    // 🎓 Bis hierhin hast du Lambda-Definitionen nur ENTKOMMENTIERT.
    //    Jetzt schreibst du eine KOMPLETT SELBST - das ist der Transfer-Beweis!
    //
    // 📋 ANFORDERUNGEN (der Handler-Code ist fertig in packages/deletion-starter-lambda):
    //    1. NodejsFunction 'DeletionStarterLambda'
    //       - entry: packages/deletion-starter-lambda/src/interfaces/lambda-handler.ts
    //       - Runtime Node 20, Timeout 30s, Memory 512, environment: lambdaEnvironment
    //    2. Die Lambda sendet Deletion-Tasks an die ltsWorkerQueue
    //       → Welche grant*-Methode braucht sie? (Least Privilege!)
    //    3. KEIN Event Source - sie wird direkt invoked (wie MarkingStarter)
    //
    // 🔍 SO PRÜFST DU DICH SELBST:
    //    - `cdklocal diff`  → Was würde sich ändern? (IAM Policy gefunden?)
    //    - `cdklocal synth` → Finde DEINE Lambda + Policy im CloudFormation Template
    //    - `cdklocal deploy` und dann (jobId muss eine echte UUID sein!):
    //      awslocal lambda invoke --function-name DeletionStarterLambda \
    //        --payload '{"jobId":"11111111-2222-4333-8444-555555555555","tableName":"demo_table_1"}' /dev/stdout
    //    - Bonus: Schreibe einen Assertions-Test in cdk/test/workshop-stack.test.ts!
    //
    // 💡 Nutze die MarkingStarterLambda (Phase 2) als Vorlage - aber tippe selbst,
    //    kein Copy-Paste. Muscle Memory ist das Ziel.

    // ========================================================================
    // Outputs
    // ========================================================================

    new cdk.CfnOutput(this, 'GetTableListLambdaName', {
      value: getTableListLambda.functionName,
      description: 'GetTableList Lambda (PRE-BUILT)',
    });

    new cdk.CfnOutput(this, 'LtsWorkerQueueUrl', {
      value: ltsWorkerQueue.queueUrl,
      description: 'Worker Queue URL',
    });

    new cdk.CfnOutput(this, 'StatusCheckQueueUrl', {
      value: statusCheckQueue.queueUrl,
      description: 'Status Check Queue URL',
    });

    new cdk.CfnOutput(this, 'CompletionQueueUrl', {
      value: completionQueue.queueUrl,
      description: 'Completion Queue URL',
    });
  }
}

/*
 * ✅ LEARNING CHECKPOINTS
 *
 * After completing this stack, you should understand:
 *
 * 1. CDK Constructs (NodejsFunction, Queue, etc.)
 * 2. Lambda Configuration (timeout, memory, environment)
 * 3. SQS Event Sources (how Lambdas are triggered)
 * 4. IAM Permissions (grantSendMessages, grantConsumeMessages)
 * 5. Dead Letter Queues (for error handling)
 *
 * 💡 Pattern to follow:
 * - Define Lambda with NodejsFunction
 * - Add environment variables
 * - Add Event Source (if SQS-triggered)
 * - Grant permissions (send/consume)
 *
 * Questions? Run: npm run workshop hint
 */
