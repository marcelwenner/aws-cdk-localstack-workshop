/**
 * System Check - Ensures Docker/LocalStack are running
 *
 * Called on every workshop start (except first time / Phase 0)
 * to make sure the user can continue working.
 */

import { execa } from 'execa';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import { existsSync, readFileSync } from 'fs';

const rootDir = path.resolve(process.cwd(), '..', '..');
const stateFile = path.resolve(process.cwd(), '.workshop-state', 'state.json');

/**
 * Check if user has real progress (not first time / fresh start)
 * Returns true if user has moved past Phase 0 or completed any phase
 */
function hasRealProgress(): boolean {
  try {
    if (!existsSync(stateFile)) return false;
    const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    // Fresh start: phase 0 and no completed phases
    // Returning user: phase > 0 OR has completed phases
    return state.currentPhase > 0 || (state.completedPhases?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Ensure system is ready for workshop
 * Only runs if user has already completed Phase 0
 */
export async function ensureSystemReady(): Promise<boolean> {
  // Skip for first-time users - Setup Wizard will handle it
  if (!hasRealProgress()) {
    return true;
  }

  console.log(chalk.cyan('\n🔍 System-Check...\n'));

  // Step 1: Check Docker daemon
  const dockerSpinner = ora('Prüfe Docker...').start();
  try {
    await execa('docker', ['info'], { timeout: 5000 });
    dockerSpinner.succeed('Docker läuft');
  } catch {
    dockerSpinner.fail('Docker nicht gestartet');
    console.log(chalk.red('\n❌ Docker Desktop muss laufen!'));
    console.log(chalk.yellow('   Bitte starte Docker Desktop und versuche es erneut.\n'));
    return false;
  }

  // Step 2: Check LocalStack
  const localstackSpinner = ora('Prüfe LocalStack...').start();
  let localstackRunning = false;

  try {
    const response = await fetch('http://localhost:4566/_localstack/health', {
      signal: AbortSignal.timeout(2000),
    });
    localstackRunning = response.ok;
  } catch {
    localstackRunning = false;
  }

  if (localstackRunning) {
    localstackSpinner.succeed('LocalStack läuft');
  } else {
    localstackSpinner.text = 'Starte Container...';

    try {
      await execa('docker', ['compose', '-f', 'local/docker-compose.yml', 'up', '-d'], {
        cwd: rootDir,
        timeout: 120000,
      });

      // Wait for LocalStack
      localstackSpinner.text = 'Warte auf LocalStack...';
      for (let i = 0; i < 30; i++) {
        try {
          const response = await fetch('http://localhost:4566/_localstack/health', {
            signal: AbortSignal.timeout(2000),
          });
          if (response.ok) {
            localstackSpinner.succeed('LocalStack gestartet');
            localstackRunning = true;
            break;
          }
        } catch {
          // Not ready yet
        }
        await new Promise(r => setTimeout(r, 1000));
        localstackSpinner.text = `Warte auf LocalStack... (${i + 1}s)`;
      }

      if (!localstackRunning) {
        localstackSpinner.fail('LocalStack antwortet nicht');
        return false;
      }
    } catch (error) {
      localstackSpinner.fail('Container-Start fehlgeschlagen');
      if (error instanceof Error) {
        console.log(chalk.red(`   ${error.message}\n`));
      }
      return false;
    }
  }

  // Step 3: Check Postgres (quick check, non-blocking)
  const pgSpinner = ora('Prüfe Postgres...').start();
  const containerNames = ['workshop-postgres', 'local-postgres-1', 'postgres'];

  for (let i = 0; i < 5; i++) {
    for (const containerName of containerNames) {
      try {
        await execa('docker', ['exec', containerName, 'pg_isready', '-U', 'postgres'], {
          timeout: 3000,
        });
        pgSpinner.succeed('Postgres läuft');
        console.log(chalk.green('\n✅ System bereit!\n'));
        return true;
      } catch {
        // Try next container name
      }
    }
    if (i < 4) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  pgSpinner.warn('Postgres nicht erreichbar');
  console.log(chalk.yellow('\n⚠️  Postgres möglicherweise nicht bereit - fortfahren...\n'));
  return true; // Continue anyway
}
