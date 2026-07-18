/**
 * SecretCodeInput Tests
 *
 * Die Eingabebox muss die Session-Nonce akzeptieren UND den
 * Trainer-Master-Code (gleiche Maske, Fallback "wegen der Zeit").
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { SecretCodeInput } from '../SecretCodeInput.js';
import { waitFor } from '../../../__tests__/helpers/ink-test-utils.js';

const NONCE = 'SERVERLESS-K3FQ7-9XMP';
const MASTER = Buffer.from('U0VSVkVSTEVTUy1OSU5KQS0yMDI2', 'base64').toString();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Tippt nur die Alphanumerik - Dashes fügt die Komponente selbst ein */
async function type(stdin: { write: (s: string) => void }, code: string) {
  for (const char of code.replace(/-/g, '')) {
    stdin.write(char);
    await sleep(5);
  }
}

describe('SecretCodeInput', () => {
  it('accepts the session nonce', async () => {
    let succeeded = false;
    const { lastFrame, stdin, unmount } = render(
      <SecretCodeInput secret={NONCE} masterSecret={MASTER} onSuccess={() => { succeeded = true; }} onCancel={() => {}} />
    );
    await type(stdin, NONCE);
    await waitFor(() => (lastFrame() || '').includes('ACCESS GRANTED'), 3000);
    // onSuccess feuert nach der Celebration-Animation (~1.2s)
    await waitFor(() => succeeded, 4000);
    unmount();
  });

  it('accepts the trainer master code as fallback', async () => {
    const { lastFrame, stdin, unmount } = render(
      <SecretCodeInput secret={NONCE} masterSecret={MASTER} onSuccess={() => {}} onCancel={() => {}} />
    );
    await type(stdin, MASTER);
    await waitFor(() => (lastFrame() || '').includes('ACCESS GRANTED'), 3000);
    unmount();
  });

  it('rejects a wrong code with feedback', async () => {
    const { lastFrame, stdin, unmount } = render(
      <SecretCodeInput secret={NONCE} masterSecret={MASTER} onSuccess={() => {}} onCancel={() => {}} />
    );
    await type(stdin, 'SERVERLESS-WRONG-XXXX');
    await waitFor(() => (lastFrame() || '').includes('Code falsch'), 3000);
    expect(lastFrame() || '').not.toContain('ACCESS GRANTED');
    unmount();
  });

  it('accepts the code pasted as one chunk (with dashes)', async () => {
    const { lastFrame, stdin, unmount } = render(
      <SecretCodeInput secret={NONCE} masterSecret={MASTER} onSuccess={() => {}} onCancel={() => {}} />
    );
    stdin.write(NONCE); // Paste: ein einziger Chunk inklusive Dashes
    await waitFor(() => (lastFrame() || '').includes('ACCESS GRANTED'), 3000);
    unmount();
  });

  it('derives the format hint from the expected code', () => {
    const { lastFrame, unmount } = render(
      <SecretCodeInput secret={NONCE} onSuccess={() => {}} onCancel={() => {}} />
    );
    expect(lastFrame()).toContain('Format: XXXXXXXXXX-XXXXX-XXXX');
    unmount();
  });
});
