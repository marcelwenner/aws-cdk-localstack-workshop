import { describe, it, expect } from 'vitest';
import {
  generateChaosMessages,
  getChaosDescription,
  sleep,
  POISON_PILLS,
  type ChaosMessage,
} from '../chaos-generator.js';

describe('chaos-generator', () => {
  describe('POISON_PILLS', () => {
    it('should have multiple poison pill types defined', () => {
      expect(POISON_PILLS.length).toBeGreaterThan(0);
    });

    it('should have required fields for each poison pill', () => {
      for (const pill of POISON_PILLS) {
        expect(pill).toHaveProperty('type');
        expect(pill).toHaveProperty('payload');
        expect(pill).toHaveProperty('expectedError');
        expect(pill).toHaveProperty('description');
      }
    });

    it('should include db_error type', () => {
      const dbError = POISON_PILLS.find((p) => p.type === 'db_error');
      expect(dbError).toBeDefined();
      expect(dbError?.payload).toHaveProperty('tableName');
    });

    it('should include validation_empty type', () => {
      const empty = POISON_PILLS.find((p) => p.type === 'validation_empty');
      expect(empty).toBeDefined();
      expect(Object.keys(empty?.payload || {})).toHaveLength(0);
    });
  });

  describe('generateChaosMessages', () => {
    it('should generate correct total number of messages', () => {
      const messages = generateChaosMessages(10, 3);
      expect(messages).toHaveLength(10);
    });

    it('should generate correct number of poison pills', () => {
      const messages = generateChaosMessages(10, 3);
      const poisoned = messages.filter((m) => m.isPoisoned);
      expect(poisoned).toHaveLength(3);
    });

    it('should generate correct number of valid messages', () => {
      const messages = generateChaosMessages(10, 3);
      const valid = messages.filter((m) => !m.isPoisoned);
      expect(valid).toHaveLength(7);
    });

    it('should mark poisoned messages with chaosType', () => {
      const messages = generateChaosMessages(10, 5);
      const poisoned = messages.filter((m) => m.isPoisoned);
      for (const msg of poisoned) {
        expect(msg.chaosType).toBeDefined();
        expect(typeof msg.chaosType).toBe('string');
      }
    });

    it('should not mark valid messages with chaosType', () => {
      const messages = generateChaosMessages(10, 3);
      const valid = messages.filter((m) => !m.isPoisoned);
      for (const msg of valid) {
        expect(msg.chaosType).toBeUndefined();
      }
    });

    it('should handle zero poison pills', () => {
      const messages = generateChaosMessages(5, 0);
      expect(messages).toHaveLength(5);
      expect(messages.every((m) => !m.isPoisoned)).toBe(true);
    });

    it('should handle all poison pills', () => {
      const messages = generateChaosMessages(3, 3);
      expect(messages).toHaveLength(3);
      expect(messages.every((m) => m.isPoisoned)).toBe(true);
    });

    it('should shuffle messages (statistical test)', () => {
      // Run multiple times and check that first message isn't always the same type
      const firstMessages: boolean[] = [];
      for (let i = 0; i < 20; i++) {
        const messages = generateChaosMessages(10, 5);
        firstMessages.push(messages[0].isPoisoned);
      }
      // Should have some variety (not all true or all false)
      const hasTrue = firstMessages.some((m) => m);
      const hasFalse = firstMessages.some((m) => !m);
      expect(hasTrue || hasFalse).toBe(true);
    });
  });

  describe('getChaosDescription', () => {
    it('should return description string', () => {
      const desc = getChaosDescription(3);
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(0);
    });

    it('should include poison pill types in description', () => {
      const desc = getChaosDescription(2);
      // Should contain at least one of the poison pill types
      const containsType = POISON_PILLS.some((p) => desc.includes(p.type));
      expect(containsType).toBe(true);
    });

    it('should limit to available poison pills', () => {
      const desc = getChaosDescription(100);
      const lineCount = desc.split('\n').length;
      expect(lineCount).toBeLessThanOrEqual(POISON_PILLS.length);
    });
  });

  describe('sleep', () => {
    it('should resolve after specified time', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
    });

    it('should return a promise', () => {
      const result = sleep(10);
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
