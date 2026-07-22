/**
 * Phase 6 Validator - DIE ABSCHLUSSPRÜFUNG (Gesellenstück)
 *
 * Streng, alles oder nichts, fünf Ebenen:
 *   L1  CDK-Quelle: DeletionStarter selbst geschrieben, grant vorhanden,
 *       KEINE hartkodierten Queue-URLs/ARNs (Token-Lektion!)
 *   L2  Lambda ist deployed
 *   L3  Verhalten: Invoke legt einen Deletion-Task in der DB an
 *   L4  End-to-End: Worker zieht den Task bis COMPLETED, Completion-Event kommt an
 *   L5  Eigener CDK-Assertions-Test mit "DeletionStarter" im Namen ist GRÜN
 *
 * Bei Fehlschlag sagt der Validator, WELCHE Ebene rot ist - nicht wie man
 * sie grün bekommt. Es ist eine Prüfung.
 */

import { randomUUID } from 'crypto';
import { execa } from 'execa';
import { join } from 'path';
import pg from 'pg';
import { BaseValidator } from './base.validator.js';
import { workshopConfig } from '../config/workshop.config.js';
import { readCdkStack } from '../../lib/cdk-operations.js';
import { getProjectRoot } from '../../lib/paths.js';

export interface ExamSourceResult {
  ok: boolean;
  problems: string[];
}

/**
 * Entfernt Block- und Zeilenkommentare, damit auskommentierter Code
 * nicht als "geschrieben" durchgeht.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * L1: Statische Prüfung der CDK-Quelle (pur, damit gut testbar).
 */
