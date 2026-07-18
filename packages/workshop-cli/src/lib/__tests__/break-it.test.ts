/**
 * Break-it Nonce Tests
 *
 * Die Session-Nonce ersetzt das statische Secret. Kritische Eigenschaften:
 * - exakt die Maske des Trainer-Master-Codes (gemeinsame Eingabebox!)
 * - keine verwechselbaren Zeichen (wird am Beamer abgetippt)
 * - pro Aufruf zufällig
 * - armBreakItNonce macht sie für alle Kind-Prozesse (Deploys) sichtbar
 */
import { describe, it, expect } from 'vitest';
import { generateBreakItNonce, armBreakItNonce, NONCE_ALPHABET } from '../break-it.js';

const MASTER = Buffer.from('U0VSVkVSTEVTUy1OSU5KQS0yMDI2', 'base64').toString();

describe('generateBreakItNonce', () => {
  it('matches the exact mask of the trainer master code', () => {
    const nonce = generateBreakItNonce();
    expect(nonce.length).toBe(MASTER.length);
    // Dash-Positionen identisch - sonst passt der Master nicht in die Eingabebox
    for (let i = 0; i < MASTER.length; i++) {
      expect(nonce[i] === '-').toBe(MASTER[i] === '-');
    }
  });

  it('has the expected format', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateBreakItNonce()).toMatch(/^SERVERLESS-[A-Z2-9]{5}-[A-Z2-9]{4}$/);
    }
  });

  it('only uses unambiguous characters (no I, L, O, 0, 1)', () => {
    expect(NONCE_ALPHABET).not.toMatch(/[ILO01]/);
    for (let i = 0; i < 50; i++) {
      const randomPart = generateBreakItNonce().replace('SERVERLESS-', '').replace('-', '');
      for (const char of randomPart) {
        expect(NONCE_ALPHABET).toContain(char);
      }
    }
  });

  it('is random per call', () => {
    const nonces = new Set(Array.from({ length: 1000 }, generateBreakItNonce));
    // 9 Zufallszeichen aus 31er-Alphabet - Kollisionen in 1000 Zügen wären ein Bug
    expect(nonces.size).toBe(1000);
  });

  it('never equals the master code', () => {
    // '0', '1' und 'I' fehlen im Alphabet - NINJA-2026 ist nicht erzeugbar
    for (let i = 0; i < 100; i++) {
      expect(generateBreakItNonce()).not.toBe(MASTER);
    }
  });
});

describe('armBreakItNonce', () => {
  it('exposes the nonce to child processes via process.env', () => {
    const before = process.env.WORKSHOP_RELEASE_ID;
    try {
      armBreakItNonce('SERVERLESS-TEST2-CODE');
      expect(process.env.WORKSHOP_RELEASE_ID).toBe('SERVERLESS-TEST2-CODE');
    } finally {
      if (before === undefined) delete process.env.WORKSHOP_RELEASE_ID;
      else process.env.WORKSHOP_RELEASE_ID = before;
    }
  });
});
