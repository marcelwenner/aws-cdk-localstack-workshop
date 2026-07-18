/**
 * ProgressiveHintViewer Tests
 *
 * Der Viewer bewacht das Lösungs-Gate: onAllHintsSeen darf erst feuern,
 * wenn wirklich alle Hints gesehen wurden UND der Nutzer sich aktiv für
 * die Lösung entscheidet.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ProgressiveHintViewer } from '../ProgressiveHintViewer.js';
import { waitFor } from '../../../__tests__/helpers/ink-test-utils.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const HINTS = [
  { level: 1, title: 'Erster Hint', content: 'Schau in Datei A.' },
  { level: 2, title: 'Zweiter Hint', content: 'Die Funktion heißt B.' },
  { level: 3, title: 'Dritter Hint', content: 'So sieht der Aufruf aus: C()' },
];

function setup(overrides: Partial<Record<'onProgressChange' | 'onAllHintsSeen' | 'onBack', () => void>> = {}) {
  const calls = { progress: [] as number[], allSeen: 0, back: 0 };
  const utils = render(
    <ProgressiveHintViewer
      hints={HINTS}
      initialIndex={0}
      onProgressChange={(i) => calls.progress.push(i)}
      onAllHintsSeen={() => { calls.allSeen++; (overrides.onAllHintsSeen)?.(); }}
      onBack={() => { calls.back++; (overrides.onBack)?.(); }}
    />
  );
  return { ...utils, calls };
}

describe('ProgressiveHintViewer', () => {
  it('starts at the first hint and advances with w', async () => {
    const { lastFrame, stdin, calls, unmount } = setup();
    expect(lastFrame()).toContain('Erster Hint');

    stdin.write('w');
    await waitFor(() => (lastFrame() || '').includes('Zweiter Hint'), 1500);
    expect(calls.progress).toContain(1);
    unmount();
  });

  it('does not unlock the solution before the last hint', async () => {
    const { stdin, calls, unmount } = setup();
    stdin.write('l');
    await sleep(100);
    expect(calls.allSeen).toBe(0);
    unmount();
  });

  it('reaches the completion choice after the last hint', async () => {
    const { lastFrame, stdin, unmount } = setup();
    stdin.write('w');
    await sleep(30);
    stdin.write('w');
    await sleep(30);
    stdin.write('w'); // über den letzten hinaus → completed
    await waitFor(() => !(lastFrame() || '').includes('Dritter Hint'), 1500);
    unmount();
  });

  it('fires onAllHintsSeen only when the user chooses the solution', async () => {
    const { stdin, calls, unmount } = setup();
    for (const key of ['w', 'w', 'w']) {
      stdin.write(key);
      await sleep(30);
    }
    expect(calls.allSeen).toBe(0); // completed-Screen erreicht, aber noch nichts gewählt

    stdin.write('l');
    await waitFor(() => calls.allSeen === 1, 1500);
    unmount();
  });

  it('lets the user decline the solution and go back instead', async () => {
    const { stdin, calls, unmount } = setup();
    for (const key of ['w', 'w', 'w']) {
      stdin.write(key);
      await sleep(30);
    }
    stdin.write('q');
    await waitFor(() => calls.back === 1, 1500);
    expect(calls.allSeen).toBe(0);
    unmount();
  });
});
