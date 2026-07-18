/**
 * Validation Layers - Public API
 */

// Types
export type {
  LayerId,
  LayerResult,
  ValidationResult,
  ExistenceConfig,
  FunctionalConfig,
  IntegrationConfig,
  QualityConfig,
  UnderstandingConfig,
  ValidationConfig,
  SchemaType,
  DbExpectation,
  MessageValidatorName,
  DbIntegrationConfig,
  SqsIntegrationConfig,
} from './types.js';

// Constants
export { LAYER_WEIGHTS, DB_EXPECTATIONS, MESSAGE_VALIDATORS } from './types.js';

// Scorer functions
export {
  computeScore,
  buildValidationResult,
  aggregateFeedback,
  passedLayer,
  failedLayer,
  partialLayer,
} from './scorer.js';