export function checkExamSource(stackSrc: string): ExamSourceResult {
  const problems: string[] = [];
  const active = stripComments(stackSrc);

  // Construct vorhanden (im aktiven Code, nicht in Kommentaren)?
  const constructMatch = active.match(
    /(?:const|let)\s+(\w+)\s*=\s*new\s+nodejs\.NodejsFunction\(\s*this,\s*['"]DeletionStarterLambda['"]/
  );
  if (!constructMatch) {
    problems.push("L1: Kein aktives NodejsFunction-Construct mit der id 'DeletionStarterLambda' gefunden");
  } else {
    const varName = constructMatch[1];

    // Grant auf die Worker-Queue?
    const grantRegex = new RegExp(`ltsWorkerQueue\\.grantSendMessages\\(\\s*${varName}\\s*\\)`);
    if (!grantRegex.test(active)) {
      problems.push(`L1: grantSendMessages auf die Worker-Queue fehlt (Least Privilege!)`);
    }

    // Richtiger Handler-Entry?
    const blockStart = active.indexOf(constructMatch[0]);
    const block = active.slice(blockStart, blockStart + 900);
    if (!block.includes('deletion-starter-lambda')) {
      problems.push('L1: entry zeigt nicht auf packages/deletion-starter-lambda');
    }
    if (!/functionName:\s*['"]DeletionStarterLambda['"]/.test(block)) {
      problems.push("L1: functionName 'DeletionStarterLambda' fehlt");
    }
  }

  // Token-Lektion: keine hartkodierten Queue-URLs oder SQS-ARNs
  if (/(['"`])(?:https?:\/\/[^'"`]*4566[^'"`]*queue[^'"`]*|arn:aws:sqs[^'"`]*)\1/i.test(active)) {
    problems.push('L1: Hartkodierte Queue-URL/ARN gefunden - referenziere die Ressource (Tokens!)');
  }

  return { ok: problems.length === 0, problems };
}

export default class Phase6Validator extends BaseValidator {
  async validate(): Promise<{ passed: boolean; hints?: string[] }> {
    const hints: string[] = [];

    // Voraussetzung: die Kern-Phasen sind deployed (der Worker muss den Task ziehen)
    const [starter, executor] = await Promise.all([
      this.lambdaExists(workshopConfig.lambdas.MarkingStarter),
      this.lambdaExists(workshopConfig.lambdas.LtsExecutor),
    ]);
    if (!starter || !executor) {
      return {
        passed: false,
        hints: ['Voraussetzung fehlt: Phasen 2+3 müssen deployed sein, bevor die Prüfung startet.'],
      };
    }

    // L1: CDK-Quelle
    const source = checkExamSource(await readCdkStack());
    if (!source.ok) {
      return { passed: false, hints: source.problems };
    }

    // L2: Deployed
    const deployed = await this.lambdaExists(workshopConfig.lambdas.DeletionStarter);
    if (!deployed) {
      return { passed: false, hints: ['L2: DeletionStarterLambda ist nicht deployed (cdklocal deploy?)'] };
    }

    // L3: Verhalten - Invoke legt Task an
    const jobId = randomUUID();
    const invoke = await this.invokeLambda<{ taskId?: number }>(
      workshopConfig.lambdas.DeletionStarter,
      { jobId, tableName: 'demo_table_1' }
    );
    if (!invoke.success || typeof invoke.result?.taskId !== 'number') {
      hints.push('L3: Invoke fehlgeschlagen oder Response enthält keine taskId');
      if (invoke.error) hints.push(`    ${invoke.error.slice(0, 160)}`);
      return { passed: false, hints };
    }
    const taskId = invoke.result.taskId;

    const completionBefore = (await this.getQueueMetrics(workshopConfig.queues.completion)).depth;

    // L3b + L4: Task in DB und bis COMPLETED verfolgen
    const db = new pg.Client({ ...workshopConfig.db.postgres, connectionTimeoutMillis: 5000 });
    try {
      await db.connect();
      const row = await db.query('SELECT status FROM lts.deletion_tasks WHERE id = $1', [taskId]);
      if (row.rowCount === 0) {
        return { passed: false, hints: [`L3: Task ${taskId} existiert nicht in lts.deletion_tasks`] };
      }

      const deadline = Date.now() + 90_000;
      const pendingDeadline = Date.now() + 15_000; // early-out wenn Worker sofort crasht
      for (;;) {
        const res = await db.query('SELECT status FROM lts.deletion_tasks WHERE id = $1', [taskId]);
        const status = res.rows[0]?.status;
        if (status === 'COMPLETED') break;
        if (status === 'FAILED') {
          return { passed: false, hints: [`L4: Task ${taskId} ist FAILED - Worker-Logs prüfen ([L])`] };
        }
        if (status === 'PENDING' && Date.now() > pendingDeadline) {
          return {
            passed: false,
            hints: [
              `L4: Task ${taskId} ist nach 15s noch PENDING - der Worker crasht sofort`,
              '    → Ist ExecuteDeletionTaskUseCase in Phase 3 implementiert?',
              '    → packages/lts-executor-lambda/src/application/use-cases/execute-deletion-task.use-case.ts',
              '    Nach der Implementierung: cdklocal deploy neu ausführen',
            ],
          };
        }
        if (Date.now() > deadline) {
          return {
            passed: false,
            hints: [`L4: Task ${taskId} nach 90s noch '${status}' - kommt die Message beim Worker an?`],
          };
        }
        await new Promise(r => setTimeout(r, 3000));
      }
    } finally {
      await db.end().catch(() => {});
    }

    // L4b: Completion-Event angekommen?
    const completionAfter = (await this.getQueueMetrics(workshopConfig.queues.completion)).depth;
    if (completionAfter <= completionBefore) {
      return { passed: false, hints: ['L4: Kein Completion-Event in der completion-queue angekommen'] };
    }

    // L5: Eigener CDK-Assertions-Test ist grün
    try {
      const result = await execa('npx', ['vitest', 'run', '-t', 'DeletionStarter'], {
        cwd: join(getProjectRoot(), 'cdk'),
        timeout: 180_000,
        reject: false,
        env: { ...process.env, CI: 'true' },
      });
      const output = `${result.stdout}\n${result.stderr}`;
      const passedMatch = output.match(/(\d+)\s+passed/);
      const testsPassed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
      const anyFailed = /\d+\s+failed/.test(output);
      if (result.exitCode !== 0 || anyFailed || testsPassed < 1) {
        return {
          passed: false,
          hints: [
            'L5: Kein grüner CDK-Assertions-Test mit "DeletionStarter" im Namen gefunden',
            '    (cdk/test/ - der Test muss deine Lambda UND die IAM-Policy prüfen können)',
          ],
        };
      }
    } catch {
      return { passed: false, hints: ['L5: CDK-Testlauf konnte nicht gestartet werden (cd cdk && pnpm test?)'] };
    }

    return { passed: true };
  }
}
