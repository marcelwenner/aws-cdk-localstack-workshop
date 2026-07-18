/**
 * Validation Scorer
 *
 * Computes weighted scores from layer results.
 *
 * Scoring behavior:
 * - All 5 layers always produce a result (defaults to score 100)
 * - Weights are normalized to configured layers
 * - passed = !blockersFailed && score >= 70
 */

import type { LayerId, LayerResult, ValidationResult } from './types.js';
import { LAYER_WEIGHTS } from './types.js';

// =============================================================================
// Score Computation
// =============================================================================

/**
 * Compute weighted score from layer results.
 *
 * @param results - Array of layer results
 * @param weights - Weight for each layer (should sum to 1.0)
 * @returns Weighted score 0-100
 */
export function computeScore(
  results: LayerResult[],
  weights: Record<LayerId, number> = LAYER_WEIGHTS,
): number {
  if (results.length === 0) return 0;

  // Get weights for present layers
  const presentLayers = results.map((r) => r.layer);
  const weightSum = presentLayers
    .map((layer) => weights[layer])
    .reduce((acc, w) => acc + w, 0);

  if (weightSum === 0) return 0;

  // Compute normalized weighted sum
  let score = 0;
  for (const result of results) {
    const normalizedWeight = weights[result.layer] / weightSum;
    score += result.score * normalizedWeight;
  }

  return Math.round(score);
}

// =============================================================================
// Result Builder
// =============================================================================

/** Blocker layers that must pass */
const BLOCKER_LAYERS: LayerId[] = ['existence', 'functional'];

/**
 * Build final validation result from layer results.
 *
 * @param layers - All layer results
 * @param minScore - Minimum score to pass (default: 70)
 * @returns Final validation result
 */
export function buildValidationResult(
  layers: LayerResult[],
  minScore: number = 70,
): ValidationResult {
  const score = computeScore(layers);

  // Check if any blocker layer failed
  const blockersFailed = layers
    .filter((l) => BLOCKER_LAYERS.includes(l.layer))
    .some((l) => !l.passed);

  return {
    passed: !blockersFailed && score >= minScore,
    score,
    layers,
    feedback: aggregateFeedback(layers),
  };
}

// =============================================================================
// Feedback Aggregation
// =============================================================================

/**
 * Create a concise summary from layer feedback.
 *
 * @param layers - All layer results
 * @returns 2-3 sentence summary
 */
export function aggregateFeedback(layers: LayerResult[]): string[] {
  const failed = layers.filter((l) => !l.passed);

  if (failed.length === 0) {
    return ['Alle Checks bestanden!'];
  }

  const summary: string[] = [];

  // Count failed layers
  if (failed.length === 1) {
    summary.push(`1 Layer nicht bestanden: ${failed[0].layer}`);
  } else {
    summary.push(`${failed.length} Layer nicht bestanden.`);
  }

  // Add first 2 feedback items from each failed layer
  for (const layer of failed) {
    const layerFeedback = layer.feedback.slice(0, 2);
    summary.push(...layerFeedback);
  }

  // Limit total feedback to 5 items
  return summary.slice(0, 5);
}

// =============================================================================
// Layer Result Helpers
// =============================================================================

/**
 * Create a passing layer result.
 */
export function passedLayer(layer: LayerId, feedback: string[] = []): LayerResult {
  return {
    layer,
    passed: true,
    score: 100,
    feedback,
  };
}

/**
 * Create a failing layer result.
 */
export function failedLayer(
  layer: LayerId,
  feedback: string[],
  partialScore: number = 0,
): LayerResult {
  return {
    layer,
    passed: false,
    score: partialScore,
    feedback,
  };
}

/**
 * Create a partial layer result (passed but with reduced score).
 */
export function partialLayer(
  layer: LayerId,
  score: number,
  feedback: string[],
): LayerResult {
  return {
    layer,
    passed: true,
    score: Math.max(0, Math.min(100, score)),
    feedback,
  };
}
