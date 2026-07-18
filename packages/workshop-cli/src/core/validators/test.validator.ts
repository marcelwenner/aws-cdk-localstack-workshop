/**
 * Test Validator
 *
 * Validates that unit tests exist, pass, and follow best practices:
 * - Use mocks (not real adapters)
 * - Assert on mock state (not just return values)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getProjectRoot } from '../../lib/paths.js';

const execAsync = promisify(exec);

export interface TestValidationResult {
  exists: boolean;
  passes: boolean;
  usesMocks: boolean;
  noRealAdapters: boolean;
  assertsMockState: boolean;
  errors: string[];
}

/**
 * Validate a unit test file
 *
 * Checks:
 * 1. Test file exists
 * 2. Test passes (pnpm test exits 0)
 * 3. Uses mocks (positive signal)
 * 4. No real adapters (negative signal)
 * 5. Asserts on mock state (side effects)
 */
export async function validateUnitTest(
  packagePath: string,
  testFileName: string
): Promise<TestValidationResult> {
  const result: TestValidationResult = {
    exists: false,
    passes: false,
    usesMocks: false,
    noRealAdapters: true,
    assertsMockState: false,
    errors: [],
  };

  // Build absolute path
  const projectRoot = getProjectRoot();
  const absolutePackagePath = path.isAbsolute(packagePath)
    ? packagePath
    : path.join(projectRoot, packagePath);

  const testFilePath = path.join(absolutePackagePath, 'src/__tests__', testFileName);

  // 1. Test existiert?
  try {
    await fs.access(testFilePath);
    result.exists = true;
  } catch {
    result.errors.push('Test-Datei nicht gefunden');
    return result;
  }

  // 2. Test-Inhalt analysieren
  const content = await fs.readFile(testFilePath, 'utf-8');

  // Positive Signale: Mock-Verwendung
  const mockPatterns = [
    /MockInfrastructure/,
    /createMock\w+/,
    /implements\s+DatabasePort/,
    /implements\s+QueuePort/,
    /vi\.fn\(\)/,
    /jest\.fn\(\)/,
  ];
  result.usesMocks = mockPatterns.some(p => p.test(content));

  // Negative Signale: Echte Adapter
  const realAdapterPatterns = [
    /new\s+PostgresAdapter/,
    /new\s+SqsAdapter/,
    /from\s+['"]aws-sdk['"]/,
    /from\s+['"]@aws-sdk/,
  ];
  result.noRealAdapters = !realAdapterPatterns.some(p => p.test(content));

  // Mock-State Assertions
  const stateAssertionPatterns = [
    /expect\([^)]*\.calls\)/,
    /expect\([^)]*\.sentMessages\)/,
    /expect\([^)]*\.processedRows\)/,
    /expect\([^)]*\.args\)/,
    /toHaveBeenCalledWith/,
    /toHaveBeenCalled\(\)/,
    /toHaveLength\(/,
  ];
  result.assertsMockState = stateAssertionPatterns.some(p => p.test(content));

  // 3. Test ausführen
  try {
    await execAsync('pnpm test', {
      cwd: absolutePackagePath,
      timeout: 30000,
    });
    result.passes = true;
  } catch (error: any) {
    result.passes = false;
    // Extract useful error message
    const stderr = error.stderr || error.message || 'Unknown error';
    const shortError = stderr.split('\n').slice(0, 3).join('\n');
    result.errors.push(`Tests fehlgeschlagen: ${shortError}`);
  }

  // Fehler sammeln
  if (!result.usesMocks) {
    result.errors.push('❌ Keine Mock-Verwendung gefunden (nutze createMock* oder vi.fn())');
  }
  if (!result.noRealAdapters) {
    result.errors.push('❌ Echte Adapter im Test! Nutze Mocks statt PostgresAdapter/SqsAdapter');
  }
  if (!result.assertsMockState) {
    result.errors.push('❌ Keine Mock-State Assertions (prüfe .calls, .args, toHaveLength etc.)');
  }

  return result;
}

/**
 * Check if all test criteria are met
 */
export function isTestValid(result: TestValidationResult): boolean {
  return (
    result.exists &&
    result.passes &&
    result.usesMocks &&
    result.noRealAdapters &&
    result.assertsMockState
  );
}
