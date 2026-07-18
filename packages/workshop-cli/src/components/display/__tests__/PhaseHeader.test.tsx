import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { PhaseHeader } from '../PhaseHeader.js';

/**
 * PhaseHeader Tests
 *
 * Focus: Does the component display user-facing content correctly?
 * NOT testing: specific characters, styling, emojis (implementation details)
 */
describe('PhaseHeader', () => {
  it('displays the provided title to the user', () => {
    const { lastFrame } = render(<PhaseHeader phase={1} title="Lambda Basics" />);

    expect(lastFrame()).toContain('Lambda Basics');
  });

  it('updates when title prop changes', () => {
    const { lastFrame, rerender } = render(<PhaseHeader phase={1} title="First" />);

    expect(lastFrame()).toContain('First');

    rerender(<PhaseHeader phase={2} title="Second" />);

    expect(lastFrame()).toContain('Second');
    expect(lastFrame()).not.toContain('First');
  });

  it('handles edge case: empty title', () => {
    // Should not crash with empty title
    const { lastFrame } = render(<PhaseHeader phase={0} title="" />);

    expect(lastFrame()).toBeDefined();
  });

  it('handles edge case: special characters in title', () => {
    const title = 'SQS → Lambda → DLQ';
    const { lastFrame } = render(<PhaseHeader phase={3} title={title} />);

    expect(lastFrame()).toContain('SQS');
    expect(lastFrame()).toContain('Lambda');
    expect(lastFrame()).toContain('DLQ');
  });
});
