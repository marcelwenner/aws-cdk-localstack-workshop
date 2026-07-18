/**
 * Port Utilities
 *
 * OS-agnostic port checking and killing for workshop setup.
 * Works on Windows, macOS, and Linux.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Check if workshop state exists AND has real progress (returning user vs fresh start)
const workshopStateFile = path.resolve(process.cwd(), '.workshop-state', 'state.json');

interface MinimalWorkshopState {
  currentPhase?: number;
  completedPhases?: number[];
}

function hasRealProgress(): boolean {
  try {
    if (!existsSync(workshopStateFile)) {
      return false;
    }
    // Check if state has actual progress (not just default state)
    const content = JSON.parse(require('fs').readFileSync(workshopStateFile, 'utf-8')) as MinimalWorkshopState;
    // Fresh start: phase 0 and no completed phases
    // Returning user: phase > 0 OR has completed phases
    return (content.currentPhase ?? 0) > 0 || (content.completedPhases?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Check if workshop containers are running
 */
async function workshopContainersRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('docker ps --format "{{.Names}}"');
    return stdout.includes('workshop-');
  } catch {
    return false;
  }
}

/**
 * Check if workshop stack is fully healthy
 * Invokes GetTableListLambda - if it returns 200, everything works:
 * - LocalStack running
 * - Lambda deployed
 * - Database reachable
 * - Schema exists
 */
