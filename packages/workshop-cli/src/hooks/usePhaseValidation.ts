import { useState } from 'react';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getValidator } from '../core/validators/index.js';

const execAsync = promisify(exec);

export interface PhaseResult {
  passed: boolean;
  hints?: string[];
}

/**
 * Check if LocalStack is running and healthy
 */
async function checkLocalStack(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:4566/_localstack/health', {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if Postgres container is running
 */
async function checkPostgres(): Promise<boolean> {
  try {
    // Try multiple container name patterns (compose project name varies)
    const containerNames = ['local-postgres-1', 'workshop-postgres', 'postgres'];
    for (const name of containerNames) {
      try {
        await execAsync(`docker exec ${name} pg_isready -U postgres`);
        return true;
      } catch {
        continue;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function usePhaseValidation() {
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<PhaseResult | null>(null);

  const runValidation = async (phase: number): Promise<PhaseResult> => {
    setValidating(true);

    try {
      // Step 1: Check infrastructure FIRST
      const [localstackOk, postgresOk] = await Promise.all([
        checkLocalStack(),
        checkPostgres(),
      ]);

      if (!localstackOk || !postgresOk) {
        const hints: string[] = [];
        hints.push('Infrastruktur nicht bereit!');
        hints.push('');
        if (!localstackOk) {
          hints.push('❌ LocalStack nicht erreichbar');
        } else {
          hints.push('✓ LocalStack läuft');
        }
        if (!postgresOk) {
          hints.push('❌ PostgreSQL nicht erreichbar');
        } else {
          hints.push('✓ PostgreSQL läuft');
        }
        hints.push('');
        hints.push('Starte mit: docker compose -f local/docker-compose.yml up -d');

        const infraResult = { passed: false, hints };
        setResult(infraResult);
        return infraResult;
      }

      // Step 2: Get validator from static registry
      const validator = getValidator(phase);

      // No validator for this phase (e.g., Phase 5/6 stretch goals)
      if (!validator) {
        const fallbackResult = { passed: true, hints: [`Phase ${phase} has no validator (might be a stretch goal)`] };
        setResult(fallbackResult);
        return fallbackResult;
      }

      // Step 3: Run validation
      const validationResult = await validator.validate();
      setResult(validationResult);
      return validationResult;
    } catch (error) {
      // Validation error - return failure with error message
      const errorResult = {
        passed: false,
        hints: [
          'Validation error occurred',
          error instanceof Error ? error.message : String(error),
        ],
      };
      setResult(errorResult);
      return errorResult;
    } finally {
      setValidating(false);
    }
  };

  const clearResult = () => {
    setResult(null);
  };

  return {
    validating,
    result,
    runValidation,
    clearResult,
  };
}
