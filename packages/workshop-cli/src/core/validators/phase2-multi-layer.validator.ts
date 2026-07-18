/**
 * Phase 2 Multi-Layer Validator
 *
 * Validates MarkingStarterLambda implementation:
 * - L1: Lambda deployed with correct env vars
 * - L2: Lambda runs without NOT_IMPLEMENTED
 * - L3: DB tasks created + SQS messages sent
 * - L4: Unit test quality
 * - L5: Quiz/Challenge (from workshop state)
 */

import { LAMBDA_NAMES, QUEUE_NAMES, PHASE_IDS } from '../../shared/constants.js';
import type { LambdaInvocationResult } from '../infrastructure/infrastructure.port.js';
import type {
  LayerResult,
  ValidationConfig,
  SqsIntegrationConfig,
  QualityConfig,
} from './layers/types.js';
import { passedLayer, failedLayer, partialLayer } from './layers/scorer.js';
import { MESSAGE_VALIDATORS } from './layers/types.js';
import { MultiLayerValidator, ValidationContext } from './multi-layer.validator.js';
import { validateUnitTest, isTestValid } from './test.validator.js';

// =============================================================================
// Phase 2 Configuration
// =============================================================================

/** Expected message structure for TaskExecutionRequest */
interface TaskExecutionMessage {
  taskId?: string;
  taskType?: string;
  jobId?: string;
  tableName?: string;
  correlationId?: string;
}

/** Default config for Phase 2 validation */
export const PHASE2_CONFIG: ValidationConfig = {
  phaseId: PHASE_IDS.markingStarter,
  existence: {
    lambda: LAMBDA_NAMES.MarkingStarter,
    queue: QUEUE_NAMES.ltsWorker,
    envVars: ['DB_HOST', 'DB_NAME', 'LTS_WORKER_QUEUE_URL'],
  },
  functional: {
    // Workshop CLI format - Lambda generates mock tables internally
    payload: {
      action: 'startMarking',
      tableCount: 3,
    },
    schema: {
      tasksCreated: 'number',
    },
  },
  integration: {
    sqs: {
      queue: QUEUE_NAMES.ltsWorker,
      minMessages: 1,
      validatorName: 'workerMessage',
    },
  },
  quality: {
    testFile: 'start-table-marking.use-case.test.ts',
    packagePath: './packages/marking-starter-lambda',
  },
};

// =============================================================================
// Phase 2 Validator Implementation
// =============================================================================

export class Phase2MultiLayerValidator extends MultiLayerValidator {
  constructor(ctx: ValidationContext) {
    super(ctx);
  }

  // ---------------------------------------------------------------------------
  // L1: Existence Check
  // ---------------------------------------------------------------------------

  protected async checkExistence(): Promise<LayerResult> {
    const feedback: string[] = [];
    const { existence } = this.config;

    // Check Lambda exists
    if (existence.lambda) {
      const exists = await this.infra.lambdaExists(existence.lambda);
      if (!exists) {
        feedback.push('Lambda existiert noch nicht');
        feedback.push('Implementiere die Lambda und deploye mit cdk deploy');
        feedback.push('Datei: packages/marking-starter-lambda/src/interfaces/lambda-handler.ts');
        return failedLayer('existence', feedback);
      }
    }

    // Check Queue exists
    if (existence.queue) {
      const queueUrl = await this.infra.getQueueUrl(existence.queue);
      if (!queueUrl) {
        feedback.push(`Queue ${existence.queue} nicht gefunden`);
        feedback.push('Führe cdk deploy aus');
        return failedLayer('existence', feedback);
      }
    }

    // Check environment variables
    if (existence.lambda && existence.envVars && existence.envVars.length > 0) {
      const env = await this.infra.getLambdaEnv(existence.lambda);
      const missing = existence.envVars.filter((v) => !env[v]);
      if (missing.length > 0) {
        feedback.push(`Fehlende Env Vars: ${missing.join(', ')}`);
        return failedLayer('existence', feedback, 50);
      }
    }

    return passedLayer('existence');
  }

  // ---------------------------------------------------------------------------
  // L2: Functional Check
  // ---------------------------------------------------------------------------

  protected async checkFunctional(): Promise<LayerResult> {
    const feedback: string[] = [];
    const { existence, functional } = this.config;

    if (!existence.lambda) {
      return failedLayer('functional', ['Keine Lambda konfiguriert']);
    }

    const result = await this.infra.invokeLambda<unknown>(
      existence.lambda,
      functional.payload
    );

    // Handle specific error types
    if (!result.success) {
      switch (result.errorType) {
        case 'NOT_FOUND':
          feedback.push('Lambda existiert nicht');
          feedback.push('Führe cdk deploy aus');
          return failedLayer('functional', feedback);

        case 'NOT_IMPLEMENTED':
          feedback.push('Lambda Handler noch nicht implementiert');
          feedback.push('Ersetze throw new Error("NOT_IMPLEMENTED")');
          feedback.push('Datei: packages/marking-starter-lambda/src/interfaces/lambda-handler.ts');
          return failedLayer('functional', feedback);

        case 'TIMEOUT':
          feedback.push('Lambda Timeout - prüfe DB Connection');
          return failedLayer('functional', feedback, 20);

        case 'RUNTIME_ERROR':
        default:
          feedback.push('Lambda-Aufruf fehlgeschlagen');
          feedback.push(`Fehler: ${result.errorMessage}`);
          return failedLayer('functional', feedback);
      }
    }

    // Validate response schema (simple check)
    if (functional.schema) {
      const payload = result.payload as Record<string, unknown> | undefined;
      for (const [key, expectedType] of Object.entries(functional.schema)) {
        const value = payload?.[key];
        if (value === undefined) {
          feedback.push(`Response fehlt Feld: ${key}`);
          return failedLayer('functional', feedback, 50);
        }
        // Simple type check
        if (expectedType !== 'any') {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (actualType !== expectedType) {
            feedback.push(`Feld ${key}: erwartet ${expectedType}, bekommen ${actualType}`);
            return failedLayer('functional', feedback, 50);
          }
        }
      }
    }

    return passedLayer('functional');
  }

