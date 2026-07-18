/**
 * cdk-operations Tests
 *
 * Regression für den CDK-Guide-Autofix: Die TODO-Anleitung im Stack
 * erwähnt /* und *\/ wörtlich im Kommentartext. Die Validierung darf
 * das nach dem Entkommentieren nicht als übrig gebliebene Block-Marker
 * werten (sonst wird der Guide nie grün).
 *
 * Läuft gegen eine synthetische Stack-Kopie in einem Temp-Verzeichnis,
 * unabhängig vom Zustand der echten Datei (die verändert eine laufende
 * Workshop-Session ständig).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  applyCdkChanges,
  validateCdkForPhase,
  getCdkStatus,
  overrideCdkPathsForTests,
} from '../cdk-operations.js';

// Nachbau der Phase-2-Struktur aus cdk/lib/workshop-stack.ts:
// Marker, Anleitung mit wörtlichem /* und */ im Text, Block-Kommentar
// um den Code, Grant-Zeile.
const SKELETON = `import * as cdk from 'aws-cdk-lib';

export class WorkshopStack extends cdk.Stack {
  constructor() {
    super();

    // ⚠️ TODO PHASE 2: MarkingStarterLambda
    // 📋 SCHRITTE:
    // 2. Entferne die Blockkommentare um den Code unten (lösche /* und */)
    // 3. Führe \`cdklocal deploy\` aus
    /*
    const markingStarterLambda = new nodejs.NodejsFunction(this, 'MarkingStarterLambda', {
      functionName: 'MarkingStarterLambda',
      entry: path.join(__dirname, '../../packages/marking-starter-lambda/src/interfaces/lambda-handler.ts'),
      handler: 'handler',
    });
    ltsWorkerQueue.grantSendMessages(markingStarterLambda);
    */

    // ========================================================================
    // Outputs
    // ========================================================================
  }
}
`;

describe('cdk-operations: Phase-2-Autofix-Zyklus', () => {
  let dir: string;
  let stackPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cdk-ops-test-'));
    stackPath = join(dir, 'workshop-stack.ts');
    await writeFile(stackPath, SKELETON, 'utf-8');
    overrideCdkPathsForTests({ stackPath, backupDir: join(dir, 'backup') });
  });

  afterEach(async () => {
    overrideCdkPathsForTests(null);
    await rm(dir, { recursive: true, force: true });
  });

  it('meldet den auskommentierten Block als STILL_COMMENTED', async () => {
    const errors = await validateCdkForPhase(2);
    expect(errors.map(e => e.type)).toEqual(['STILL_COMMENTED']);
    expect(errors[0].canAutoFix).toBe(true);
  });

  it('validiert nach dem Autofix sauber, obwohl die Anleitung /* und */ erwähnt', async () => {
    const result = await applyCdkChanges(2);
    expect(result.success).toBe(true);

    const errors = await validateCdkForPhase(2);
    expect(errors).toEqual([]);

    const status = await getCdkStatus(2);
    expect(status.status).toBe('active');
    expect(status.isReady).toBe(true);
  });

  it('meldet einen echten vergessenen Block-Marker weiterhin', async () => {
    await applyCdkChanges(2);
    const broken = SKELETON.replace('/*\n', '').replace('*/', ''); // von Hand halb entkommentiert
    await writeFile(stackPath, broken + '\n    /* vergessen', 'utf-8');

    const errors = await validateCdkForPhase(2);
    expect(errors.some(e => e.type === 'PARTIAL_UNCOMMENT')).toBe(true);
  });

  it('ist idempotent: zweiter Autofix meldet "bereits aktiv"', async () => {
    await applyCdkChanges(2);
    const second = await applyCdkChanges(2);
    expect(second.success).toBe(true);
    expect(second.message).toContain('bereits aktiv');
  });
});
