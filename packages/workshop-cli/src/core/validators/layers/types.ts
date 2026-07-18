/**
 * Validation Layer Types
 *
 * Strict types for the 5-layer validation system:
 * L1: Existence (BLOCKER) - Is infrastructure deployed?
 * L2: Functional (BLOCKER) - Does code run without errors?
 * L3: Integration (SCORE) - Do side-effects work correctly?
 * L4: Quality (SCORE) - Is the test well-written?
 * L5: Understanding (SCORE) - Did user pass quiz/challenge?
 */

import type { LambdaName, QueueName, PhaseId } from '../../../shared/constants.js';

// =============================================================================
// Layer System
// =============================================================================

/** The 5 validation layers */
export type LayerId =
  | 'existence'
  | 'functional'
  | 'integration'
  | 'quality'
  | 'understanding';

/** Result from a single layer check */
export interface LayerResult {
  layer: LayerId;
  passed: boolean;
  score: number; // 0-100
  feedback: string[];
}

/** Final validation result aggregating all layers */
export interface ValidationResult {
  passed: boolean;
  score: number; // 0-100 weighted
  layers: LayerResult[];
  feedback: string[]; // Aggregated summary (2-3 sentences)
}

// =============================================================================
// Layer Weights
// =============================================================================

/** Layer weights (sum = 1.0) */
export const LAYER_WEIGHTS: Record<LayerId, number> = {
  existence: 0.15,
  functional: 0.25,
  integration: 0.20,
  quality: 0.20,
  understanding: 0.20,
};

// =============================================================================
// Configuration Types
// =============================================================================

/** L1: Existence Config - What infrastructure must exist? */
export interface ExistenceConfig {
  lambda?: LambdaName;
  queue?: QueueName;
  eventSource?: QueueName; // For SQS-triggered Lambdas
  envVars?: string[]; // Required environment variables
}

/** L2: Functional Config - How to test the Lambda? */
export interface FunctionalConfig {
  payload: unknown;
  schema?: Record<string, SchemaType>;
  expectedStatusCode?: number;
}

/** Simple schema types for validation */
export type SchemaType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'any';

// ---------------------------------------------------------------------------
// L3: Integration Config
// ---------------------------------------------------------------------------

/** DB expectation strategies (no functions in config!) */
export type DbExpectation =
  | 'noChange'
  | 'rowsIncreased'
  | 'rowsDecreased'
  | 'statusUpdated';

/** Message validator strategies */
export type MessageValidatorName =
  | 'any'
  | 'workerMessage'
  | 'completionMessage';

/** Database integration check */
export interface DbIntegrationConfig {
  query: string;
  params?: unknown[];
  expectationName: DbExpectation;
}

/** SQS integration check */
export interface SqsIntegrationConfig {
  queue: QueueName;
  minMessages?: number;
  validatorName?: MessageValidatorName;
}

/** L3: Integration Config */
export interface IntegrationConfig {
  db?: DbIntegrationConfig;
  sqs?: SqsIntegrationConfig;
  // Phase-specific configs (backoff, routing) are handled
  // directly in the phase validator, not here
}

/** L4: Quality Config - Which test file to analyze? */
export interface QualityConfig {
  testFile: string;
  packagePath: string; // e.g., './packages/marking-starter-lambda'
}

/** L5: Understanding Config - Quiz/Challenge requirements */
export interface UnderstandingConfig {
  quizId?: string;
  challengeId?: string;
  minScore?: number; // Default: 70
}

// =============================================================================
// Validation Config
// =============================================================================

/** Complete validation configuration for a phase */
export interface ValidationConfig {
  phaseId: PhaseId;
  existence: ExistenceConfig;
  functional: FunctionalConfig;
  integration?: IntegrationConfig;
  quality?: QualityConfig;
  understanding?: UnderstandingConfig;
}

// =============================================================================
// Strategy Implementations
// =============================================================================

/** DB expectation implementations */
export const DB_EXPECTATIONS: Record<
  DbExpectation,
  (before: unknown[], after: unknown[]) => boolean
> = {
  noChange: (before, after) => before.length === after.length,
  rowsIncreased: (before, after) => after.length > before.length,
  rowsDecreased: (before, after) => after.length < before.length,
  statusUpdated: (before, after) => {
    // At least one row should have different status
    if (before.length !== after.length) return false;
    return before.some((b, i) => {
      const a = after[i];
      return (
        typeof b === 'object' &&
        typeof a === 'object' &&
        b !== null &&
        a !== null &&
        'status' in b &&
        'status' in a &&
        b.status !== a.status
      );
    });
  },
};

/** Message validator implementations */
export const MESSAGE_VALIDATORS: Record<
  MessageValidatorName,
  (msg: unknown) => boolean
> = {
  any: () => true,
  workerMessage: (msg) => {
    if (typeof msg !== 'object' || msg === null) return false;
    return 'taskId' in msg && 'taskType' in msg;
  },
  completionMessage: (msg) => {
    if (typeof msg !== 'object' || msg === null) return false;
    return 'jobId' in msg && 'status' in msg;
  },
};
