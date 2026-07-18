import { describe, it, expect } from 'vitest';
import {
  getProgressBar,
  getStatusColor,
  getInFlightBar,
  formatDuration,
  ARROW_FRAMES,
  SPINNER_FRAMES,
} from '../visuals.js';

describe('visuals', () => {
  describe('getProgressBar', () => {
    it('should return empty bar when max is 0', () => {
      const bar = getProgressBar(0, 0);
      expect(bar).toBe('░'.repeat(20));
    });

    it('should return full bar when current equals max', () => {
      const bar = getProgressBar(100, 100);
      expect(bar).toBe('█'.repeat(20));
    });

    it('should return half-filled bar at 50%', () => {
      const bar = getProgressBar(50, 100);
      expect(bar).toBe('█'.repeat(10) + '░'.repeat(10));
    });

    it('should respect custom width', () => {
      const bar = getProgressBar(50, 100, 10);
      expect(bar).toHaveLength(10);
      expect(bar).toBe('█'.repeat(5) + '░'.repeat(5));
    });

    it('should cap at 100% when current exceeds max', () => {
      const bar = getProgressBar(150, 100);
      expect(bar).toBe('█'.repeat(20));
    });

    it('should handle compact width (8)', () => {
      const bar = getProgressBar(50, 100, 8);
      expect(bar).toHaveLength(8);
    });
  });

  describe('getStatusColor', () => {
    it('should return gray when max is 0', () => {
      expect(getStatusColor(0, 0)).toBe('gray');
    });

    it('should return green for 0-49%', () => {
      expect(getStatusColor(0, 100)).toBe('green');
      expect(getStatusColor(49, 100)).toBe('green');
    });

    it('should return yellow for 50-79%', () => {
      expect(getStatusColor(50, 100)).toBe('yellow');
      expect(getStatusColor(79, 100)).toBe('yellow');
    });

    it('should return red for 80%+', () => {
      expect(getStatusColor(80, 100)).toBe('red');
      expect(getStatusColor(100, 100)).toBe('red');
    });
  });

  describe('getInFlightBar', () => {
    it('should return empty bar when max is 0', () => {
      const bar = getInFlightBar(0, 0, 0);
      expect(bar).toBe('░'.repeat(20));
    });

    it('should show waiting and in-flight sections', () => {
      const bar = getInFlightBar(5, 5, 20, 20);
      // 5/20 = 25% waiting (5 chars), 5/20 = 25% in-flight (5 chars)
      expect(bar).toContain('█');
      expect(bar).toContain('▓');
      expect(bar).toContain('░');
    });

    it('should handle only waiting (no in-flight)', () => {
      const bar = getInFlightBar(10, 0, 20, 20);
      expect(bar).toContain('█');
      expect(bar).not.toContain('▓');
    });

    it('should handle only in-flight (no waiting)', () => {
      const bar = getInFlightBar(0, 10, 20, 20);
      expect(bar).not.toContain('█');
      expect(bar).toContain('▓');
    });

    it('should respect custom width', () => {
      const bar = getInFlightBar(5, 5, 20, 8);
      expect(bar).toHaveLength(8);
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds under 1000', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds for 1000ms and above', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(10000)).toBe('10.0s');
    });

    it('should round to one decimal place', () => {
      expect(formatDuration(1234)).toBe('1.2s');
      expect(formatDuration(1267)).toBe('1.3s');
    });
  });
});
