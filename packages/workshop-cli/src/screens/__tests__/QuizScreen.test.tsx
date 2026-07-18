/**
 * QuizScreen Tests - kompletter Durchlauf per Tastatur
 *
 * Fragen werden zufällig gezogen, deshalb prüfen die Tests Struktur
 * (Fragenzahl, Antwort-Protokoll), nicht konkrete Frage-Texte.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { QuizScreen } from '../QuizScreen.js';
import { workshopConfig } from '../../core/config/workshop.config.js';
import { waitFor } from '../../__tests__/helpers/ink-test-utils.js';
import type { QuizResult } from '../../core/state/workshop-state.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const quiz = workshopConfig.phases[0].quiz!; // 2 Fragen pro Durchlauf

describe('QuizScreen', () => {
  it('shows the intro with question count and time limit', () => {
    const { lastFrame, unmount } = render(
      <QuizScreen phase={0} quiz={quiz} onComplete={() => {}} />
    );
    const frame = lastFrame() || '';
    expect(frame).toContain(quiz.title);
    expect(frame).toContain(`${quiz.questionsPerQuiz} Fragen`);
    unmount();
  });

  // Die Optionen werden im UI GEMISCHT angezeigt - wir navigieren deshalb
  // frame-gesteuert zur gewünschten Antwort statt blind Position 1 zu wählen.
  const RICHTIG = 'Antwort-Richtig';
  const testQuiz = {
    title: 'Test-Quiz',
    timeLimit: 60,
    questionsPerQuiz: 2,
    questionPool: [
      { id: 't-q1', type: 'multiple-choice' as const, question: 'Frage eins?', options: ['Antwort-Falsch-A', RICHTIG, 'Antwort-Falsch-B', 'Antwort-Falsch-C'], correctAnswer: 1, explanation: 'Darum ist das die richtige Antwort.' },
      { id: 't-q2', type: 'multiple-choice' as const, question: 'Frage zwei?', options: ['Antwort-Falsch-A', RICHTIG, 'Antwort-Falsch-B', 'Antwort-Falsch-C'], correctAnswer: 1, explanation: 'Darum ist das die richtige Antwort.' },
    ],
  };

  /** Cursor (❯) auf eine Option bewegen, die das Prädikat erfüllt */
  async function moveCursorTo(
    lastFrame: () => string | undefined,
    stdin: { write: (s: string) => void },
    predicate: (cursorLine: string) => boolean
  ) {
    for (let i = 0; i < 5; i++) {
      const cursorLine = (lastFrame() || '').split('\n').find(l => l.includes('❯')) || '';
      if (predicate(cursorLine)) return;
      stdin.write('[B'); // Pfeil runter
      await sleep(60);
    }
    throw new Error('Zieloption nicht gefunden: ' + (lastFrame() || ''));
  }

  it('wrong answers show the explanation and need a manual continue', async () => {
    let result: QuizResult | null = null;
    const { lastFrame, stdin, unmount } = render(
      <QuizScreen phase={0} quiz={testQuiz} onComplete={(r) => { result = r; }} />
    );

    await waitFor(() => (lastFrame() || '').includes('QUIZ BEREIT'), 2000);
    stdin.write('\r'); // Quiz starten
    await waitFor(() => (lastFrame() || '').includes('WÄHLE DEINE ANTWORT'), 2000);

    for (let q = 0; q < 2; q++) {
      await waitFor(() => (lastFrame() || '').includes('WÄHLE DEINE ANTWORT'), 5000);
      await moveCursorTo(lastFrame, stdin, line => !line.includes(RICHTIG));
      stdin.write('\r'); // falsche Antwort wählen
      await waitFor(() => (lastFrame() || '').includes('Darum ist das die richtige Antwort'), 5000);
      stdin.write('\r'); // manuell weiter
      await waitFor(() => !(lastFrame() || '').includes('Darum ist das die richtige Antwort'), 5000);
    }

    await waitFor(() => result !== null, 4000);
    expect(result!.totalQuestions).toBe(2);
    expect(result!.correctAnswers).toBe(0);
    expect(result!.score).toBe(0);
    expect(result!.answers).toHaveLength(2);
    unmount();
  }, 15000);

  it('correct answers auto-advance without a continue prompt', async () => {
    let result: QuizResult | null = null;
    const { lastFrame, stdin, unmount } = render(
      <QuizScreen phase={0} quiz={testQuiz} onComplete={(r) => { result = r; }} />
    );

    await waitFor(() => (lastFrame() || '').includes('QUIZ BEREIT'), 2000);
    stdin.write('\r'); // Quiz starten
    await waitFor(() => (lastFrame() || '').includes('WÄHLE DEINE ANTWORT'), 2000);

    for (let q = 0; q < 2; q++) {
      await moveCursorTo(lastFrame, stdin, line => line.includes(RICHTIG));
      stdin.write('\r'); // richtig → Auto-Advance nach 1.5s, kein Weiter-Prompt
      await sleep(1800);
    }

    await waitFor(() => result !== null, 4000);
    expect(result!.correctAnswers).toBe(2);
    expect(result!.score).toBe(100);
    unmount();
  }, 20000);
});
