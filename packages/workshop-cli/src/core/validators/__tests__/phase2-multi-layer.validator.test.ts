import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Phase2MultiLayerValidator,
  PHASE2_CONFIG,
  createPhase2Validator,
} from '../phase2-multi-layer.validator.js';
import { MockInfrastructurePort } from '../../infrastructure/mock-infrastructure.port.js';
import { LAMBDA_NAMES, QUEUE_NAMES, PHASE_IDS } from '../../../shared/constants.js';

// Mock the test.validator module
vi.mock('../test.validator.js', () => ({
  validateUnitTest: vi.fn().mockResolvedValue({
    exists: true,
    passes: true,
    usesMocks: true,
    noRealAdapters: true,
    assertsMockState: true,
    errors: [],
  }),
  isTestValid: vi.fn().mockReturnValue(true),
}));

describe('Phase2MultiLayerValidator', () => {
  let mockInfra: MockInfrastructurePort;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInfra = new MockInfrastructurePort();
  });

  // ===========================================================================
  // L1: Existence Tests
  // ===========================================================================

  describe('L1: Existence', () => {
    it('should fail when Lambda does not exist', async () => {
      mockInfra.setLambdaNotFound(LAMBDA_NAMES.MarkingStarter);

      const validator = new Phase2MultiLayerValidator({
        phaseId: PHASE_IDS.markingStarter,
        config: PHASE2_CONFIG,
        infrastructure: mockInfra,
      });

      const result = await validator.validate();

      expect(result.passed).toBe(false);
      expect(result.layers[0].layer).toBe('existence');
      expect(result.layers[0].passed).toBe(false);
      expect(result.feedback).toContain('Lambda existiert noch nicht');
    });

    it('should fail when Queue does not exist', async () => {
      mockInfra
        .setLambdaExists(LAMBDA_NAMES.MarkingStarter, true)
        .setLambdaEnv(LAMBDA_NAMES.MarkingStarter, {
          DB_HOST: 'localhost',
          DB_NAME: 'test',
          LTS_WORKER_QUEUE_URL: 'http://queue',
        })
        .setQueueUrl(QUEUE_NAMES.ltsWorker, null); // Queue not found

      const validator = new Phase2MultiLayerValidator({
        phaseId: PHASE_IDS.markingStarter,
        config: PHASE2_CONFIG,
        infrastructure: mockInfra,
      });

      const result = await validator.validate();

      expect(result.passed).toBe(false);
      expect(result.layers[0].layer).toBe('existence');
      expect(result.layers[0].passed).toBe(false);
    });

    it('should fail with partial score when env vars missing', async () => {
      mockInfra
        .setLambdaExists(LAMBDA_NAMES.MarkingStarter, true)
        .setLambdaEnv(LAMBDA_NAMES.MarkingStarter, {
          DB_HOST: 'localhost',
          // Missing: DB_NAME, LTS_WORKER_QUEUE_URL
        })
        .setQueueUrl(QUEUE_NAMES.ltsWorker, 'http://queue');

      const validator = new Phase2MultiLayerValidator({
        phaseId: PHASE_IDS.markingStarter,
        config: PHASE2_CONFIG,
        infrastructure: mockInfra,
      });

      const result = await validator.validate();

      expect(result.passed).toBe(false);
      expect(result.layers[0].layer).toBe('existence');
      expect(result.layers[0].passed).toBe(false);
      expect(result.layers[0].score).toBe(50); // Partial score for missing env vars
    });

    it('should pass when all infrastructure exists', async () => {
      mockInfra
        .setLambdaExists(LAMBDA_NAMES.MarkingStarter, true)
        .setLambdaEnv(LAMBDA_NAMES.MarkingStarter, {
          DB_HOST: 'localhost',
          DB_NAME: 'test',
          LTS_WORKER_QUEUE_URL: 'http://queue',
        })
        .setQueueUrl(QUEUE_NAMES.ltsWorker, 'http://queue')
        .setLambdaSuccess(LAMBDA_NAMES.MarkingStarter, { success: true });

      const validator = new Phase2MultiLayerValidator({
        phaseId: PHASE_IDS.markingStarter,
        config: PHASE2_CONFIG,
        infrastructure: mockInfra,
      });

      const result = await validator.validate();

      expect(result.layers[0].layer).toBe('existence');
      expect(result.layers[0].passed).toBe(true);
    });
  });

  // ===========================================================================
  // L2: Functional Tests
  // ===========================================================================

  describe('L2: Functional', () => {
    beforeEach(() => {
      // Setup passing L1
      mockInfra
        .setLambdaExists(LAMBDA_NAMES.MarkingStarter, true)
        .setLambdaEnv(LAMBDA_NAMES.MarkingStarter, {
          DB_HOST: 'localhost',
          DB_NAME: 'test',
          LTS_WORKER_QUEUE_URL: 'http://queue',
        })
        .setQueueUrl(QUEUE_NAMES.ltsWorker, 'http://queue');
    });

    it('should fail when Lambda returns NOT_IMPLEMENTED', async () => {
      mockInfra.setLambdaNotImplemented(LAMBDA_NAMES.MarkingStarter);

      const validator = new Phase2MultiLayerValidator({
        phaseId: PHASE_IDS.markingStarter,
        config: PHASE2_CONFIG,
        infrastructure: mockInfra,
      });

      const result = await validator.validate();

      expect(result.passed).toBe(false);
      expect(result.layers[1].layer).toBe('functional');
      expect(result.layers[1].passed).toBe(false);
      expect(result.feedback.some(f => f.includes('NOT_IMPLEMENTED') || f.includes('nicht implementiert'))).toBe(true);
    });

    it('should fail when Lambda returns runtime error', async () => {
      mockInfra.setLambdaResponse(LAMBDA_NAMES.MarkingStarter, {
        success: false,
        errorType: 'RUNTIME_ERROR',
        errorMessage: 'Cannot read property x of undefined',
      });

      const validator = new Phase2MultiLayerValidator({
        phaseId: PHASE_IDS.markingStarter,
        config: PHASE2_CONFIG,
        infrastructure: mockInfra,
      });

      const result = await validator.validate();

      expect(result.passed).toBe(false);
      expect(result.layers[1].layer).toBe('functional');
      expect(result.layers[1].passed).toBe(false);
    });

    it('should pass when Lambda succeeds with correct schema', async () => {
      mockInfra.setLambdaSuccess(LAMBDA_NAMES.MarkingStarter, {
        success: true,
        tasksCreated: 5,
      });

      const validator = new Phase2MultiLayerValidator({
        phaseId: PHASE_IDS.markingStarter,
        config: PHASE2_CONFIG,
        infrastructure: mockInfra,
      });

      const result = await validator.validate();

      expect(result.layers[1].layer).toBe('functional');
      expect(result.layers[1].passed).toBe(true);
    });
  });

  // ===========================================================================
  // L3: Integration Tests
  // ===========================================================================

  describe('L3: Integration', () => {
    beforeEach(() => {
      // Setup passing L1 and L2
      mockInfra
        .setLambdaExists(LAMBDA_NAMES.MarkingStarter, true)
        .setLambdaEnv(LAMBDA_NAMES.MarkingStarter, {
          DB_HOST: 'localhost',
          DB_NAME: 'test',
          LTS_WORKER_QUEUE_URL: 'http://queue',
        })
        .setQueueUrl(QUEUE_NAMES.ltsWorker, 'http://queue')
        .setLambdaSuccess(LAMBDA_NAMES.MarkingStarter, { success: true, tasksCreated: 3 });
    });

    it('should fail when no SQS messages sent', async () => {
      // The validator purges the queue and then invokes Lambda.
      // Since our mock Lambda doesn't actually send messages, the queue stays empty.
      // Don't set any messages - this simulates Lambda not sending anything.

      const validator = new Phase2MultiLayerValidator({
        phaseId: PHASE_IDS.markingStarter,
        config: PHASE2_CONFIG,
        infrastructure: mockInfra,
      });

      const result = await validator.validate();

      const integrationLayer = result.layers.find(l => l.layer === 'integration');
      expect(integrationLayer?.passed).toBe(false);
      expect(integrationLayer?.feedback).toContain('Keine SQS Messages gesendet');
    });

    it('should fail when message structure is wrong', async () => {
      // For this test, we need the messages to appear AFTER the Lambda invocation.
      // We'll use a custom mock that sends messages when Lambda is invoked.
      const customMock = new MockInfrastructurePort();
      customMock
        .setLambdaExists(LAMBDA_NAMES.MarkingStarter, true)
        .setLambdaEnv(LAMBDA_NAMES.MarkingStarter, {
          DB_HOST: 'localhost',
          DB_NAME: 'test',
          LTS_WORKER_QUEUE_URL: 'http://queue',
        })
        .setQueueUrl(QUEUE_NAMES.ltsWorker, 'http://queue');

      // Override invokeLambda to send a bad message
      const originalInvoke = customMock.invokeLambda.bind(customMock);
      customMock.invokeLambda = async (name, payload) => {
        const result = await originalInvoke(name, payload);
        // Simulate Lambda sending a malformed message
        await customMock.sendMessage(QUEUE_NAMES.ltsWorker, { wrongField: 'value' });
        return result;
      };
      customMock.setLambdaSuccess(LAMBDA_NAMES.MarkingStarter, { success: true, tasksCreated: 3 });

      const validator = new Phase2MultiLayerValidator({
        phaseId: PHASE_IDS.markingStarter,
        config: PHASE2_CONFIG,
        infrastructure: customMock,
      });

      const result = await validator.validate();

      const integrationLayer = result.layers.find(l => l.layer === 'integration');
      expect(integrationLayer?.passed).toBe(false);
      expect(integrationLayer?.feedback.some(f => f.includes('Message-Struktur'))).toBe(true);
    });

    it('should pass when messages are sent correctly', async () => {
      // Override invokeLambda to send a valid message
      const originalInvoke = mockInfra.invokeLambda.bind(mockInfra);
      mockInfra.invokeLambda = async (name, payload) => {
        const result = await originalInvoke(name, payload);
        // Simulate Lambda sending a correct message
        await mockInfra.sendMessage(QUEUE_NAMES.ltsWorker, {
          taskId: 'task-1',
          taskType: 'BACKUP',
          jobId: 'job-1',
          tableName: 'users',
          correlationId: 'corr-1',
        });
        return result;
      };

      const validator = new Phase2MultiLayerValidator({
        phaseId: PHASE_IDS.markingStarter,
        config: PHASE2_CONFIG,
        infrastructure: mockInfra,
      });

      const result = await validator.validate();

      const integrationLayer = result.layers.find(l => l.layer === 'integration');
      expect(integrationLayer?.passed).toBe(true);
    });
  });

  // ===========================================================================
  // Full Validation Flow
  // ===========================================================================

  describe('Full Validation Flow', () => {
    it('should return early when L1 fails (no L2-L5 executed)', async () => {
      mockInfra.setLambdaNotFound(LAMBDA_NAMES.MarkingStarter);

      const validator = new Phase2MultiLayerValidator({
        phaseId: PHASE_IDS.markingStarter,
        config: PHASE2_CONFIG,
        infrastructure: mockInfra,
      });

      const result = await validator.validate();

      // Only L1 should be in results
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].layer).toBe('existence');
      expect(result.passed).toBe(false);
    });

    it('should return early when L2 fails (no L3-L5 executed)', async () => {
      mockInfra
        .setLambdaExists(LAMBDA_NAMES.MarkingStarter, true)
        .setLambdaEnv(LAMBDA_NAMES.MarkingStarter, {
          DB_HOST: 'localhost',
          DB_NAME: 'test',
          LTS_WORKER_QUEUE_URL: 'http://queue',
        })
        .setQueueUrl(QUEUE_NAMES.ltsWorker, 'http://queue')
        .setLambdaNotImplemented(LAMBDA_NAMES.MarkingStarter);

      const validator = new Phase2MultiLayerValidator({
        phaseId: PHASE_IDS.markingStarter,
        config: PHASE2_CONFIG,
        infrastructure: mockInfra,
      });

      const result = await validator.validate();

      // L1 and L2 should be in results
      expect(result.layers).toHaveLength(2);
      expect(result.passed).toBe(false);
    });

    it('should execute all layers when L1 and L2 pass', async () => {
      mockInfra
        .setLambdaExists(LAMBDA_NAMES.MarkingStarter, true)
        .setLambdaEnv(LAMBDA_NAMES.MarkingStarter, {
          DB_HOST: 'localhost',
          DB_NAME: 'test',
          LTS_WORKER_QUEUE_URL: 'http://queue',
        })
        .setQueueUrl(QUEUE_NAMES.ltsWorker, 'http://queue')
        .setLambdaSuccess(LAMBDA_NAMES.MarkingStarter, { success: true, tasksCreated: 3 });

      // Override invokeLambda to send a valid message for L3
      const originalInvoke = mockInfra.invokeLambda.bind(mockInfra);
      mockInfra.invokeLambda = async (name, payload) => {
        const result = await originalInvoke(name, payload);
        await mockInfra.sendMessage(QUEUE_NAMES.ltsWorker, {
          taskId: 'task-1',
          taskType: 'BACKUP',
        });
        return result;
      };

      const validator = new Phase2MultiLayerValidator({
        phaseId: PHASE_IDS.markingStarter,
        config: PHASE2_CONFIG,
        infrastructure: mockInfra,
      });

      const result = await validator.validate();

      // All 5 layers should be in results
      expect(result.layers).toHaveLength(5);
      expect(result.layers.map(l => l.layer)).toEqual([
        'existence',
        'functional',
        'integration',
        'quality',
        'understanding',
      ]);
    });

    it('should pass when all layers pass', async () => {
      mockInfra
        .setLambdaExists(LAMBDA_NAMES.MarkingStarter, true)
        .setLambdaEnv(LAMBDA_NAMES.MarkingStarter, {
          DB_HOST: 'localhost',
          DB_NAME: 'test',
          LTS_WORKER_QUEUE_URL: 'http://queue',
        })
        .setQueueUrl(QUEUE_NAMES.ltsWorker, 'http://queue')
        .setLambdaSuccess(LAMBDA_NAMES.MarkingStarter, { success: true, tasksCreated: 3 });

      // Override invokeLambda to send a valid message for L3
      const originalInvoke = mockInfra.invokeLambda.bind(mockInfra);
      mockInfra.invokeLambda = async (name, payload) => {
        const result = await originalInvoke(name, payload);
        await mockInfra.sendMessage(QUEUE_NAMES.ltsWorker, {
          taskId: 'task-1',
          taskType: 'BACKUP',
        });
        return result;
      };

      const validator = new Phase2MultiLayerValidator({
        phaseId: PHASE_IDS.markingStarter,
        config: PHASE2_CONFIG,
        infrastructure: mockInfra,
      });

      const result = await validator.validate();

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });
  });

  // ===========================================================================
  // Factory Function
  // ===========================================================================

  describe('createPhase2Validator', () => {
    it('should create validator with default config', () => {
      const validator = createPhase2Validator(mockInfra);

      expect(validator).toBeInstanceOf(Phase2MultiLayerValidator);
    });
  });
});
