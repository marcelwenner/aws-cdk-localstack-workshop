/**
 * Cheat Sheet Data
 * Quick reference for workshop - practical info, not code tutorials
 */

export interface CheatSheetCategory {
  id: string;
  title: string;
  icon: string;
  snippets: CheatSheetSnippet[];
}

export interface CheatSheetSnippet {
  title: string;
  description?: string;
  code?: string;
  language?: string;
  tip?: string;
}

export const CHEAT_SHEET_DATA: CheatSheetCategory[] = [
  {
    id: 'shortcuts',
    title: 'Shortcuts',
    icon: '⌨️',
    snippets: [
      { title: '[t] Tutorial', description: 'Phase-Tutorial starten' },
      { title: '[h] Hints', description: 'Progressive Hilfe (3 Level)' },
      { title: '[l] Lösung', description: 'Solution Preview & Apply' },
      { title: '[L] Logs', description: 'Echtzeit Lambda-Logs' },
      { title: '[s] Status', description: 'System-Übersicht' },
      { title: '[?] Hilfe', description: 'Diese Übersicht' },
      { title: '[ESC] Zurück', description: 'Vorheriger Screen' },
      { title: '[q] Quit', description: 'Workshop beenden' },
    ],
  },
  {
    id: 'env',
    title: 'Environment',
    icon: '🔧',
    snippets: [
      {
        title: 'LocalStack',
        description: 'http://localhost:4566',
        tip: 'AWS_ENDPOINT_URL in allen Lambdas gesetzt',
      },
      {
        title: 'PostgreSQL',
        description: 'localhost:5432 | longtermstorage',
        tip: 'User: postgres, Pass: postgres | Schema: lts',
      },
      {
        title: 'SQS Queues',
        description: 'lts-worker-queue, status-check-queue, completion-queue',
        tip: '+ 2 DLQs: *-dlq für Fehler',
      },
      {
        title: 'Lambda Logs',
        description: '/aws/lambda/<function-name>',
        tip: '[L] öffnet Live-Viewer',
      },
    ],
  },
  {
    id: 'troubleshoot',
    title: 'Troubleshooting',
    icon: '🔥',
    snippets: [
      {
        title: 'Lambda 502/Timeout?',
        description: 'Code-Fehler → [L] für Logs checken',
        tip: 'Oft: Import-Fehler oder fehlende Deps',
      },
      {
        title: 'Lambda NOT_FOUND?',
        description: 'CDK nicht deployed → [s] Status prüfen',
        tip: 'Auto-Deploy läuft bei File-Save',
      },
      {
        title: 'DB Connection refused?',
        description: 'Docker läuft? → docker ps',
        tip: 'npm run docker:up startet Container',
      },
      {
        title: 'SQS Message nicht verarbeitet?',
        description: 'Check DLQ + Visibility Timeout',
        tip: 'Visibility > Lambda Timeout!',
      },
      {
        title: 'Änderungen nicht sichtbar?',
        description: 'Build läuft? Hot-Reload aktiv?',
        tip: 'Auto-Deploy Status in Sidebar',
      },
    ],
  },
  {
    id: 'commands',
    title: 'Befehle',
    icon: '💻',
    snippets: [
      {
        title: 'Workshop starten',
        code: 'npm run workshop',
      },
      {
        title: 'Was würde sich ändern? (das Ritual!)',
        code: 'cd cdk && cdklocal diff',
        tip: 'Immer VOR dem Deploy lesen',
      },
      {
        title: 'Generiertes CloudFormation ansehen',
        code: 'cd cdk && cdklocal synth',
        tip: 'Röntgenbild: Queues, Lambdas, IAM-Policies finden',
      },
      {
        title: 'Lambda manuell aufrufen',
        code: 'awslocal lambda invoke --function-name <Name> /dev/stdout',
      },
      {
        title: 'DLQ-Message ansehen (Phase 5!)',
        code: 'awslocal sqs receive-message --queue-url http://localhost:4566/000000000000/lts-worker-queue-dlq',
      },
      {
        title: 'Alles zurücksetzen',
        code: 'npm run workshop reset',
        tip: 'Löscht State + Docker Volumes',
      },
      {
        title: 'Docker neu starten',
        code: 'npm run docker:down && npm run docker:up',
      },
      {
        title: 'Manuell deployen',
        code: 'pnpm --filter cdk run deploy',
      },
      {
        title: 'Package builden',
        code: 'pnpm --filter <package> run build',
      },
    ],
  },
  {
    id: 'structure',
    title: 'Projektstruktur',
    icon: '📁',
    snippets: [
      {
        title: 'Lambda Code',
        description: 'packages/<lambda>/src/',
        tip: 'interfaces/ = Handler, application/ = Logic',
      },
      {
        title: 'CDK Stack',
        description: 'cdk/lib/workshop-stack.ts',
        tip: 'Hier werden Lambdas aktiviert',
      },
      {
        title: 'Lösungen',
        description: 'solutions/phaseX/',
        tip: '[l] zeigt Diff & kann anwenden',
      },
      {
        title: 'Backups',
        description: '.workshop-backup/',
        tip: 'Dein Code vor Lösung-Apply',
      },
    ],
  },
  {
    id: 'glossary',
    title: 'Glossar',
    icon: '📖',
    snippets: [
      { title: 'ARN', description: 'Amazon Resource Name - eindeutige ID für jede AWS-Ressource (arn:aws:service:region:account:resource)' },
      { title: 'Bootstrap', description: 'Einmaliges CDK-Setup pro Account+Region - legt S3-Bucket und Rollen für Assets (z.B. Lambda-ZIPs) an' },
      { title: 'CDK', description: 'Cloud Development Kit - Infrastructure as Code mit TypeScript statt JSON/YAML' },
      { title: 'Construct', description: 'Grundbaustein in CDK - jede Klasse mit new X(scope, id, props). App und Stack sind auch Constructs' },
      { title: 'Cold Start', description: 'Verzögerung beim ersten Lambda-Aufruf durch Container-Start und Code-Loading' },
      { title: 'CloudFormation', description: 'AWS-native IaC-Sprache (JSON/YAML) - CDK kompiliert zu CloudFormation' },
      { title: 'Correlation ID', description: 'Eindeutige ID die durch alle Services einer Request-Kette weitergegeben wird' },
      { title: 'DLQ', description: 'Dead Letter Queue - Auffangqueue für Messages die nach N Retries fehlschlagen' },
      { title: 'ESM', description: 'Event Source Mapping - AWS-Service der SQS pollt und Lambda mit Records[] aufruft' },
      { title: 'Fan-Out', description: 'Pattern: ein Event wird aufgefächert in viele parallele Messages/Tasks' },
      { title: 'IAM', description: 'Identity and Access Management - Wer darf was in AWS? Policies, Roles, Permissions' },
      { title: 'Idempotenz', description: 'Mehrfaches Ausführen liefert dasselbe Ergebnis - wichtig bei at-least-once Delivery' },
      { title: 'L1/L2/L3 Constructs', description: 'CDK Abstraktionslevel: L1=roh (Cfn*), L2=Defaults+IAM, L3=fertige Patterns' },
      { title: 'Least Privilege', description: 'Prinzip: nur minimale Berechtigungen vergeben (grant* statt addPolicy)' },
      { title: 'Poison Pill', description: 'Message die immer zum Crash führt - DLQ schützt davor' },
      { title: 'Polling', description: 'Regelmäßiges Abfragen eines Status statt auf Events zu warten' },
      { title: 'Self-Triggering', description: 'Lambda sendet sich selbst neue Work-Messages via SQS für kontinuierliche Verarbeitung' },
      { title: 'SQS', description: 'Simple Queue Service - managed Message Queue mit at-least-once Delivery und DLQ' },
      { title: 'Stack', description: 'Deployment-Einheit in CDK/CloudFormation - alles im Stack wird zusammen deployed' },
      { title: 'Thundering Herd', description: 'Viele Clients retrien gleichzeitig und überlasten das System - Exponential Backoff entzerrt' },
      { title: 'Token', description: 'CDK-Platzhalter für Werte, die erst beim Deploy existieren (z.B. queue.queueUrl) - wird im Template zum Verweis (Ref)' },
      { title: 'Visibility Timeout', description: 'Zeit in der eine SQS-Message unsichtbar ist während Lambda sie verarbeitet - mind. 6 × Lambda-Timeout' },
    ],
  },
];
