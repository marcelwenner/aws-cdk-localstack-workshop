import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Phase3Validator from '../phase3.validator.js';
import { MockInfrastructure } from '../../infrastructure/mock-infrastructure.js';
import { workshopConfig } from '../../config/workshop.config.js';

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

/**
 * Example Test: Phase 3 Validator with Dependency Injection
 *
 * This demonstrates how to test validators without real AWS calls
 * using the MockInfrastructure implementation.
 */
describe('Phase3Validator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass when Lambda is implemented', async () => {
    // Arrange: Create mock infrastructure
    const mockInfra = new MockInfrastructure();

    // Configure mock Lambda response (success)
    mockInfra.setLambdaResponse(workshopConfig.lambdas.LtsExecutor, {
      success: true,
      result: { status: 'completed' },
    });

    // Configure mock queue URLs
    mockInfra.setQueueUrl(workshopConfig.queues.ltsWorker, 'https://mock-queue-url/lts-worker');
    mockInfra.setQueueUrl(workshopConfig.queues.completion, 'https://mock-queue-url/completion');

    // Act: Create validator with mock infrastructure
    const validator = new Phase3Validator(mockInfra);
    const result = await validator.validate();

    // Assert
    expect(result.passed).toBe(true);
  });

  it('should fail when Lambda is not implemented', async () => {
    // Arrange
    const mockInfra = new MockInfrastructure();

    // Configure mock Lambda response (NOT_IMPLEMENTED error)
    mockInfra.setLambdaResponse(workshopConfig.lambdas.LtsExecutor, {
      success: false,
      error: 'Error: NOT_IMPLEMENTED',
    });

    // Act
    const validator = new Phase3Validator(mockInfra);
    const result = await validator.validate();

    // Assert
    expect(result.passed).toBe(false);
    expect(result.hints).toContain('Lambda Handler noch nicht implementiert');
  });

  it('should fail when queues are not deployed', async () => {
    // Arrange
    const mockInfra = new MockInfrastructure();

    // Configure mock Lambda response (success)
    mockInfra.setLambdaResponse(workshopConfig.lambdas.LtsExecutor, {
      success: true,
      result: {},
    });

    // Do NOT configure queue URLs (simulate queues not existing)

    // Act
    const validator = new Phase3Validator(mockInfra);
    const result = await validator.validate();

    // Assert
    expect(result.passed).toBe(false);
    expect(result.hints).toContain('Queues nicht gefunden');
  });
});
