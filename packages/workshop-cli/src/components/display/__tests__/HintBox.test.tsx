import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { HintBox } from '../HintBox.js';

/**
 * HintBox Tests
 *
 * Focus: Does the hint system display helpful information to users?
 * Testing: Hint content visibility, level indicator, list numbering
 * NOT testing: specific emojis, styling (implementation details)
 */
describe('HintBox', () => {
  describe('hint level indicator', () => {
    it('shows hint level 1 by default', () => {
      const { lastFrame } = render(<HintBox hints={['Check the logs']} />);

      expect(lastFrame()).toContain('Hint 1');
    });

    it('shows custom hint level when provided', () => {
      const { lastFrame } = render(<HintBox hints={['Advanced hint']} level={3} />);

      expect(lastFrame()).toContain('Hint 3');
    });

    it('updates level when prop changes', () => {
      const { lastFrame, rerender } = render(<HintBox hints={['Hint']} level={1} />);

      expect(lastFrame()).toContain('Hint 1');

      rerender(<HintBox hints={['Hint']} level={2} />);

      expect(lastFrame()).toContain('Hint 2');
    });
  });

  describe('hints list display', () => {
    it('displays hint content to the user', () => {
      const { lastFrame } = render(<HintBox hints={['Check the Lambda logs']} />);

      expect(lastFrame()).toContain('Check the Lambda logs');
    });

    it('displays all hints when multiple provided', () => {
      const hints = [
        'Check the Lambda function exists',
        'Verify SQS queue is connected',
        'Look at CloudWatch logs',
      ];

      const { lastFrame } = render(<HintBox hints={hints} />);

      const frame = lastFrame();
      hints.forEach((hint) => {
        expect(frame).toContain(hint);
      });
    });

    it('handles empty hints array without crashing', () => {
      // Edge case: should render header but no items
      const { lastFrame } = render(<HintBox hints={[]} />);

      expect(lastFrame()).toContain('Hint');
    });
  });
});
