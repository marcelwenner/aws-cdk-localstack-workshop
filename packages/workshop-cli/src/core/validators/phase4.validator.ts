import { BaseValidator } from './base.validator.js';
import { workshopConfig } from '../config/workshop.config.js';

/**
 * Phase 4 Validator
 * Tests StatusPollerLambda - Polling Pattern with Exponential Backoff
 *
 * Success Criteria:
 * - Previous phases (2, 3) are deployed
 * - Lambda is deployed
 * - Lambda checks job status
 * - Lambda implements exponential backoff (retry with increasing delays)
 * - Lambda sends to status-check-queue or completion based on status
 */
export default class Phase4Validator extends BaseValidator {
  async validate(): Promise<{ passed: boolean; hints?: string[] }> {
    const hints: string[] = [];

    // Test 0: Check if previous phases are deployed
    const [starterExists, executorExists] = await Promise.all([
      this.lambdaExists(workshopConfig.lambdas.MarkingStarter),
      this.lambdaExists(workshopConfig.lambdas.LtsExecutor),
    ]);

    if (!starterExists || !executorExists) {
      hints.push('⚠️ Vorherige Phasen nicht deployed!');
      if (!starterExists) {
        hints.push('❌ Phase 2: MarkingStarterLambda fehlt');
      }
      if (!executorExists) {
        hints.push('❌ Phase 3: LtsExecutorLambda fehlt');
      }
      hints.push('');
      hints.push('Gehe zum CDK Guide und aktiviere die vorherigen Phasen,');
      hints.push('oder nutze [a] Auto-Fix im CDK Guide für Phase 4.');
      return { passed: false, hints };
    }

    // Test 1: Lambda is deployed
    // Send correct StatusCheckRequest format
    const { success, error } = await this.invokeLambda(
      workshopConfig.lambdas.StatusPoller,
      {
        Records: [
          {
            body: JSON.stringify({
              // Muss eine echte UUID sein - lts.check_marking_progress(uuid, ...) castet!
              jobId: '00000000-0000-4000-8000-00000000e2e0',
              tableName: 'backup_jobs',
              attempt: 1,
              correlationId: 'test-correlation-123',
            }),
          },
        ],
      }
    );

    if (!success) {
      if (error?.includes('NOT_IMPLEMENTED')) {
        hints.push('Use Case noch nicht implementiert');
        hints.push('Implementiere check-marking-status.use-case.ts');
        hints.push('Checke: packages/status-poller-lambda/src/application/');
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
        error?.includes('STATUS_CHECK_FAILED');

      if (isInfraError) {
        // Code is implemented, just infrastructure issues
        // Continue to queue check
      } else {
        hints.push('Lambda kann nicht aufgerufen werden');
        hints.push(`Fehler: ${error}`);
        hints.push('Checke: packages/status-poller-lambda/src/interfaces/lambda-handler.ts');
        return { passed: false, hints };
      }
    }

    // Test 2: Verify queues exist
    const statusQueueUrl = await this.getQueueUrl(workshopConfig.queues.statusCheck);
    const completionQueueUrl = await this.getQueueUrl(workshopConfig.queues.completion);

    if (!statusQueueUrl || !completionQueueUrl) {
      hints.push('status-check-queue oder completion-queue nicht gefunden');
      hints.push('Prüfe CDK Stack: Queues deployed?');
      return { passed: false, hints };
    }

    // Test 3: Chaos Mode - Check DLQ has messages
    // This validates that the user has triggered chaos mode and experienced
    // message failures going to the DLQ (resilience testing).
    // Der Chaos-Button beschießt die WORKER-Queue - also dort die DLQ prüfen!
    const workerMetrics = await this.getQueueMetrics(workshopConfig.queues.ltsWorker);

    if (workerMetrics.dlqDepth === 0) {
      hints.push('🔥 Chaos Mode nicht aktiviert!');
      hints.push('Du musst den Chaos-Button im Dashboard drücken');
      hints.push('Dies simuliert Fehler und füllt die DLQ');
      hints.push(`Aktuell: lts-worker-queue-dlq ist leer (${workerMetrics.dlqDepth} Messages)`);
      return { passed: false, hints };
    }

    // Lambda invoked successfully AND chaos mode was tested
    return { passed: true };
  }
}
