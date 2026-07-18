/**
 * E2E-Probelauf: Spielt den Workshop automatisiert durch, wie ein Teilnehmer.
 *
 * Ablauf:
 *   0. Preflight (LocalStack, Postgres)
 *   1. Basis-Stack deployen, Phase 1 validieren
 *   2. Phase 2: Solution anwenden → CDK aktivieren → deployen → validieren
 *   3. Phase 3: dito + echter Fan-Out/Worker-Flow (Tasks bis COMPLETED beobachten)
 *   4. Phase 4: dito + Backoff-Beweis (delayed Messages in der status-check-queue)
 *   5. Poison-Pill-Zeitmessung (Wie lange bis zur DLQ? → Live-Demo-Planung!)
 *   6. Restore: Skeletons + CDK-Stack zurück, Stack neu deployen
 *
 * Aufruf:   pnpm --filter workshop-cli run e2e
 * Flags:    --keep         kein Restore am Ende (Repo bleibt im "gelösten" Zustand)
 *           --skip-poison  Poison-Pill-Messung überspringen (spart bis zu 6 min)
 *
 * Achtung: überschreibt Teilnehmer-Skeletons (Backup in .workshop-backup/) und
 * den CDK-Stack (Snapshot wird am Ende zurückgeschrieben, außer bei --keep).
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { execa } from 'execa';
import pg from 'pg';
import { getProjectRoot } from '../src/lib/paths.js';
import { unlink } from 'fs/promises';
import { validatePhase } from '../src/core/validators/index.js';
import { generateCertificate } from '../src/lib/certificate.js';
import { applySolution, restoreFromBackup } from '../src/lib/file-operations.js';
import { applyCdkChanges, getCdkStackPath } from '../src/lib/cdk-operations.js';
import { runCdkDeploy } from '../src/lib/fast-deploy.js';
import { AwsInfrastructure } from '../src/core/infrastructure/aws-infrastructure.js';
import { workshopConfig } from '../src/core/config/workshop.config.js';

const KEEP = process.argv.includes('--keep');
const SKIP_POISON = process.argv.includes('--skip-poison');
const POISON_MAX_WAIT_MS = 6 * 60 * 1000;

const infra = new AwsInfrastructure();

type StepStatus = 'ok' | 'fail' | 'warn' | 'skip';
interface StepResultLine {
  name: string;
  status: StepStatus;
  detail: string;
  ms: number;
}
const report: StepResultLine[] = [];
const findings: string[] = [];

const ICONS: Record<StepStatus, string> = { ok: '✓', fail: '✗', warn: '⚠', skip: '·' };

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

async function step(name: string, fn: () => Promise<{ status?: StepStatus; detail?: string }>): Promise<boolean> {
  const start = Date.now();
  log(`\n▶ ${name}`);
  try {
    const { status = 'ok', detail = '' } = await fn();
    const ms = Date.now() - start;
    report.push({ name, status, detail, ms });
    log(`  ${ICONS[status]} ${detail || status} (${fmtMs(ms)})`);
    return status !== 'fail';
  } catch (err) {
    const ms = Date.now() - start;
    const detail = err instanceof Error ? err.message : String(err);
    report.push({ name, status: 'fail', detail, ms });
    log(`  ✗ ${detail} (${fmtMs(ms)})`);
    return false;
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function newPgClient(): pg.Client {
  const cfg = workshopConfig.db.postgres;
  return new pg.Client({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    connectionTimeoutMillis: 5000,
  });
}

async function queueDepths(name: string) {
  return infra.getQueueMetrics(name);
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function preflight() {
  const health = await fetch('http://localhost:4566/_localstack/health', {
    signal: AbortSignal.timeout(3000),
  }).catch(() => null);
  if (!health?.ok) {
    throw new Error('LocalStack nicht erreichbar. Starte mit: npm run docker:up');
  }
  const client = newPgClient();
  await client.connect();
  await client.query('SELECT 1');
  await client.end();
  return { detail: 'LocalStack + Postgres erreichbar' };
}

/** Best effort: alle Workshop-Queues leeren, damit Läufe sich nicht gegenseitig kontaminieren */
async function purgeQueues() {
  const names = [
    workshopConfig.queues.ltsWorker,
    workshopConfig.queues.ltsWorkerDLQ,
    workshopConfig.queues.statusCheck,
    workshopConfig.queues.statusCheckDLQ,
    workshopConfig.queues.completion,
  ];
  let purged = 0;
  for (const name of names) {
    try {
      const url = await infra.getQueueUrl(name);
      if (url) {
        await infra.purgeQueue(url);
        purged++;
      }
    } catch {
      // Queue existiert evtl. noch nicht - ok
    }
  }
  return { detail: `${purged} Queue(s) geleert`, status: 'ok' as StepStatus };
}

