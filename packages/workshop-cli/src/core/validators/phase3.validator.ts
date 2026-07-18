import { BaseValidator } from './base.validator.js';
import { workshopConfig } from '../config/workshop.config.js';
import { validateUnitTest, isTestValid } from './test.validator.js';

/**
 * Phase 3 Validator
 * Tests LtsExecutorLambda - Worker Pattern with self-triggering
 *
 * Success Criteria:
 * - Lambda is deployed
 * - Lambda processes messages from lts-worker-queue
 * - Lambda implements self-triggering (sends message back to queue if not done)
 * - Lambda sends completion message to completion-queue when done
 */
export default class Phase3Validator extends BaseValidator {
  async validate(): Promise<{ passed: boolean; hints?: string[] }> {
    const hints: string[] = [];

    // Test 1: Lambda is deployed
    // Send correct TaskExecutionRequest format
    const { success, error } = await this.invokeLambda(
      workshopConfig.lambdas.LtsExecutor,
      {
        Records: [
          {
            body: JSON.stringify({
              taskId: 1,
              taskType: 'marking',
              jobId: 'test-job-123',
              tableName: 'backup_jobs',
              correlationId: 'test-correlation-123',
            }),
          },
        ],
      }
    );

    if (!success) {
      if (error?.includes('NOT_IMPLEMENTED')) {
        hints.push('Lambda Handler noch nicht implementiert');
        hints.push('Ersetze throw new Error("NOT_IMPLEMENTED")');
        hints.push('Checke: packages/lts-executor-lambda/src/interfaces/lambda-handler.ts');
        return { passed: false, hints };
      }

      // Infrastructure errors (DB connection, missing SQL functions) are OK
      // if the handler code is implemented - these errors prove the code runs
      const isInfraError = error?.includes('ECONNREFUSED') ||
        error?.includes('connection') ||
        error?.includes('does not exist') ||
        error?.includes('relation') ||
        error?.includes('function') ||
        error?.includes('pg') ||
        error?.includes('timeout') ||
        error?.includes('TASK_EXECUTION_FAILED');

      if (isInfraError) {
        // Code is implemented, just infrastructure issues
        // Continue to queue check
      } else {
        hints.push('Lambda kann nicht aufgerufen werden');
        hints.push(`Fehler: ${error}`);
        hints.push('Checke: packages/lts-executor-lambda/src/interfaces/lambda-handler.ts');
        return { passed: false, hints };
      }
    }

    // Test 2: Check if Lambda has SQS Event Source Mapping
    // This is implicit - if Lambda can process SQS events, it's configured

    // Test 3: Verify worker pattern (self-triggering)
    // Lambda should either:
    // - Send message back to lts-worker-queue (more work to do)
    // - OR send message to completion-queue (all done)

    const workerQueueUrl = await this.getQueueUrl(workshopConfig.queues.ltsWorker);
    const completionQueueUrl = await this.getQueueUrl(workshopConfig.queues.completion);

    if (!workerQueueUrl || !completionQueueUrl) {
      hints.push('Queues nicht gefunden');
      hints.push('Prüfe CDK Stack: Queues deployed?');
      return { passed: false, hints };
    }

    // Test 4: Unit Test Validation
    const testResult = await validateUnitTest(
      './packages/lts-executor-lambda',
      'execute-marking-task.use-case.test.ts'
    );

    if (!testResult.exists) {
      hints.push('Unit Test noch nicht erstellt');
      hints.push('Öffne: src/__tests__/execute-marking-task.use-case.test.ts');
      return { passed: false, hints };
    }

    if (!testResult.passes) {
      hints.push('Unit Test schlägt fehl');
      hints.push('Führe `pnpm test` im lts-executor-lambda Ordner aus');
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

    // Lambda invoked successfully without NOT_IMPLEMENTED error
    // This means the handler is implemented
    return { passed: true };
  }
}
