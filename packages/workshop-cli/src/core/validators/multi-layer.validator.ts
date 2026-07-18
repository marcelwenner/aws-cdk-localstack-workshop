/**
 * Multi-Layer Validator
 *
 * Abstract base class for the 5-layer validation system.
 *
 * Orchestration flow:
 * 1. L1 Existence (BLOCKER) - early return if fails
 * 2. L2 Functional (BLOCKER) - early return if fails
 * 3. L3-L5 (SCORE) - run in parallel, contribute to score
 *
 * Subclasses:
 * - MUST implement: checkExistence(), checkFunctional()
 * - MAY override: checkIntegration(), checkQuality(), checkUnderstanding()
 */

import type { PhaseId } from '../../shared/constants.js';
import type { InfrastructurePort } from '../infrastructure/infrastructure.port.js';
import type {
  LayerResult,
  ValidationResult,
  ValidationConfig,
} from './layers/types.js';
import { buildValidationResult, passedLayer } from './layers/scorer.js';

// =============================================================================
// Validation Context
// =============================================================================

/** Context passed to all validation methods */
export interface ValidationContext {
  phaseId: PhaseId;
  config: ValidationConfig;
  infrastructure: InfrastructurePort;
}

// =============================================================================
// Multi-Layer Validator Base Class
// =============================================================================

export abstract class MultiLayerValidator {
  protected readonly ctx: ValidationContext;

  constructor(ctx: ValidationContext) {
    this.ctx = ctx;
  }

  // ---------------------------------------------------------------------------
  // Main Validation Entry Point
  // ---------------------------------------------------------------------------

  /**
   * Run all validation layers and return aggregated result.
   *
   * Flow:
   * 1. Run L1 (Existence) - BLOCKER
   * 2. If L1 fails → return early
   * 3. Run L2 (Functional) - BLOCKER
   * 4. If L2 fails → return early
   * 5. Run L3-L5 in parallel (score-based)
   * 6. Aggregate results
   */
  async validate(): Promise<ValidationResult> {
    const results: LayerResult[] = [];

    // L1: Existence (BLOCKER)
    const existence = await this.checkExistence();
    results.push(existence);
    if (!existence.passed) {
      return buildValidationResult(results);
    }

    // L2: Functional (BLOCKER)
    const functional = await this.checkFunctional();
    results.push(functional);
    if (!functional.passed) {
      return buildValidationResult(results);
    }

    // L3-L5: Score-based (run in parallel)
    const [integration, quality, understanding] = await Promise.all([
      this.checkIntegration(),
      this.checkQuality(),
      this.checkUnderstanding(),
    ]);

    results.push(integration);
    results.push(quality);
    results.push(understanding);

    return buildValidationResult(results);
  }

  // ---------------------------------------------------------------------------
  // Abstract Methods (MUST be implemented by subclasses)
  // ---------------------------------------------------------------------------

  /**
   * L1: Check if required infrastructure exists.
   *
   * Should verify:
   * - Lambda is deployed
   * - Required queues exist
   * - Environment variables are set
   */
  protected abstract checkExistence(): Promise<LayerResult>;

  /**
   * L2: Check if Lambda functions correctly.
   *
   * Should verify:
   * - Lambda can be invoked
   * - No NOT_IMPLEMENTED errors
   * - Response matches expected schema
   */
  protected abstract checkFunctional(): Promise<LayerResult>;

  // ---------------------------------------------------------------------------
  // Optional Methods (defaults to 100 score, override if needed)
  // ---------------------------------------------------------------------------

  /**
   * L3: Check integration/side-effects.
   *
   * Override to verify:
   * - Database changes
   * - SQS messages sent
   * - Self-triggering patterns
   */
  protected async checkIntegration(): Promise<LayerResult> {
    return passedLayer('integration');
  }

  /**
   * L4: Check test quality.
   *
   * Override to verify:
   * - Test file exists and passes
   * - Uses mocks (not real adapters)
   * - Has meaningful assertions
   */
  protected async checkQuality(): Promise<LayerResult> {
    return passedLayer('quality');
  }

  /**
   * L5: Check understanding (quiz/challenge).
   *
   * Override to verify:
   * - Quiz completed with passing score
   * - Challenge completed
   */
  protected async checkUnderstanding(): Promise<LayerResult> {
    return passedLayer('understanding');
  }

  // ---------------------------------------------------------------------------
  // Helper Methods for Subclasses
  // ---------------------------------------------------------------------------

  /** Get the infrastructure port */
  protected get infra(): InfrastructurePort {
    return this.ctx.infrastructure;
  }

  /** Get the validation config */
  protected get config(): ValidationConfig {
    return this.ctx.config;
  }
}
