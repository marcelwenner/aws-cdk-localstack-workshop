/**
 * CertificateScreen Tests (mit injiziertem Generator - kein echtes PDF)
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { CertificateScreen } from '../CertificateScreen.js';
import { VALIDATED_SKILLS } from '../../lib/certificate.js';
import { waitFor } from '../../__tests__/helpers/ink-test-utils.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const stubGenerate = async () => ({
  pdfPath: 'C:/repo/zertifikat-max-mustermann.pdf',
  htmlPath: 'C:/tmp/cert.html',
  pruefcode: 'AAAA-BBBB-CCCC',
});

/** Namen als Paste eingeben und warten, bis er im Frame steht (Einzelzeichen sind unter Last flaky) */
async function typeName(
  stdin: { write: (s: string) => void },
  lastFrame: () => string | undefined,
  text: string
) {
  stdin.write(text);
  await waitFor(() => (lastFrame() || '').includes(text), 2000);
}

describe('CertificateScreen', () => {
  it('shows the validated skills and asks for a name', () => {
    const { lastFrame, unmount } = render(
      <CertificateScreen onDone={() => {}} generateFn={stubGenerate} />
    );
    const frame = lastFrame() || '';
    expect(frame).toContain('Abschlussprüfung bestanden');
    expect(frame).toContain('Name fürs Zertifikat');
    for (const skill of VALIDATED_SKILLS) {
      expect(frame).toContain(skill.slice(0, 30));
    }
    unmount();
  });

  it('generates after name entry and shows path, code and continue hint', async () => {
    const { lastFrame, stdin, unmount } = render(
      <CertificateScreen onDone={() => {}} generateFn={stubGenerate} />
    );
    await typeName(stdin, lastFrame, 'Max Mustermann');
    stdin.write('\r');
    await waitFor(() => (lastFrame() || '').includes('Zertifikat erstellt'), 3000);
    const frame = lastFrame() || '';
    expect(frame).toContain('zertifikat-max-mustermann.pdf');
    expect(frame).toContain('AAAA-BBBB-CCCC');
    expect(frame).toContain('[Enter]');
    unmount();
  });

  it('continues to the finale on enter after generation', async () => {
    let done = false;
    const { lastFrame, stdin, unmount } = render(
      <CertificateScreen onDone={() => { done = true; }} generateFn={stubGenerate} />
    );
    await typeName(stdin, lastFrame, 'Max');
    stdin.write('\r');
    await waitFor(() => (lastFrame() || '').includes('Zertifikat erstellt'), 3000);
    stdin.write('\r');
    await waitFor(() => done, 2000);
    unmount();
  });

  it('rejects empty names (no generation without a name)', async () => {
    const { lastFrame, stdin, unmount } = render(
      <CertificateScreen onDone={() => {}} generateFn={stubGenerate} />
    );
    stdin.write('\r');
    await sleep(150);
    expect(lastFrame()).toContain('Name fürs Zertifikat');
    expect(lastFrame()).not.toContain('Zertifikat erstellt');
    unmount();
  });

  it('shows the error state but still allows continuing', async () => {
    let done = false;
    const failing = async () => { throw new Error('kein Browser'); };
    const { lastFrame, stdin, unmount } = render(
      <CertificateScreen onDone={() => { done = true; }} generateFn={failing} />
    );
    await typeName(stdin, lastFrame, 'Max');
    stdin.write('\r');
    await waitFor(() => (lastFrame() || '').includes('fehlgeschlagen'), 3000);
    stdin.write('\r');
    await waitFor(() => done, 2000);
    unmount();
  });
});