async function bootstrap() {
  await execa('npx', ['cdklocal', 'bootstrap'], {
    cwd: join(getProjectRoot(), 'cdk'),
    timeout: 120000,
    env: {
      ...process.env,
      AWS_ACCESS_KEY_ID: 'test',
      AWS_SECRET_ACCESS_KEY: 'test',
      AWS_DEFAULT_REGION: 'us-east-1',
    },
  });
  return { detail: 'cdklocal bootstrap OK' };
}

async function deployStack(label: string) {
  const result = await runCdkDeploy();
  if (!result.success) {
    throw new Error(`Deploy fehlgeschlagen: ${result.error || 'unbekannt'}`);
  }
  return { detail: `${label} deployed` };
}

async function runPhaseValidation(phase: number) {
  const result = await validatePhase(phase);
  if (!result.passed) {
    const hintText = (result.hints || []).slice(0, 3).join(' | ') || 'failed';
    // Phase 4 verlangt eine gefüllte DLQ (Chaos-Kriterium). Wenn NUR das fehlt,
    // liegt es am Retry-Timing (Visibility Timeout), nicht am Code.
    if (phase === 4 && hintText.includes('Chaos')) {
      findings.push(
        'Phase-4-Validator: DLQ-Kriterium (Chaos) nicht innerhalb des Laufs erfüllt. ' +
        'Poison Pills brauchen wegen Visibility Timeout länger bis zur DLQ. Siehe Poison-Pill-Messung.'
      );
      return { status: 'warn' as StepStatus, detail: `DLQ-Kriterium offen (Retry-Timing): ${hintText}` };
    }
    throw new Error(`Validator Phase ${phase}: ${hintText}`);
  }
  return { detail: `Validator Phase ${phase} bestanden` };
}

/** Chaos wie der Dashboard-Button: Poison Pills + direktes DLQ-Seeding (ehrlich gelabelt) */
async function injectChaos(count: number) {
  const queueUrl = await infra.getQueueUrl(workshopConfig.queues.ltsWorker);
  if (!queueUrl) throw new Error('lts-worker-queue nicht gefunden');
  for (let i = 0; i < count; i++) {
    await infra.sendMessage(queueUrl, { kaputt: true, e2e: `chaos-${i}` });
  }
  // Echte Pills brauchen 3 × Visibility (900s) bis zur DLQ - wie der Chaos-Button
  // seeden wir die DLQ direkt, damit das Phase-4-Kriterium sofort erfüllbar ist.
  const dlqUrl = await infra.getQueueUrl(workshopConfig.queues.ltsWorkerDLQ);
  if (dlqUrl) {
    for (let i = 0; i < count; i++) {
      await infra.sendMessage(dlqUrl, {
        kaputt: true,
        _workshopHinweis: 'Simuliert: nach 3 fehlgeschlagenen Zustellversuchen hierher verschoben',
      });
    }
  }
  return { detail: `${count} Poison Pills in die Queue + ${count} simulierte Messages in die DLQ` };
}

async function applyPhase(phase: number) {
  const solution = await applySolution(phase);
  const cdk = await applyCdkChanges(phase);
  if (!cdk.success) {
    throw new Error(`CDK-Aktivierung Phase ${phase}: ${cdk.message}`);
  }
  return { detail: `${solution.lambdaFiles.length} Solution-Dateien + CDK-Block aktiv` };
}

