/**
 * Break-it Challenge (Phase 1)
 *
 * Statt eines statischen Secrets im Repo (greppbar, dekodierbar) würfelt die
 * CLI pro Session eine Nonce. Sie wandert als WORKSHOP_RELEASE_ID in die
 * Prozess-Umgebung der CLI; jeder Auto-Deploy erbt sie und brennt sie als
 * RELEASE_ID in die Lambda-Env. Die Referenz-Lambda loggt sie im Fehlerfall
 * als releaseId - der einzige Weg zum Code führt durch die Logs.
 *
 * Die Nonce hat exakt die Maske des Trainer-Master-Codes, damit beide durch
 * dieselbe Eingabebox passen (das Wordle-Template ist längen-fixiert).
 */
import { randomInt } from 'crypto';

/** Ohne verwechselbare Zeichen (I/L/O/0/1) - wird am Beamer abgetippt! */
export const NONCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Muss zur Maske des Master-Codes passen: SERVERLESS-XXXXX-XXXX */
export const NONCE_PREFIX = 'SERVERLESS';

function randomChars(count: number): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    out += NONCE_ALPHABET[randomInt(NONCE_ALPHABET.length)];
  }
  return out;
}

/** z.B. SERVERLESS-K3FQ7-9XMP */
export function generateBreakItNonce(): string {
  return `${NONCE_PREFIX}-${randomChars(5)}-${randomChars(4)}`;
}

/**
 * Nonce in die Prozess-Umgebung legen, damit alle folgenden Deploys
 * (execa erbt process.env) sie als RELEASE_ID in die Lambda schreiben.
 */
export function armBreakItNonce(nonce: string): void {
  process.env.WORKSHOP_RELEASE_ID = nonce;
}
