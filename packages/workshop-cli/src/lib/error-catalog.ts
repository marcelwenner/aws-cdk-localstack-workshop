/**
 * Error Catalog for Progressive Hints
 *
 * Matches error patterns and provides progressively more detailed help:
 * - Level 1: Short hint (always shown)
 * - Level 2: More context (shown after 2nd occurrence)
 * - Level 3: Solution example (shown after 3rd occurrence)
 */

export interface SmartError {
  /** Unique identifier for this error type */
  id: string;
  /** Regex patterns to match against error message/details */
  patterns: RegExp[];
  /** Progressive hints for different attempt levels */
  hints: {
    level1: string; // Short hint (always)
    level2: string; // More details (2x)
    level3: string; // Solution example (3x)
  };
  /** Optional: Only match for specific phases */
  phases?: number[];
}

/**
 * Catalog of common errors with progressive hints
 */
export const ERROR_CATALOG: SmartError[] = [
  // =============================================================================
  // NOT_IMPLEMENTED Errors
  // =============================================================================
  {
    id: 'not-implemented',
    patterns: [/not.?implemented/i, /throw.*error.*not.?implemented/i],
    hints: {
      level1: 'Ersetze den NOT_IMPLEMENTED Placeholder',
      level2: 'Suche nach "throw new Error" und implementiere die Logik',
      level3: `Beispiel:
  // Statt: throw new Error('NOT_IMPLEMENTED')
  const result = await client.send(command);
  return { data: result };`,
    },
  },

  // =============================================================================
  // Return Format Errors
  // =============================================================================
  {
    id: 'return-format',
    patterns: [/response.*format/i, /schema.*mismatch/i, /expected.*object/i, /invalid.*return/i],
    hints: {
      level1: 'Das Return-Format stimmt nicht',
      level2: 'Erwartetes Format: { tables: Array<{name, schema, rowCount}> }',
      level3: `return {
  tables: rows.map(r => ({
    name: r.table_name,
    schema: r.table_schema,
    rowCount: r.row_count
  }))
};`,
    },
    phases: [1, 2],
  },

  // =============================================================================
  // TypeScript Type Errors
  // =============================================================================
  {
    id: 'ts-type-error',
    patterns: [/ts2345/i, /ts2322/i, /type.*not.*assignable/i],
    hints: {
      level1: 'TypeScript Typfehler - prüfe die Signatur',
      level2: 'Der Typ des Arguments passt nicht zum erwarteten Parameter',
      level3: `Mögliche Lösungen:
  1. Prüfe die Funktionssignatur
  2. Caste mit "as Type"
  3. Prüfe ob undefined erlaubt ist`,
    },
  },

  // =============================================================================
  // Property Does Not Exist
  // =============================================================================
  {
    id: 'property-missing',
    patterns: [/property.*does not exist/i, /ts2339/i],
    hints: {
      level1: 'Eigenschaft existiert nicht - Tippfehler?',
      level2: 'Prüfe den Objekttyp und die verfügbaren Eigenschaften',
      level3: `Mögliche Ursachen:
  1. Tippfehler im Property-Namen
  2. Falscher Objekttyp verwendet
  3. Property muss erst destructured werden`,
    },
  },

  // =============================================================================
  // Module Not Found
  // =============================================================================
  {
    id: 'module-not-found',
    patterns: [/cannot find module/i, /module not found/i, /cannot resolve/i],
    hints: {
      level1: 'Import fehlt oder Pfad falsch',
      level2: 'Prüfe den relativen Pfad und die Dateiendung (.js)',
      level3: `Checkliste:
  1. Relativer Pfad korrekt? (./lib/foo.js)
  2. Dateiendung .js bei ESM
  3. Package installiert?`,
    },
  },

  // =============================================================================
  // Connection Errors
  // =============================================================================
  {
    id: 'connection-refused',
    patterns: [/econnrefused/i, /connection refused/i, /socket hang up/i],
    hints: {
      level1: 'LocalStack/Postgres nicht gestartet?',
      level2: 'Prüfe ob Docker Container laufen',
      level3: `docker compose up -d
docker compose ps

Wenn Container neu gestartet wurden:
cdklocal deploy --all`,
    },
  },

  // =============================================================================
  // Async/Await Errors
  // =============================================================================
  {
    id: 'async-await',
    patterns: [/promise.*then/i, /await.*promise/i, /\[object promise\]/i],
    hints: {
      level1: 'Async/Await vergessen?',
      level2: 'Eine Promise wird nicht korrekt aufgelöst',
      level3: `Checkliste:
  1. Fehlt "await" vor dem async Call?
  2. Ist die Funktion als "async" markiert?
  3. Wird das Ergebnis korrekt zugewiesen?`,
    },
  },

  // =============================================================================
  // SQS Errors
  // =============================================================================
  {
    id: 'sqs-queue-not-found',
    patterns: [/queue.*not.*found/i, /queuedoesnotexist/i, /nonexistentqueue/i],
    hints: {
      level1: 'SQS Queue existiert nicht',
      level2: 'Die Queue-URL ist falsch oder Queue nicht deployed',
      level3: `Prüfe:
  1. cdklocal deploy ausgeführt?
  2. Queue-Name in Umgebungsvariablen korrekt?
  3. awslocal sqs list-queues`,
    },
    phases: [2, 3, 4],
  },

  // =============================================================================
  // Lambda Timeout
  // =============================================================================
  {
    id: 'timeout',
    patterns: [/timeout/i, /task timed out/i, /exceeded.*time/i],
    hints: {
      level1: 'Lambda Timeout - Prüfe lange Operationen',
      level2: 'Die Lambda-Ausführung dauert zu lange',
      level3: `Mögliche Ursachen:
  1. Endlosschleife
  2. Warten auf nie kommende Antwort
  3. Lambda Timeout zu kurz`,
    },
  },

  // =============================================================================
  // DynamoDB Errors
  // =============================================================================
  {
    id: 'dynamodb-error',
    patterns: [/resourcenotfound.*table/i, /table.*not.*exist/i, /dynamodb.*error/i],
    hints: {
      level1: 'DynamoDB Tabelle nicht gefunden',
      level2: 'Prüfe ob CDK Deploy die Tabelle erstellt hat',
      level3: `awslocal dynamodb list-tables
cdklocal deploy --all`,
    },
    phases: [5, 6],
  },

  // =============================================================================
  // Secrets Manager Errors
  // =============================================================================
  {
    id: 'secrets-error',
    patterns: [/secretsmanager/i, /secret.*not.*found/i, /resourcenotfound.*secret/i],
    hints: {
      level1: 'Secret nicht gefunden',
      level2: 'Das Secret existiert nicht in Secrets Manager',
      level3: `Prüfe:
  awslocal secretsmanager list-secrets

  Oder erstelle es:
  awslocal secretsmanager create-secret --name MySecret --secret-string "..."`,
    },
    phases: [3, 4, 5],
  },

  // =============================================================================
  // JSON Parse Errors
  // =============================================================================
  {
    id: 'json-parse',
    patterns: [/json.*parse/i, /unexpected token/i, /syntaxerror.*json/i],
    hints: {
      level1: 'JSON Parse Fehler - ungültiges Format',
      level2: 'Die Eingabe ist kein gültiges JSON',
      level3: `Häufige Ursachen:
  1. Doppelte Anführungszeichen statt einfache
  2. Trailing comma
  3. Leere Antwort`,
    },
  },

  // =============================================================================
  // Environment Variable Missing
  // =============================================================================
  {
    id: 'env-missing',
    patterns: [/environment.*undefined/i, /env.*not.*set/i, /missing.*env/i],
    hints: {
      level1: 'Umgebungsvariable fehlt',
      level2: 'Eine benötigte Env-Variable ist nicht gesetzt',
      level3: `Prüfe in cdk/lib/workshop-stack.ts:
  environment: {
    QUEUE_URL: queue.queueUrl,
    TABLE_NAME: table.tableName,
  }`,
    },
  },
];