/** Phase 3: echter Fan-Out → Worker → COMPLETED Flow */
async function workerFlow() {
  const invoke = await infra.invokeLambda<{ tasksCreated?: number; taskIds?: number[] }>(
    workshopConfig.lambdas.MarkingStarter,
    { action: 'startMarking', tableCount: 3 }
  );
  if (!invoke.success) {
    throw new Error(`MarkingStarter invoke: ${invoke.error || 'failed'}`);
  }
  const taskIds = invoke.result?.taskIds || [];
  if (taskIds.length === 0) {
    throw new Error(`MarkingStarter lieferte keine taskIds (Response: ${JSON.stringify(invoke.result).slice(0, 200)})`);
  }

  const client = newPgClient();
  await client.connect();
  try {
    const deadline = Date.now() + 180_000;
    for (;;) {
      const res = await client.query(
        `SELECT status, count(*)::int AS n FROM lts.marking_tasks WHERE id = ANY($1::int[]) GROUP BY status`,
        [taskIds]
      );
      const byStatus: Record<string, number> = {};
      for (const row of res.rows) byStatus[row.status] = row.n;
      const open = (byStatus['PENDING'] || 0) + (byStatus['IN_PROGRESS'] || 0);
      const done = byStatus['COMPLETED'] || 0;
      const failed = byStatus['FAILED'] || 0;

      if (open === 0 && done + failed >= taskIds.length) {
        // Der Worker sendet pro fertigem Task ein Completion-Event in die
        // completion-queue (Outbox, kein Consumer) - das muss ankommen!
        const completion = await queueDepths(workshopConfig.queues.completion);
        const detailParts = [
          `${done} COMPLETED`,
          failed ? `${failed} FAILED` : null,
          `completion-queue: ${completion.depth} Event(s)`,
        ].filter(Boolean).join(', ');
        if (failed > 0) {
          findings.push(`Worker-Flow: ${failed} Task(s) FAILED - Logs prüfen`);
          return { status: 'warn' as StepStatus, detail: detailParts };
        }
        if (completion.depth < done) {
          findings.push(`Worker-Flow: nur ${completion.depth}/${done} Completion-Events angekommen`);
          return { status: 'warn' as StepStatus, detail: detailParts };
        }
        return { detail: detailParts };
      }
      if (Date.now() > deadline) {
        throw new Error(`Timeout: nach 180s noch ${open} offene Task(s) (${done} COMPLETED, ${failed} FAILED)`);
      }
      await sleep(3000);
    }
  } finally {
    await client.end();
  }
}

/** Phase 4: Backoff-Beweis - IN_PROGRESS-Task + Status-Check-Message → delayed > 0 */
async function backoffProof() {
  const client = newPgClient();
  await client.connect();
  let jobId: string;
  const tableName = `e2e_backoff_${Date.now()}`;
  try {
    const res = await client.query(
      `INSERT INTO lts.marking_tasks (job_id, table_name, cutoff_date, status)
       VALUES (gen_random_uuid(), $1, NOW(), 'IN_PROGRESS') RETURNING job_id`,
      [tableName]
    );
    jobId = res.rows[0].job_id;
  } finally {
    await client.end();
  }

  const queueUrl = await infra.getQueueUrl(workshopConfig.queues.statusCheck);
  if (!queueUrl) throw new Error('status-check-queue nicht gefunden');
  await infra.sendMessage(queueUrl, {
    jobId,
    tableName,
    attempt: 0,
    correlationId: 'e2e-probelauf',
  });

  // Der Poller sollte die Message konsumieren und mit DelaySeconds neu einstellen
  const deadline = Date.now() + 30_000;
  for (;;) {
    const m = await queueDepths(workshopConfig.queues.statusCheck);
    if ((m.delayed ?? 0) > 0) {
      return { detail: `Backoff LIVE: ${m.delayed} delayed Message(s) in der status-check-queue` };
    }
    if (Date.now() > deadline) {
      findings.push(
        'Backoff-Beweis fehlgeschlagen: keine delayed Message innerhalb 30s. ' +
        'Entweder liefert LocalStack ApproximateNumberOfMessagesDelayed nicht, oder der Poller reschedult nicht. ' +
        'Das Phase-4-Dashboard-Panel damit gegenprüfen!'
      );
      return { status: 'warn' as StepStatus, detail: 'keine delayed Message innerhalb 30s beobachtet' };
    }
    await sleep(2000);
  }
}