  // ---------------------------------------------------------------------------
  // L3: Integration Check
  // ---------------------------------------------------------------------------

  protected async checkIntegration(): Promise<LayerResult> {
    const feedback: string[] = [];
    const { integration, existence, functional } = this.config;

    if (!integration?.sqs) {
      return passedLayer('integration');
    }

    const sqsConfig = integration.sqs as SqsIntegrationConfig;
    const queueUrl = await this.infra.getQueueUrl(sqsConfig.queue);

    if (!queueUrl) {
      // Queue not found is infrastructure issue, give partial credit
      feedback.push(`Queue ${sqsConfig.queue} nicht gefunden`);
      return partialLayer('integration', 50, feedback);
    }

    // Purge queue before test
    await this.infra.purgeQueue(sqsConfig.queue);

    // Re-invoke Lambda to generate fresh messages
    if (existence.lambda) {
      await this.infra.invokeLambda(existence.lambda, functional.payload);
    }

    // Check messages
    const messages = await this.infra.receiveMessages<TaskExecutionMessage>(
      sqsConfig.queue,
      5
    );

    if (messages.length === 0) {
      feedback.push('Keine SQS Messages gesendet');
      feedback.push('Die Lambda muss Messages an lts-worker-queue senden');
      return failedLayer('integration', feedback);
    }

    // Validate message count
    if (sqsConfig.minMessages && messages.length < sqsConfig.minMessages) {
      feedback.push(`Nur ${messages.length} Messages, erwartet mindestens ${sqsConfig.minMessages}`);
      return partialLayer('integration', 70, feedback);
    }

    // Validate message structure
    if (sqsConfig.validatorName) {
      const validator = MESSAGE_VALIDATORS[sqsConfig.validatorName];
      const firstMessage = messages[0];
      if (!validator(firstMessage)) {
        feedback.push('Message-Struktur falsch');
        feedback.push('Erwartete Felder: taskId, taskType, jobId, tableName, correlationId');
        return failedLayer('integration', feedback, 30);
      }
    }

    // Cleanup
    await this.infra.purgeQueue(sqsConfig.queue);

    return passedLayer('integration');
  }

  // ---------------------------------------------------------------------------
  // L4: Quality Check
  // ---------------------------------------------------------------------------

  protected async checkQuality(): Promise<LayerResult> {
    const feedback: string[] = [];
    const { quality } = this.config;

    if (!quality) {
      return passedLayer('quality');
    }

    const qualityConfig = quality as QualityConfig;
    const testResult = await validateUnitTest(
      qualityConfig.packagePath,
      qualityConfig.testFile
    );

    if (!testResult.exists) {
      feedback.push('Unit Test noch nicht erstellt');
      feedback.push(`Öffne: ${qualityConfig.packagePath}/src/__tests__/${qualityConfig.testFile}`);
      return failedLayer('quality', feedback);
    }

    if (!testResult.passes) {
      feedback.push('Unit Test schlägt fehl');
      feedback.push(`Führe pnpm test im ${qualityConfig.packagePath} Ordner aus`);
      feedback.push(...testResult.errors.filter((e) => e.startsWith('Tests fehlgeschlagen')));
      return failedLayer('quality', feedback);
    }

    // Check test quality criteria
    let score = 100;
    if (!testResult.usesMocks) {
      feedback.push('Test nutzt keine Mocks - verwende createMockDatabase()');
      score -= 30;
    }
    if (!testResult.noRealAdapters) {
      feedback.push('Test nutzt echte Infrastruktur - verwende Mocks statt PostgresAdapter');
      score -= 30;
    }
    if (!testResult.assertsMockState) {
      feedback.push('Test prüft nicht den Mock-State');
      feedback.push('Fülle die TODOs aus: expect(mockDb.calls).toHaveLength(...)');
      score -= 20;
    }

    if (score < 100) {
      return partialLayer('quality', score, feedback);
    }

    return passedLayer('quality');
  }

  // ---------------------------------------------------------------------------
  // L5: Understanding Check (reads from workshop state)
  // ---------------------------------------------------------------------------

  protected async checkUnderstanding(): Promise<LayerResult> {
    // TODO: Read quiz/challenge status from workshop state
    // For now, return default passing
    return passedLayer('understanding');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Phase 2 validator with default config.
 */
export function createPhase2Validator(
  infrastructure: import('../infrastructure/infrastructure.port.js').InfrastructurePort
): Phase2MultiLayerValidator {
  return new Phase2MultiLayerValidator({
    phaseId: PHASE_IDS.markingStarter,
    config: PHASE2_CONFIG,
    infrastructure,
  });
}
