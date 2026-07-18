import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { TimeTracker } from '../TimeTracker.js';

describe('TimeTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('without startTime', () => {
    it('should render default time "0m 0s"', () => {
      const { lastFrame } = render(<TimeTracker />);
      expect(lastFrame()).toContain('0m 0s');
    });
  });

  describe('with startTime', () => {
    it('should calculate elapsed time correctly', async () => {
      // Set current time
      const now = new Date('2024-01-01T12:01:30.000Z');
      vi.setSystemTime(now);

      // Start time was 1 minute 30 seconds ago
      const startTime = new Date('2024-01-01T12:00:00.000Z').toISOString();

      const { lastFrame } = render(<TimeTracker startTime={startTime} />);

      // Advance timer to trigger the first setInterval callback
      await vi.advanceTimersByTimeAsync(100);

      expect(lastFrame()).toContain('1m 30s');
    });

    it('should update time every second', () => {
      const now = new Date('2024-01-01T12:00:00.000Z');
      vi.setSystemTime(now);

      const startTime = now.toISOString();

      const { lastFrame } = render(<TimeTracker startTime={startTime} />);

      // Initial render
      expect(lastFrame()).toContain('0m 0s');

      // Advance 5 seconds
      vi.advanceTimersByTime(5000);
      vi.setSystemTime(new Date('2024-01-01T12:00:05.000Z'));

      // Force re-render by advancing timers
      vi.advanceTimersByTime(1000);
      vi.setSystemTime(new Date('2024-01-01T12:00:06.000Z'));

      expect(lastFrame()).toContain('0m');
    });
  });

  describe('compact mode', () => {
    it('should render compact version without Zeit header', () => {
      const { lastFrame } = render(<TimeTracker compact />);

      const frame = lastFrame();
      expect(frame).toContain('0m 0s');
      expect(frame).not.toContain('Zeit');
    });

    it('should render full version with Zeit header by default', () => {
      const { lastFrame } = render(<TimeTracker />);

      const frame = lastFrame();
      expect(frame).toContain('Zeit');
    });
  });
});