/** Poison-Pill-Zeitmessung: Wie lange bis zur DLQ? */
async function poisonPillTiming() {
  const dlqName = workshopConfig.queues.ltsWorkerDLQ;
  const dlqBefore = (await queueDepths(dlqName)).depth;

  const queueUrl = await infra.getQueueUrl(workshopConfig.queues.ltsWorker);
  if (!queueUrl) throw new Error('lts-worker-queue nicht gefunden');
  const t0 = Date.now();
  await infra.sendMessage(queueUrl, { kaputt: true, e2e: 'poison-pill-timing' });

  let receiveObserved: number | null = null;
  for (;;) {
    const elapsed = Date.now() - t0;
    const worker = await queueDepths(workshopConfig.queues.ltsWorker);
    const dlq = await queueDepths(dlqName);

    if (receiveObserved === null && worker.inFlight > 0) {
      receiveObserved = elapsed;
      log(`    … Worker hat die Pill nach ${fmtMs(elapsed)} aufgenommen (inFlight)`);
    }
    if (dlq.depth > dlqBefore) {
      const detail = `Poison Pill nach ${fmtMs(elapsed)} in der DLQ (maxReceiveCount 3)`;
      if (elapsed > 90_000) {
        findings.push(
          `Poison-Pill-Demo dauert real ${fmtMs(elapsed)} bis zur DLQ. ` +
          'Für die Live-Demo einplanen oder Demo-Skript anpassen (nur ersten Crash live zeigen).'
        );
        return { status: 'warn' as StepStatus, detail };
      }
      return { detail };
    }
    if (elapsed > POISON_MAX_WAIT_MS) {
      findings.push(
        `Poison Pill war nach ${fmtMs(POISON_MAX_WAIT_MS)} NICHT in der DLQ ` +
        '(Visibility 900s × 3 Retries = theoretisch bis 45 min). ' +
        'Die Folien-Live-Demo "zuschauen bis DLQ" funktioniert so nicht - umbauen!'
      );
      return {
        status: 'warn' as StepStatus,
        detail: `nach ${fmtMs(POISON_MAX_WAIT_MS)} noch nicht in der DLQ (Redelivery hängt am Visibility Timeout)`,
      };
    }
    await sleep(5000);
  }
}

// ---------------------------------------------------------------------------
// Abschlussprüfung (Phase 6): Muster-Gesellenstück einschreiben und bestehen
// ---------------------------------------------------------------------------

const EXAM_TEST_FILE = join(getProjectRoot(), 'cdk', 'test', 'exam-sim.deletion-starter.test.ts');
const EXAM_BLOCK = `
    const deletionStarterLambda = new nodejs.NodejsFunction(this, 'DeletionStarterLambda', {
      functionName: 'DeletionStarterLambda',
      entry: path.join(__dirname, '../../packages/deletion-starter-lambda/src/interfaces/lambda-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: lambdaEnvironment,
      bundling: { minify: false, sourceMap: true },
    });
    ltsWorkerQueue.grantSendMessages(deletionStarterLambda);

    `;

async function examEnroll() {
  const stackPath = getCdkStackPath();
  const src = await readFile(stackPath, 'utf-8');
  const marker = '    // Outputs';
  if (!src.includes(marker)) throw new Error('Outputs-Marker im Stack nicht gefunden');
  await writeFile(stackPath, src.replace(marker, `${EXAM_BLOCK}${marker}`), 'utf-8');

  await writeFile(EXAM_TEST_FILE, `/** Prüfungssimulation - wird vom E2E-Lauf erzeugt und wieder gelöscht */
import { describe, it } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { WorkshopStack } from '../lib/workshop-stack.js';

describe('exam-sim', () => {
  it('DeletionStarter exists and may send to the worker queue', () => {
    const app = new cdk.App();
    const template = Template.fromStack(new WorkshopStack(app, 'ExamSimStack'));
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'DeletionStarterLambda',
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Action: Match.arrayWith(['sqs:SendMessage']) }),
        ]),
      }),
    });
  }, 180000);
});
`, 'utf-8');

  return { detail: 'Gesellenstück eingeschrieben (CDK-Block + eigener Assertions-Test)' };
}

async function examValidation() {
  const result = await validatePhase(6);
  if (!result.passed) {
    throw new Error(`Prüfung nicht bestanden: ${(result.hints || []).join(' | ')}`);
  }
  return { detail: 'Abschlussprüfung bestanden (L1 Quelle, L2 Deploy, L3 Task, L4 COMPLETED+Event, L5 Test grün)' };
}

