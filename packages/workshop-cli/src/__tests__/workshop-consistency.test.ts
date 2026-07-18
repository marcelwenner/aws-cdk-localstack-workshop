/**
 * Workshop-Konsistenz-Tests
 *
 * Schützt Verabredungen ZWISCHEN Artefakten, die kein Compiler prüft:
 * - Das Break-it-Secret im Lambda-Handler (Base64) muss zum erwarteten
 *   Secret im PhaseScreen passen - Drift blockiert den Phase-1→2-Übergang!
 * - Quiz-Fragen müssen in sich stimmig sein (Index in Range, Optionen unique)
 * - Für jede TODO-Phase muss eine Lösung im Repo liegen
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getProjectRoot } from '../lib/paths.js';
import { workshopConfig } from '../core/config/workshop.config.js';

const root = getProjectRoot();

describe('Break-it Challenge (Phase 1)', () => {
  const handlerSrc = () => readFileSync(
    join(root, 'packages/get-table-list-lambda/src/interfaces/lambda-handler.ts'),
    'utf-8'
  );
  const phaseScreenSrc = () => readFileSync(
    join(root, 'packages/workshop-cli/src/screens/PhaseScreen.tsx'),
    'utf-8'
  );
  const stackSrc = () => readFileSync(
    join(root, 'cdk/lib/workshop-stack.ts'),
    'utf-8'
  );

  it('reference lambda logs releaseId from the environment (production-style, no secret in code)', () => {
    const src = handlerSrc();
    expect(src).toContain('releaseId: process.env.RELEASE_ID');
    // Kein hartkodiertes Secret mehr im Handler - weder Klartext noch Base64
    expect(src).not.toContain('_debug_secret');
    expect(src).not.toMatch(/Buffer\.from\('[A-Za-z0-9+/=]+',\s*'base64'\)/);
  });

  it('stack wires RELEASE_ID from the CLI session env', () => {
    const src = stackSrc();
    expect(src).toContain('RELEASE_ID: process.env.WORKSHOP_RELEASE_ID');
  });

  it('trainer master code stays base64-encoded and feeds the input as fallback', () => {
    const src = phaseScreenSrc();
    const match = src.match(/PHASE1_MASTER_CODE\s*=\s*Buffer\.from\('([A-Za-z0-9+/=]+)',\s*'base64'\)/);
    expect(match, 'Base64-kodierter Master-Code im PhaseScreen nicht gefunden').toBeTruthy();
    expect(src).toContain('masterSecret={PHASE1_MASTER_CODE}');
  });

  it('the plaintext master code is grep-proof across the CLI and lambda sources', () => {
    const master = Buffer.from('U0VSVkVSTEVTUy1OSU5KQS0yMDI2', 'base64').toString();
    for (const file of [
      'packages/workshop-cli/src/screens/PhaseScreen.tsx',
      'packages/workshop-cli/src/components/input/SecretCodeInput.tsx',
      'packages/get-table-list-lambda/src/interfaces/lambda-handler.ts',
    ]) {
      expect(
        readFileSync(join(root, file), 'utf-8').includes(master),
        `Klartext-Master-Code in ${file}`
      ).toBe(false);
    }
  });

  it('CLI instructions point participants at releaseId, not at the removed key', () => {
    expect(phaseScreenSrc()).toContain('releaseId');
    expect(phaseScreenSrc()).not.toContain('_debug_secret');
    const tutorialSrc = readFileSync(
      join(root, 'packages/workshop-cli/src/lib/tutorials/phase1.tutorial.tsx'),
      'utf-8'
    );
    expect(tutorialSrc).toContain('releaseId');
    expect(tutorialSrc).not.toContain('_debug_secret');
  });
});

describe('Quiz-Integrität', () => {
  const phasesWithQuiz = workshopConfig.phases.filter(p => p.quiz);

  it('every phase has a quiz', () => {
    expect(phasesWithQuiz.length).toBe(workshopConfig.phases.length);
  });

  for (const phase of phasesWithQuiz) {
    describe(`Phase ${phase.id}: ${phase.quiz!.title}`, () => {
      it('selects no more questions than the pool provides', () => {
        expect(phase.quiz!.questionsPerQuiz).toBeLessThanOrEqual(phase.quiz!.questionPool.length);
      });

      for (const q of phase.quiz!.questionPool) {
        it(`${q.id}: correctAnswer in range, options unique, explanation present`, () => {
          expect(q.correctAnswer).toBeGreaterThanOrEqual(0);
          expect(q.correctAnswer).toBeLessThan(q.options.length);
          expect(new Set(q.options).size).toBe(q.options.length);
          expect(q.explanation.length).toBeGreaterThan(10);
          if (q.type === 'true-false') {
            // Einheitliche Reihenfolge - sonst verklicken sich schnelle Leser
            expect(q.options).toEqual(['Richtig', 'Falsch']);
          } else {
            expect(q.options.length).toBe(4);
          }
        });
      }
    });
  }
});

describe('Lambda-Code Konsistenz (Restore-Regression-Locks)', () => {
  const lambdaPackages = [
    'marking-starter-lambda',
    'lts-executor-lambda',
    'status-poller-lambda',
    'deletion-starter-lambda',
  ];

  it('every lambda container prefers AWS_ENDPOINT_URL over the baked-in endpoint', () => {
    // Regression-Lock: dieser Fix wurde schon zweimal von Backup-Restores
    // zurückgedreht - ohne ihn schlägt jeder SQS-Send aus Lambdas fehl
    for (const pkg of lambdaPackages) {
      const src = readFileSync(join(root, 'packages', pkg, 'src/infrastructure/container.ts'), 'utf-8');
      expect(
        src.includes('process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT'),
        `${pkg}: AWS_ENDPOINT_URL-Vorrang fehlt (Restore-Regression?)`
      ).toBe(true);
    }
  });

  it('postgres adapter limits the pool to one connection (lambda zombie-connection lesson)', () => {
    const src = readFileSync(join(root, 'packages/database-adapter-postgres/src/index.ts'), 'utf-8');
    expect(src, 'Der Adapter muss max: 1 nutzen - der Workshop lehrt genau diese Falle!').toMatch(/max:\s*1\s*,/);
  });

  it('worker sends completion events (uses the completionQueue grant)', () => {
    const src = readFileSync(join(root, 'packages/lts-executor-lambda/src/interfaces/lambda-handler.ts'), 'utf-8');
    expect(src).toContain('sendCompletion');
  });

  it('pre-built files in solutions are exact mirrors of the packages (no divergence)', () => {
    // Solutions überschreiben beim Apply auch Handler/Container. Alles, was
    // KEIN Deliverable ist, muss byte-identisch zum Package sein - sonst
    // tauscht "Lösung anwenden" still den Code aus, den die Teilnehmer
    // gerade studiert haben (und Fixes divergieren, wie zweimal passiert).
    const mirrors: Array<[string, string]> = [
      ['solutions/phase2/infrastructure/container.ts', 'packages/marking-starter-lambda/src/infrastructure/container.ts'],
      ['solutions/phase2/application/use-cases/start-table-marking.use-case.ts', 'packages/marking-starter-lambda/src/application/use-cases/start-table-marking.use-case.ts'],
      ['solutions/phase3/interfaces/lambda-handler.ts', 'packages/lts-executor-lambda/src/interfaces/lambda-handler.ts'],
      ['solutions/phase3/infrastructure/container.ts', 'packages/lts-executor-lambda/src/infrastructure/container.ts'],
      ['solutions/phase4/interfaces/lambda-handler.ts', 'packages/status-poller-lambda/src/interfaces/lambda-handler.ts'],
      ['solutions/phase4/infrastructure/container.ts', 'packages/status-poller-lambda/src/infrastructure/container.ts'],
    ];
    for (const [solution, pkg] of mirrors) {
      expect(
        readFileSync(join(root, solution), 'utf-8'),
        `${solution} weicht vom Package ab - Spiegel-Kopie aktualisieren!`
      ).toBe(readFileSync(join(root, pkg), 'utf-8'));
    }
  });

  it('the phase-2 solution handler is a real implementation, not the skeleton', () => {
    const solutionHandler = readFileSync(join(root, 'solutions/phase2/interfaces/lambda-handler.ts'), 'utf-8');
    const skeleton = readFileSync(join(root, 'packages/marking-starter-lambda/src/interfaces/lambda-handler.ts'), 'utf-8');
    expect(solutionHandler).not.toContain('NOT_IMPLEMENTED');
    expect(solutionHandler).not.toBe(skeleton);
    expect(skeleton).toContain('NOT_IMPLEMENTED');
  });
});

describe('Phasen-Setup', () => {
  it('phase ids are unique and sequential from 0', () => {
    const ids = workshopConfig.phases.map(p => p.id);
    expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('watchPaths point at existing package directories', () => {
    for (const phase of workshopConfig.phases) {
      for (const watchPath of phase.watchPaths) {
        const baseDir = watchPath.replace('./', '').replace('/src/**/*.ts', '');
        expect(
          existsSync(join(root, baseDir)),
          `Phase ${phase.id}: ${baseDir} existiert nicht`
        ).toBe(true);
      }
    }
  });

  it('solutions exist for the TODO phases 2-4', () => {
    for (const phase of [2, 3, 4]) {
      expect(
        existsSync(join(root, 'solutions', `phase${phase}`)),
        `solutions/phase${phase} fehlt`
      ).toBe(true);
    }
  });
});
