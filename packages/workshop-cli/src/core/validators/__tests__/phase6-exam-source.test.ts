/**
 * Phase-6-Prüfung: L1-Quellenanalyse (checkExamSource)
 *
 * Die statische Ebene der Abschlussprüfung muss selbstgeschriebene
 * Constructs erkennen und die klassischen Schummel-/Fehlerwege abfangen.
 */
import { describe, it, expect } from 'vitest';
import { checkExamSource } from '../phase6.validator.js';

const VALID_BLOCK = `
    const deletionStarterLambda = new nodejs.NodejsFunction(this, 'DeletionStarterLambda', {
      functionName: 'DeletionStarterLambda',
      entry: path.join(__dirname, '../../packages/deletion-starter-lambda/src/interfaces/lambda-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: lambdaEnvironment,
    });
    ltsWorkerQueue.grantSendMessages(deletionStarterLambda);
`;

describe('checkExamSource (Prüfungs-Ebene L1)', () => {
  it('accepts a properly written construct with grant', () => {
    const result = checkExamSource(VALID_BLOCK);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('accepts any variable name as long as the grant targets it', () => {
    const renamed = VALID_BLOCK.replaceAll('deletionStarterLambda', 'meineLoeschLambda');
    expect(checkExamSource(renamed).ok).toBe(true);
  });

  it('rejects when the construct is missing entirely', () => {
    const result = checkExamSource('// leerer Stack');
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('DeletionStarterLambda');
  });

  it('rejects a construct that only exists inside a block comment', () => {
    const result = checkExamSource(`/*${VALID_BLOCK}*/`);
    expect(result.ok).toBe(false);
  });

  it('rejects a construct that only exists behind line comments', () => {
    const commented = VALID_BLOCK.split('\n').map(l => (l.trim() ? `    // ${l.trim()}` : l)).join('\n');
    expect(checkExamSource(commented).ok).toBe(false);
  });

  it('rejects a missing grant (least privilege is part of the exam)', () => {
    const noGrant = VALID_BLOCK.replace(/ltsWorkerQueue\.grantSendMessages\([^)]*\);/, '');
    const result = checkExamSource(noGrant);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('grantSendMessages');
  });

  it('rejects a grant on a different variable', () => {
    const wrongGrant = VALID_BLOCK.replace(
      'ltsWorkerQueue.grantSendMessages(deletionStarterLambda);',
      'ltsWorkerQueue.grantSendMessages(markingStarterLambda);'
    );
    expect(checkExamSource(wrongGrant).ok).toBe(false);
  });

  it('rejects hardcoded queue URLs (the token lesson)', () => {
    const hardcoded = VALID_BLOCK.replace(
      'environment: lambdaEnvironment,',
      "environment: { QUEUE_URL: 'http://localhost:4566/000000000000/lts-worker-queue' },"
    );
    const result = checkExamSource(hardcoded);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('Hartkodierte');
  });

  it('rejects hardcoded SQS ARNs', () => {
    const arn = VALID_BLOCK + "\n    const x = 'arn:aws:sqs:us-east-1:000000000000:lts-worker-queue';";
    expect(checkExamSource(arn).ok).toBe(false);
  });

  it('rejects a wrong entry path', () => {
    const wrongEntry = VALID_BLOCK.replace('deletion-starter-lambda', 'marking-starter-lambda');
    const result = checkExamSource(wrongEntry);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('entry');
  });
});
