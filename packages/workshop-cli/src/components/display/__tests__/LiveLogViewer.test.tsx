/**
 * LiveLogViewer Tests
 *
 * Regression: CloudWatch-Lambda-Zeilen sind tab-separiert und beliebig lang.
 * Tabs (Ink misst 1 Zeichen, Terminal rendert bis 8) und umbrechende Zeilen
 * zerstörten den Cursor-Sync: zerrissener Rahmen, Flackern, Inhalt in der
 * Sidebar. Jede Log-Zeile muss tab-frei sein und in EINE Zeile passen.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { LiveLogViewer } from '../LiveLogViewer.js';
import type { LogEntry } from '../../../hooks/useLiveLogStream.js';

function entry(message: string): LogEntry {
  return { timestamp: Date.now(), message, formatted: message };
}

const cloudWatchTabLine = entry(
  '2026-07-10T08:36:49.836Z\t7c59c6ff-ceb7-49f2-a674-351893e10a5d\tINFO\t' +
  '{"event":"LAMBDA_INVOKED","lambdaName":"GetTableListLambda","correlationId":"7c59c6ff-ceb7-49f2-a674-351893e10a5d","timestamp":"2026-07-10T08:36:49.835Z"}'
);

const veryLongJsonLine = entry(
  JSON.stringify({
    event: 'MARKING_TASK_EXECUTED',
    level: 'INFO',
    tableName: 'a_table_with_a_rather_long_name_for_testing',
    correlationId: '7c59c6ff-ceb7-49f2-a674-351893e10a5d',
    details: 'x'.repeat(300),
  })
);

describe('LiveLogViewer', () => {
  it('never renders a line wider than the terminal (no wrap, no overflow)', () => {
    const { lastFrame, unmount } = render(
      <LiveLogViewer logs={[cloudWatchTabLine, veryLongJsonLine]} isStreaming lambdaName="GetTableListLambda" />
    );
    const lines = (lastFrame() || '').split('\n');
    for (const line of lines) {
      expect(line.length, `Zeile breiter als Terminal: ${line.slice(0, 60)}...`).toBeLessThanOrEqual(100);
    }
    unmount();
  });

  it('strips tabs from CloudWatch lines (they break ink width math)', () => {
    const { lastFrame, unmount } = render(
      <LiveLogViewer logs={[cloudWatchTabLine]} isStreaming />
    );
    expect(lastFrame()).not.toContain('\t');
    unmount();
  });

  it('still shows the parsed content of a JSON log', () => {
    const { lastFrame, unmount } = render(
      <LiveLogViewer logs={[veryLongJsonLine]} isStreaming />
    );
    const frame = lastFrame() || '';
    expect(frame).toContain('MARKING_TASK_EXECUTED');
    // Der Rest der Zeile wird sauber mit Ellipsis abgeschnitten
    expect(frame).toContain('…');
    unmount();
  });

  it('filters by level via the tab counts', () => {
    const { lastFrame, unmount } = render(
      <LiveLogViewer
        logs={[entry('{"event":"X_FAILED","level":"ERROR"}'), veryLongJsonLine]}
        isStreaming
      />
    );
    expect(lastFrame()).toContain('ERROR:1');
    unmount();
  });
});
