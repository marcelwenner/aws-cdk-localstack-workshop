import { describe, it, expect } from 'vitest';
import {
  computeScore,
  buildValidationResult,
  aggregateFeedback,
  passedLayer,
  failedLayer,
  partialLayer,
} from '../scorer.js';
import type { LayerResult } from '../types.js';
import { LAYER_WEIGHTS } from '../types.js';

describe('Scorer', () => {
  // ===========================================================================
  // computeScore Tests
  // ===========================================================================

  describe('computeScore', () => {
    it('should return 100 when all layers pass with 100 score', () => {
      const results: LayerResult[] = [
        passedLayer('existence'),
        passedLayer('functional'),
        passedLayer('integration'),
        passedLayer('quality'),
        passedLayer('understanding'),
      ];

      expect(computeScore(results)).toBe(100);
    });

    it('should return 0 when all layers fail with 0 score', () => {
      const results: LayerResult[] = [
        failedLayer('existence', ['error']),
        failedLayer('functional', ['error']),
        failedLayer('integration', ['error']),
        failedLayer('quality', ['error']),
        failedLayer('understanding', ['error']),
      ];

      expect(computeScore(results)).toBe(0);
    });

    it('should calculate weighted score correctly', () => {
      // L1: 100 (weight 0.15) = 15
      // L2: 100 (weight 0.25) = 25
      // L3: 0 (weight 0.20) = 0
      // L4: 50 (weight 0.20) = 10
      // L5: 100 (weight 0.20) = 20
      // Total = 70
      const results: LayerResult[] = [
        passedLayer('existence'),
        passedLayer('functional'),
        failedLayer('integration', ['error']),
        partialLayer('quality', 50, ['partial']),
        passedLayer('understanding'),
      ];

      expect(computeScore(results)).toBe(70);
    });

    it('should normalize weights for partial layer sets', () => {
      // Only L1 and L2: weights 0.15 + 0.25 = 0.40
      // Normalized: L1 = 0.375, L2 = 0.625
      // L1: 100 * 0.375 = 37.5
      // L2: 100 * 0.625 = 62.5
      // Total = 100
      const results: LayerResult[] = [
        passedLayer('existence'),
        passedLayer('functional'),
      ];

      expect(computeScore(results)).toBe(100);
    });

    it('should return 0 for empty results', () => {
      expect(computeScore([])).toBe(0);
    });

    it('should handle single layer', () => {
      const results: LayerResult[] = [passedLayer('existence')];
      expect(computeScore(results)).toBe(100);
    });

    it('should round to nearest integer', () => {
      // Create a scenario that would result in non-integer
      const results: LayerResult[] = [
        partialLayer('existence', 33, []),
        partialLayer('functional', 66, []),
      ];

      const score = computeScore(results);
      expect(Number.isInteger(score)).toBe(true);
    });
  });

  // ===========================================================================
  // buildValidationResult Tests
  // ===========================================================================

  describe('buildValidationResult', () => {
    it('should pass when all layers pass and score >= 70', () => {
      const layers: LayerResult[] = [
        passedLayer('existence'),
        passedLayer('functional'),
        passedLayer('integration'),
        passedLayer('quality'),
        passedLayer('understanding'),
      ];

      const result = buildValidationResult(layers);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.layers).toHaveLength(5);
    });

    it('should fail when existence layer fails (BLOCKER)', () => {
      const layers: LayerResult[] = [
        failedLayer('existence', ['Lambda nicht gefunden']),
        passedLayer('functional'),
        passedLayer('integration'),
        passedLayer('quality'),
        passedLayer('understanding'),
      ];

      const result = buildValidationResult(layers);

      expect(result.passed).toBe(false);
      // Score is still calculated
      expect(result.score).toBeLessThan(100);
    });

    it('should fail when functional layer fails (BLOCKER)', () => {
      const layers: LayerResult[] = [
        passedLayer('existence'),
        failedLayer('functional', ['NOT_IMPLEMENTED']),
        passedLayer('integration'),
        passedLayer('quality'),
        passedLayer('understanding'),
      ];

      const result = buildValidationResult(layers);

      expect(result.passed).toBe(false);
    });

    it('should pass when score-based layers fail but blockers pass', () => {
      // Integration, Quality, Understanding are score-based, not blockers
      const layers: LayerResult[] = [
        passedLayer('existence'),
        passedLayer('functional'),
        failedLayer('integration', ['error']),
        failedLayer('quality', ['error']),
        failedLayer('understanding', ['error']),
      ];

      const result = buildValidationResult(layers);

      // Blockers passed, but score is low
      // L1: 100 * 0.15 = 15
      // L2: 100 * 0.25 = 25
      // L3-L5: 0
      // Total = 40 < 70
      expect(result.passed).toBe(false);
      expect(result.score).toBe(40);
    });

    it('should pass when score is at threshold', () => {
      // Need score >= 70
      const layers: LayerResult[] = [
        passedLayer('existence'),       // 15
        passedLayer('functional'),      // 25
        passedLayer('integration'),     // 20
        partialLayer('quality', 50, []), // 10
        passedLayer('understanding'),   // 20
      ];
      // Total = 90

      const result = buildValidationResult(layers);
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('should respect custom minScore', () => {
      const layers: LayerResult[] = [
        passedLayer('existence'),
        passedLayer('functional'),
        failedLayer('integration', []),
        failedLayer('quality', []),
        failedLayer('understanding', []),
      ];
      // Score = 40

      // With minScore 30, should pass
      const result30 = buildValidationResult(layers, 30);
      expect(result30.passed).toBe(true);

      // With minScore 50, should fail
      const result50 = buildValidationResult(layers, 50);
      expect(result50.passed).toBe(false);
    });
  });

  // ===========================================================================
  // aggregateFeedback Tests
  // ===========================================================================

  describe('aggregateFeedback', () => {
    it('should return success message when all pass', () => {
      const layers: LayerResult[] = [
        passedLayer('existence'),
        passedLayer('functional'),
      ];

      const feedback = aggregateFeedback(layers);

      expect(feedback).toContain('Alle Checks bestanden!');
    });

    it('should report single failed layer', () => {
      const layers: LayerResult[] = [
        failedLayer('existence', ['Lambda nicht gefunden']),
        passedLayer('functional'),
      ];

      const feedback = aggregateFeedback(layers);

      expect(feedback[0]).toContain('1 Layer nicht bestanden');
      expect(feedback).toContain('Lambda nicht gefunden');
    });

    it('should report multiple failed layers', () => {
      const layers: LayerResult[] = [
        failedLayer('existence', ['error1']),
        failedLayer('functional', ['error2']),
      ];

      const feedback = aggregateFeedback(layers);

      expect(feedback[0]).toContain('2 Layer nicht bestanden');
    });

    it('should limit feedback items', () => {
      const layers: LayerResult[] = [
        failedLayer('existence', ['e1', 'e2', 'e3', 'e4']),
        failedLayer('functional', ['f1', 'f2', 'f3', 'f4']),
        failedLayer('integration', ['i1', 'i2', 'i3', 'i4']),
      ];

      const feedback = aggregateFeedback(layers);

      // Should be limited to 5 items
      expect(feedback.length).toBeLessThanOrEqual(5);
    });
  });

  // ===========================================================================
  // Helper Functions Tests
  // ===========================================================================

  describe('passedLayer', () => {
    it('should create a passing layer result', () => {
      const result = passedLayer('existence');

      expect(result.layer).toBe('existence');
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.feedback).toEqual([]);
    });

    it('should include optional feedback', () => {
      const result = passedLayer('functional', ['All good!']);

      expect(result.feedback).toContain('All good!');
    });
  });

  describe('failedLayer', () => {
    it('should create a failing layer result', () => {
      const result = failedLayer('existence', ['Lambda nicht gefunden']);

      expect(result.layer).toBe('existence');
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.feedback).toContain('Lambda nicht gefunden');
    });

    it('should support partial score', () => {
      const result = failedLayer('quality', ['Missing assertions'], 50);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(50);
    });
  });

  describe('partialLayer', () => {
    it('should create a partial layer result', () => {
      const result = partialLayer('quality', 75, ['Minor issues']);

      expect(result.layer).toBe('quality');
      expect(result.passed).toBe(true);
      expect(result.score).toBe(75);
      expect(result.feedback).toContain('Minor issues');
    });

    it('should clamp score to 0-100', () => {
      const high = partialLayer('quality', 150, []);
      expect(high.score).toBe(100);

      const low = partialLayer('quality', -50, []);
      expect(low.score).toBe(0);
    });
  });
});
