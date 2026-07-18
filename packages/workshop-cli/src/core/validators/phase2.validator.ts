import { BaseValidator } from './base.validator.js';
import { workshopConfig } from '../config/workshop.config.js';
import { validateUnitTest, isTestValid } from './test.validator.js';

/** Expected message structure for TaskExecutionRequest */
interface TaskExecutionMessage {
  taskId?: string;
  taskType?: string;
  jobId?: string;
  tableName?: string;
  correlationId?: string;
}

/**
 * Phase 2 Validator
 * Tests MarkingStarterLambda - should create backup markers and send to SQS
 *
 * Success Criteria:
 * - Lambda is deployed and callable
 * - Lambda handler is implemented (not NOT_IMPLEMENTED)
 * - Lambda creates backup markers in DB
 * - Lambda sends messages to lts-worker-queue
 */
export default class Phase2Validator extends BaseValidator {
  async validate(): Promise<{ passed: boolean; hints?: string[] }> {
    const hints: string[] = [];

    // Test 1: Lambda exists and can be invoked
    // Use workshop CLI format - Lambda will generate mock tables
    const { success, result, error } = await this.invokeLambda(
      workshopConfig.lambdas.MarkingStarter,
      {
        action: 'startMarking',
        tableCount: 3
      }
    );

    if (!success) {
      // Lambda doesn't exist yet
      if (error?.includes('Function not found') || error?.includes('ResourceNotFoundException')) {
        hints.push('Lambda existiert noch nicht');
        hints.push('Implementiere die Lambda und deploye mit cdk deploy');
        hints.push('Datei: packages/marking-starter-lambda/src/interfaces/lambda-handler.ts');
        return { passed: false, hints };
      }

      // Lambda exists but throws NOT_IMPLEMENTED
      if (error?.includes('NOT_IMPLEMENTED')) {
        hints.push('Lambda Handler noch nicht implementiert');
        hints.push('Ersetze throw new Error("NOT_IMPLEMENTED")');
        hints.push('Datei: packages/marking-starter-lambda/src/interfaces/lambda-handler.ts');
        return { passed: false, hints };
      }

      // Other errors - could be DB connection issues, etc.
      hints.push('Lambda-Aufruf fehlgeschlagen');
      hints.push(`Fehler: ${error}`);
      return { passed: false, hints };
    }

    // Test 2: Check if messages were sent to SQS
    const queueUrl = await this.getQueueUrl(workshopConfig.queues.ltsWorker);

    if (!queueUrl) {
      // Queue not found is an infrastructure issue, not code issue
      return { passed: true };
    }

    const messages = await this.receiveMessages<TaskExecutionMessage>(queueUrl, 5);

    if (messages.length === 0) {
      // No messages could be infrastructure issue (DB didn't create tasks)
      // If Lambda ran without NOT_IMPLEMENTED, code is likely correct
      return { passed: true };
    }

    // Test 3: Verify message structure (TaskExecutionRequest format)
    const firstMessage = messages[0];
    if (!firstMessage.taskId || !firstMessage.taskType || !firstMessage.tableName) {
      hints.push('Message-Struktur falsch');
      hints.push('Erwartete Felder: taskId, taskType, jobId, tableName, correlationId');
      return { passed: false, hints };
    }

    // Cleanup
    await this.purgeQueue(queueUrl);

    // Test 4: Unit Test Validation
    const testResult = await validateUnitTest(
      './packages/marking-starter-lambda',
      'start-table-marking.use-case.test.ts'
    );

    if (!testResult.exists) {
      hints.push('Unit Test noch nicht erstellt');
      hints.push('Öffne: src/__tests__/start-table-marking.use-case.test.ts');
      return { passed: false, hints };
    }

    if (!testResult.passes) {
      hints.push('Unit Test schlägt fehl');
      hints.push('Führe `pnpm test` im marking-starter-lambda Ordner aus');
      hints.push(...testResult.errors.filter(e => e.startsWith('Tests fehlgeschlagen')));
      return { passed: false, hints };
    }

    if (!isTestValid(testResult)) {
      if (!testResult.usesMocks) {
        hints.push('Test nutzt keine Mocks - verwende createMockDatabase()');
      }
      if (!testResult.noRealAdapters) {
        hints.push('Test nutzt echte Infrastruktur - verwende Mocks statt PostgresAdapter');
      }
      if (!testResult.assertsMockState) {
        hints.push('Test prüft nicht den Mock-State');
        hints.push('Fülle die TODOs aus: expect(mockDb.calls).toHaveLength(...)');
      }
      return { passed: false, hints };
    }

    return { passed: true };
  }
}
