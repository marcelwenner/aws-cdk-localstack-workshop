/**
 * CDK Assertions Tests (Phase 6b - Stretch Goal: "CDK Testing")
 *
 * Infrastruktur testet man wie Code! Template.fromStack() synthesized den
 * Stack zu CloudFormation - OHNE Deploy, OHNE AWS, OHNE LocalStack.
 * Du prüfst also: "Generiert mein CDK-Code die Infrastruktur, die ich meine?"
 *
 * Warum ist das mächtig?
 * - Fängt Fehler VOR dem Deploy (z.B. vergessene DLQ, falsches Timeout)
 * - Dokumentiert Architektur-Entscheidungen als ausführbare Regeln
 * - Läuft in Sekunden in der CI - kein Docker nötig
 *
 * Ausführen: cd cdk && pnpm test
 *
 * 📋 DEINE AUFGABE (Stretch):
 * Die it.skip(...)-Tests unten sind Übungen. Aktiviere sie (skip entfernen),
 * sobald du die jeweilige Phase abgeschlossen und die Lambda im Stack
 * aktiviert hast - und implementiere die Assertions.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { WorkshopStack } from '../lib/workshop-stack.js';

describe('WorkshopStack', () => {
  let template: Template;

  beforeAll(() => {
    // Synth dauert einige Sekunden (esbuild bundelt die Lambda-Handler)
    const app = new cdk.App();
    const stack = new WorkshopStack(app, 'TestStack');
    template = Template.fromStack(stack);
  }, 120000);

  // ==========================================================================
  // ✅ PRE-BUILT: Diese Tests sind fertig - lies sie als Beispiele!
  // ==========================================================================

  describe('SQS Queues (Pre-Built Infrastructure)', () => {
    it('creates worker queue with DLQ after 3 receives', () => {
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'lts-worker-queue',
        // Architektur-Regel: VisibilityTimeout >= 6 × Lambda-Timeout (Worker: 150s)!
        VisibilityTimeout: 900,
        RedrivePolicy: Match.objectLike({
          maxReceiveCount: 3,
        }),
      });
    });

    it('creates status check queue with more retries (polling darf öfter scheitern)', () => {
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'status-check-queue',
        RedrivePolicy: Match.objectLike({
          maxReceiveCount: 10,
        }),
      });
    });

    it('keeps DLQ messages for 14 days (Zeit zum Debuggen!)', () => {
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'lts-worker-queue-dlq',
        MessageRetentionPeriod: 14 * 24 * 60 * 60,
      });
    });
  });

  describe('GetTableListLambda (Referenz)', () => {
    it('exists with Node.js 20 runtime and DB config', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'GetTableListLambda',
        Runtime: 'nodejs20.x',
        Environment: {
          Variables: Match.objectLike({
            DB_HOST: Match.anyValue(),
            DB_NAME: Match.anyValue(),
            // Break-it Challenge: die CLI-Session-Nonce landet hier
            RELEASE_ID: Match.anyValue(),
          }),
        },
      });
    });
  });

  // ==========================================================================
  // ⚠️ DEINE ÜBUNGEN: Aktiviere nach der jeweiligen Phase!
  // ==========================================================================

  describe('Phase 2: MarkingStarterLambda', () => {
    // Entferne .skip sobald du Phase 2 abgeschlossen hast (Lambda im Stack aktiv)
    it.skip('exists and can send to worker queue', () => {
      // TODO [1]: Prüfe dass die Lambda existiert
      //   template.hasResourceProperties('AWS::Lambda::Function', {
      //     FunctionName: 'MarkingStarterLambda', ...
      //   });
      //
      // TODO [2]: Prüfe die IAM Policy die grantSendMessages() erzeugt hat!
      //   Tipp: template.hasResourceProperties('AWS::IAM::Policy', {
      //     PolicyDocument: Match.objectLike({
      //       Statement: Match.arrayWith([Match.objectLike({
      //         Action: Match.arrayWith(['sqs:SendMessage']), ...
      //       })]),
      //     }),
      //   });
      //   → Führe `cdklocal synth` aus und such die Policy im Output,
      //     dann weißt du wie sie aussieht!
      expect(true).toBe(false); // Ersetze durch echte Assertions
    });
  });

  describe('Phase 3: LtsExecutorLambda (Worker)', () => {
    it.skip('is triggered by the worker queue (Event Source Mapping)', () => {
      // TODO: Der Worker wird durch SQS getriggert. Im CloudFormation heißt
      //   das 'AWS::Lambda::EventSourceMapping' mit BatchSize: 1.
      //   Prüfe dass es existiert!
      expect(true).toBe(false); // Ersetze durch echte Assertions
    });

    it.skip('has a 150s timeout (6×-Regel: Queue-VisibilityTimeout ist 900s)', () => {
      // TODO: Timeout: 150 auf der LtsExecutorLambda prüfen
      expect(true).toBe(false); // Ersetze durch echte Assertions
    });
  });

  describe('Architektur-Regeln (Guardrails)', () => {
    it('every queue with redrive policy has maxReceiveCount >= 3', () => {
      // Beispiel für eine "Regel über ALLE Ressourcen":
      const queues = template.findResources('AWS::SQS::Queue');
      for (const [logicalId, queue] of Object.entries(queues)) {
        const redrive = queue.Properties?.RedrivePolicy;
        if (redrive) {
          expect(
            redrive.maxReceiveCount,
            `${logicalId} sollte mind. 3 Zustellversuche erlauben`
          ).toBeGreaterThanOrEqual(3);
        }
      }
    });
  });
});