/**
 * Find matching error from catalog
 */
export function findMatchingError(
  error: string,
  details: string | null,
  phase?: number
): SmartError | null {
  const combinedText = `${error}\n${details || ''}`.toLowerCase();

  for (const smartError of ERROR_CATALOG) {
    // Check phase restriction
    if (smartError.phases && phase && !smartError.phases.includes(phase)) {
      continue;
    }

    // Check if any pattern matches
    const matches = smartError.patterns.some(pattern =>
      pattern.test(combinedText)
    );

    if (matches) {
      return smartError;
    }
  }

  return null;
}

/**
 * Get progressive hint based on error count
 */
export function getProgressiveHint(
  error: string,
  details: string | null,
  errorCount: number,
  phase?: number
): { id: string; hint: string; level: 1 | 2 | 3 } | null {
  const match = findMatchingError(error, details, phase);
  if (!match) return null;

  const { id, hints } = match;

  if (errorCount >= 3) {
    return {
      id,
      hint: `${hints.level1}\n\n📖 ${hints.level2}\n\n🔧 ${hints.level3}`,
      level: 3,
    };
  }

  if (errorCount >= 2) {
    return {
      id,
      hint: `${hints.level1}\n\n📖 ${hints.level2}`,
      level: 2,
    };
  }

  return {
    id,
    hint: hints.level1,
    level: 1,
  };
}

export default ERROR_CATALOG;
