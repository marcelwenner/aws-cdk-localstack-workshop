/**
 * CheatSheetScreen Tests
 *
 * Regression: Der Screen hatte keine Höhen-Logik - das Glossar (22 Einträge,
 * ~50 Zeilen) wurde komplett gerendert und stumm geclippt. Jetzt passt er
 * ganze Snippets ins Höhenbudget ein und scrollt mit ↑↓.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { CheatSheetScreen } from '../CheatSheetScreen.js';

const noop = () => {};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function tabTo(stdin: { write: (s: string) => void }, times: number) {
  for (let i = 0; i < times; i++) {
    stdin.write('\t');
    await sleep(10);
  }
}

describe('CheatSheetScreen', () => {
  it('shows the shortcuts category starting at the first snippet', () => {
    const { lastFrame, unmount } = render(<CheatSheetScreen onClose={noop} />);
    const frame = lastFrame() || '';
    expect(frame).toContain('[t] Tutorial');
    expect(frame).not.toContain('weitere oben');
    unmount();
  });

  it('glossary fits the height budget and offers scrolling instead of clipping', async () => {
    const { lastFrame, stdin, unmount } = render(<CheatSheetScreen onClose={noop} />);
    await tabTo(stdin, 5); // Glossar ist Kategorie 6
    const frame = lastFrame() || '';
    expect(frame).toContain('Glossar');
    expect(frame).toContain('weitere unten');
    // Bei Default-Höhe (24 Zeilen) dürfen nicht alle 22 Einträge sichtbar sein
    expect(frame).not.toContain('Visibility Timeout');
    unmount();
  });

  it('scrolling down reveals hidden entries and shows the above-indicator', async () => {
    const { lastFrame, stdin, unmount } = render(<CheatSheetScreen onClose={noop} />);
    await tabTo(stdin, 5);
    stdin.write('j');
    await sleep(10);
    stdin.write('j');
    await sleep(10);
    const frame = lastFrame() || '';
    expect(frame).toContain('weitere oben');
    unmount();
  });
});
