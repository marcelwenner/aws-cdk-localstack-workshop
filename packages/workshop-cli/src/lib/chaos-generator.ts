/**
 * Chaos Generator - Poison Pill Variety Pack
 *
 * Generates different types of malformed messages to test
 * error handling and DLQ behavior. Each poison pill type
 * triggers a different kind of error for maximum learning effect.
 */

export interface PoisonPill {
  type: string;
  payload: Record<string, unknown>;
  expectedError: string;
  description: string;
}

/**
 * Different poison pill types that will crash the worker in various ways.
 * These are designed to be User-Code-independent - they fail due to
 * invalid data, not because of a forceError check.
 */
export const POISON_PILLS: PoisonPill[] = [
  {
    type: 'db_error',
    payload: { tableName: '__CHAOS_NONEXISTENT_TABLE__' },
    expectedError: 'Table not found',
    description: 'Tabelle existiert nicht in DB',
  },
  {
    type: 'validation_empty',
    payload: {},
    expectedError: 'Missing required field',
    description: 'Leerer Body - Pflichtfelder fehlen',
  },
  {
    type: 'type_error_number',
    payload: { tableName: 12345 },
    expectedError: 'Expected string, got number',
    description: 'Falscher Typ: Number statt String',
  },
  {
    type: 'null_value',
    payload: { tableName: null },
    expectedError: 'Cannot be null',
    description: 'Null-Wert wo String erwartet',
  },
  {
    type: 'sql_injection',
    payload: { tableName: "'; DROP TABLE users; --" },
    expectedError: 'Should NOT crash - prepared statements!',
    description: 'SQL Injection Versuch (sollte sicher sein!)',
  },
  {
    type: 'oversized',
    payload: { tableName: 'A'.repeat(10000) },
    expectedError: 'Value too long',
    description: 'Extrem langer Wert',
  },
  {
    type: 'special_chars',
    payload: { tableName: '\x00\x01\x02\x03' },
    expectedError: 'Invalid characters',
    description: 'Ungültige Steuerzeichen',
  },
  {
    type: 'nested_object',
    payload: { tableName: { nested: { deeply: 'invalid' } } },
    expectedError: 'Expected string, got object',
    description: 'Verschachteltes Objekt statt String',
  },
];

export interface ChaosMessage {
  payload: Record<string, unknown>;
  isPoisoned: boolean;
  chaosType?: string;
}

/**
 * Generate a mix of valid and poisoned messages for chaos testing.
 *
 * @param total - Total number of messages to generate
 * @param poisonCount - Number of poison pills to include
 * @returns Array of messages, shuffled randomly
 */
export function generateChaosMessages(
  total: number,
  poisonCount: number
): ChaosMessage[] {
  const messages: ChaosMessage[] = [];

  // Select random poison pills (don't repeat unless we need more than available)
  const shuffledPills = [...POISON_PILLS].sort(() => Math.random() - 0.5);
  const selectedPills: PoisonPill[] = [];

  while (selectedPills.length < poisonCount) {
    const remaining = poisonCount - selectedPills.length;
    const toAdd = shuffledPills.slice(0, Math.min(remaining, shuffledPills.length));
    selectedPills.push(...toAdd);
  }

  // Add poison pills
  for (const pill of selectedPills) {
    messages.push({
      payload: { ...pill.payload, _chaosType: pill.type },
      isPoisoned: true,
      chaosType: pill.type,
    });
  }

  // Add valid messages
  for (let i = 0; i < total - poisonCount; i++) {
    messages.push({
      payload: { tableName: `chaos_valid_${i}` },
      isPoisoned: false,
    });
  }

  // Shuffle for realistic distribution
  return messages.sort(() => Math.random() - 0.5);
}

/**
 * Get a summary of what poison pills are being used.
 */
export function getChaosDescription(poisonCount: number): string {
  const types = POISON_PILLS.slice(0, Math.min(poisonCount, POISON_PILLS.length));
  return types.map(p => `  - ${p.type}: ${p.description}`).join('\n');
}

/**
 * Sleep utility for sequential message sending.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