async function examCertificate() {
  const cert = await generateCertificate({
    name: 'E2E Probelauf',
    date: new Date().toISOString(),
    durationLabel: 'Simulation',
    quizLabel: 'Simulation',
  });
  const path = cert.pdfPath || cert.htmlPath;
  const kind = cert.pdfPath ? 'PDF' : 'HTML (kein Browser gefunden)';
  // Aufräumen: das Simulations-Zertifikat nicht liegen lassen
  await unlink(path).catch(() => {});
  return { detail: `Zertifikat erzeugt als ${kind}, Prüfcode ${cert.pruefcode}` };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log('╔══════════════════════════════════════════╗');
  log('║  E2E-PROBELAUF · AWS CDK LocalStack Workshop  ');
  log('╚══════════════════════════════════════════╝');

  const stackPath = getCdkStackPath();
  const stackSnapshot = await readFile(stackPath, 'utf-8');

  let ok = await step('Preflight (LocalStack + Postgres)', preflight);
  if (!ok) {
    printReport();
    process.exit(1);
  }

  try {
    ok = await step('cdklocal bootstrap', bootstrap);
    if (ok) ok = await step('Basis-Stack deployen', () => deployStack('Basis-Stack'));
    if (ok) await step('Queues leeren (sauberer Startzustand)', purgeQueues);

    if (ok) await step('Phase 1 validieren (GetTableList)', () => runPhaseValidation(1));

    if (ok) ok = await step('Phase 2: Solution + CDK aktivieren', () => applyPhase(2));
    if (ok) ok = await step('Phase 2: Deploy', () => deployStack('MarkingStarterLambda'));
    if (ok) await step('Phase 2 validieren (Fan-Out)', () => runPhaseValidation(2));

    if (ok) ok = await step('Phase 3: Solution + CDK aktivieren', () => applyPhase(3));
    if (ok) ok = await step('Phase 3: Deploy', () => deployStack('LtsExecutorLambda'));
    if (ok) await step('Phase 3 validieren (Worker)', () => runPhaseValidation(3));
    if (ok) await step('Phase 3: E2E Fan-Out → Worker → COMPLETED', workerFlow);
    if (ok) await step('Chaos: Poison Pills injizieren (für Phase-4-DLQ-Kriterium)', () => injectChaos(3));

    if (ok) ok = await step('Phase 4: Solution + CDK aktivieren', () => applyPhase(4));
    if (ok) ok = await step('Phase 4: Deploy', () => deployStack('StatusPollerLambda'));
    if (ok) await step('Phase 4 validieren (Poller)', () => runPhaseValidation(4));
    if (ok) await step('Phase 4: Backoff-Beweis (delayed Messages)', backoffProof);

    // Abschlussprüfung: Muster-Gesellenstück durchspielen
    if (ok) ok = await step('Prüfung: Gesellenstück einschreiben', examEnroll);
    if (ok) ok = await step('Prüfung: Deploy', () => deployStack('DeletionStarterLambda'));
    if (ok) await step('Prüfung: strenge Validierung (L1-L5)', examValidation);
    if (ok) await step('Prüfung: Zertifikat erzeugen', examCertificate);

    if (ok && !SKIP_POISON) {
      await step('Poison-Pill-Zeitmessung (max. 6 min)', poisonPillTiming);
    } else if (SKIP_POISON) {
      report.push({ name: 'Poison-Pill-Zeitmessung', status: 'skip', detail: '--skip-poison', ms: 0 });
    }
  } finally {
    if (KEEP) {
      log('\n--keep gesetzt: Repo bleibt im gelösten Zustand (Backups in .workshop-backup/).');
    } else {
      await step('Restore: Skeletons + CDK-Stack zurücksetzen', async () => {
        for (const phase of [2, 3, 4]) {
          await restoreFromBackup(phase).catch(() => {});
        }
        await writeFile(stackPath, stackSnapshot, 'utf-8');
        await unlink(EXAM_TEST_FILE).catch(() => {});
        return { detail: 'Dateien zurückgesetzt' };
      });
      await step('Restore: Basis-Stack neu deployen', () => deployStack('Basis-Stack (restored)'));
    }
  }

  printReport();
  process.exit(report.some(r => r.status === 'fail') ? 1 : 0);
}

function printReport() {
  log('\n══════════════ REPORT ══════════════');
  for (const r of report) {
    log(` ${ICONS[r.status]} ${r.name.padEnd(45)} ${fmtMs(r.ms).padStart(7)}  ${r.detail}`);
  }
  if (findings.length > 0) {
    log('\n⚠ ERKENNTNISSE FÜR DEN WORKSHOP-TAG:');
    for (const f of findings) log(`  • ${f}`);
  }
  const fails = report.filter(r => r.status === 'fail').length;
  const warns = report.filter(r => r.status === 'warn').length;
  log(`\n${fails === 0 ? '✓' : '✗'} ${report.length} Schritte, ${fails} Fehler, ${warns} Warnungen`);
}

main().catch(err => {
  log(`\nFATAL: ${err instanceof Error ? err.stack || err.message : String(err)}`);
  printReport();
  process.exit(1);
});