async function isWorkshopStackHealthy(): Promise<boolean> {
  try {
    const { workshopConfig } = await import('../core/config/workshop.config.js');

    // Quick check if LocalStack is even responding
    const healthResponse = await fetch(`${workshopConfig.aws.endpoint}/_localstack/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!healthResponse.ok) return false;

    // Now check if Lambda works end-to-end
    const { Lambda } = await import('@aws-sdk/client-lambda');
    const lambda = new Lambda({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    const response = await lambda.invoke({
      FunctionName: workshopConfig.lambdas.GetTableList,
      InvocationType: 'RequestResponse',
    });

    const payload = JSON.parse(new TextDecoder().decode(response.Payload));
    return payload.statusCode === 200;
  } catch {
    return false;
  }
}

/**
 * Clean up orphaned Lambda containers from LocalStack
 * These are named like: workshop-localstack-lambda-gettablelistlambda-aa2f4516fcefac4ad40997506cffeaae
 */
async function cleanupLambdaContainers(): Promise<void> {
  try {
    const { stdout } = await execAsync('docker ps -a --filter "name=workshop-localstack-lambda" --format "{{.ID}}"');
    const containerIds = stdout.trim().split('\n').filter(Boolean);
    if (containerIds.length > 0) {
      await execAsync(`docker rm -f ${containerIds.join(' ')}`);
    }
  } catch {
    // Best effort - ignore errors
  }
}

/**
 * Tear down workshop containers and volumes (clean slate)
 */
async function teardownWorkshopContainers(): Promise<boolean> {
  const rootDir = path.resolve(process.cwd(), '..', '..');
  try {
    // First clean up orphaned Lambda containers
    await cleanupLambdaContainers();
    // Then tear down compose stack
    await execAsync('docker compose -f local/docker-compose.yml down -v', { cwd: rootDir });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a port is in use (OS-agnostic)
 */
export async function isPortInUse(port: number): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      // Windows: netstat
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      return stdout.trim().length > 0;
    } else {
      // macOS/Linux: lsof
      const { stdout } = await execAsync(`lsof -i:${port}`);
      return stdout.trim().length > 0;
    }
  } catch {
    // Command failed = port not in use (or command not found)
    return false;
  }
}

/**
 * Kill processes on a specific port (OS-agnostic)
 */
export async function killPort(port: number): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      // Windows: netstat + taskkill
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      const pidsKilled = new Set<string>();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && !pidsKilled.has(pid)) {
          try {
            await execAsync(`taskkill /F /PID ${pid}`);
            pidsKilled.add(pid);
          } catch {
            // Process might already be gone
          }
        }
      }
      return true;
    } else {
      // macOS/Linux: lsof + kill
      const { stdout } = await execAsync(`lsof -t -i:${port}`);
      if (stdout.trim()) {
        const pids = stdout.trim().split('\n').filter(Boolean);
        await execAsync(`kill -9 ${pids.join(' ')}`);
      }
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Check and fix ports before starting Ink
 * MUST be called BEFORE withFullScreen() to avoid stdin conflicts with inquirer
 */
export async function checkAndFixPorts(): Promise<boolean> {
  // Dynamic imports to avoid loading at module init
  const chalk = await import('chalk');

  const isFreshStart = !hasRealProgress();
  const containersRunning = await workshopContainersRunning();

  // If workshop containers are running, check if they're healthy
  if (containersRunning) {
    const isHealthy = await isWorkshopStackHealthy();

    if (isHealthy) {
      // Stack is running and healthy - leave it alone!
      // setup-check.ts will detect the deployed stack and skip setup
      console.log(chalk.default.green('\n✓ Workshop-Stack läuft bereits\n'));
      return true;
    }

    // Containers running but not healthy - only tear down if fresh start
    if (isFreshStart) {
      console.log(chalk.default.cyan('\n🧹 Container laufen aber sind nicht healthy - bereinige...\n'));

      const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let i = 0;
      const spinnerInterval = setInterval(() => {
        process.stdout.write(`\r${spinner[i++ % spinner.length]} Entferne alte Container...`);
      }, 80);

      const tornDown = await teardownWorkshopContainers();
      clearInterval(spinnerInterval);
      process.stdout.write('\r');

      if (tornDown) {
        console.log(chalk.default.green('✓ Alte Container entfernt'));
        console.log(chalk.default.dim('   Warte auf Port-Freigabe...'));
        await new Promise(r => setTimeout(r, 3000));
        console.log('');
      } else {
        console.log(chalk.default.yellow('⚠ Container-Bereinigung fehlgeschlagen\n'));
      }
    }
  }

  const inquirer = await import('inquirer');

  const portsToCheck = [
    { port: 4566, name: 'LocalStack' },
    { port: 5432, name: 'PostgreSQL' },
  ];

  for (const { port, name } of portsToCheck) {
    if (await isPortInUse(port)) {
      // For fresh starts, automatically fix ports without asking
      if (isFreshStart) {
        console.log(chalk.default.cyan(`\n🔧 Port ${port} (${name}) wird automatisch freigegeben...`));

        const killed = await killPort(port);
        if (killed) {
          console.log(chalk.default.green(`✓ Port ${port} freigegeben`));
          await new Promise(r => setTimeout(r, 500));
          continue; // Check next port
        } else {
          console.log(chalk.default.red(`✗ Konnte Port ${port} nicht freigeben`));
          console.log(chalk.default.gray('  Tipp: Beende andere Programme die den Port nutzen.'));
          return false;
        }
      }

      // For returning users, ask before fixing
      console.log(chalk.default.yellow(`\n⚠️  Port ${port} (${name}) ist belegt.`));

      let fix = false;
      try {
        const response = await inquirer.default.prompt([{
          type: 'confirm',
          name: 'fix',
          message: `Port ${port} freigeben?`,
          default: true,
        }]);
        fix = response.fix;
      } catch (error) {
        // User pressed Ctrl+C - exit gracefully
        if (error instanceof Error && error.name === 'ExitPromptError') {
          console.log(chalk.default.gray('\n\nAbgebrochen.'));
          process.exit(0);
        }
        throw error;
      }

      if (fix) {
        const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let i = 0;
        const spinnerInterval = setInterval(() => {
          process.stdout.write(`\r${spinner[i++ % spinner.length]} Killing port ${port}...`);
        }, 80);

        const killed = await killPort(port);
        clearInterval(spinnerInterval);
        process.stdout.write('\r');

        if (killed) {
          console.log(chalk.default.green(`✓ Port ${port} freigegeben`));
          // Short delay to ensure port is released
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          console.log(chalk.default.red(`✗ Konnte Port ${port} nicht freigeben`));
          console.log(chalk.default.gray('  Tipp: Versuche "docker compose down" oder beende andere Prozesse manuell.'));
          return false;
        }
      } else {
        console.log(chalk.default.gray('Abgebrochen.'));
        return false;
      }
    }
  }

  return true;
}
