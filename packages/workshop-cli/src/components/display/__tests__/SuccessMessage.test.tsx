import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { SuccessMessage } from '../SuccessMessage.js';

/**
 * SuccessMessage Tests
 *
 * Focus: Does the component display success feedback correctly to users?
 * Testing: Message visibility, details list behavior
 * NOT testing: specific emojis, checkmark characters (implementation details)
 */
describe('SuccessMessage', () => {
  describe('message display', () => {
    it('displays the success message to the user', () => {
      const { lastFrame } = render(<SuccessMessage message="Phase completed!" />);

      expect(lastFrame()).toContain('Phase completed!');
    });

    it('updates when message prop changes', () => {
      const { lastFrame, rerender } = render(<SuccessMessage message="First" />);

      expect(lastFrame()).toContain('First');

      rerender(<SuccessMessage message="Updated" />);

      expect(lastFrame()).toContain('Updated');
    });
  });

  describe('details list behavior', () => {
    it('displays all detail items when provided', () => {
      const details = ['Lambda deployed', 'SQS connected', 'Tests passing'];

      const { lastFrame } = render(
        <SuccessMessage message="Success" details={details} />
      );

      const frame = lastFrame();
      // Each detail should be visible to the user
      expect(frame).toContain('Lambda deployed');
      expect(frame).toContain('SQS connected');
      expect(frame).toContain('Tests passing');
    });

    it('renders correctly without details prop', () => {
      const { lastFrame } = render(<SuccessMessage message="Done" />);

      // Should show message without crashing
      expect(lastFrame()).toContain('Done');
    });

    it('handles empty details array gracefully', () => {
      // Edge case: explicit empty array should not crash or show artifacts
      const { lastFrame } = render(<SuccessMessage message="Done" details={[]} />);

      expect(lastFrame()).toContain('Done');
    });

    it('updates details when props change', () => {
      const { lastFrame, rerender } = render(
        <SuccessMessage message="Progress" details={['Step 1']} />
      );

      expect(lastFrame()).toContain('Step 1');

      rerender(<SuccessMessage message="Progress" details={['Step 1', 'Step 2']} />);

      expect(lastFrame()).toContain('Step 1');
      expect(lastFrame()).toContain('Step 2');
    });
  });
});
