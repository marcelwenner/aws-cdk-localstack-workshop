#!/usr/bin/env node

import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import chalk from 'chalk';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');
const workshopCliDir = resolve(__dirname, '..');

/**
 * Ask user a yes/no question
 */
async function askQuestion(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      // Empty = default yes, 'n' = no
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === '' || trimmed.startsWith('j') || trimmed.startsWith('y'));
    });
  });
}

/**
 * Reset Workshop Script
 *
 * Clears workshop progress AND resets infrastructure:
 * - Removes .workshop-state/ directory
 * - Optionally resets package code via git
 * - Resets LocalStack (deletes all resources)
 * - Clears database tables
 * - Redeploys CDK stack
 */
async function reset() {
  console.log(chalk.cyan('\n🔄 Workshop Reset\n'));

  // Ask about code reset
  const resetCode = await askQuestion(
    chalk.yellow('📦 Sollen die Lambda-Packages auf den Startzustand zurückgesetzt werden?\n') +
    chalk.dim('   (Deine Implementierungen werden überschrieben)\n') +
    chalk.white('   [J/n]: ')
  );

  console.log('');

  // 1. Remove workshop state (stored in packages/workshop-cli/.workshop-state/)
  const statePath = resolve(workshopCliDir, '.workshop-state');

  if (existsSync(statePath)) {
    await rm(statePath, { recursive: true, force: true });
    console.log(chalk.green('✓ Workshop State gelöscht'));
  } else {
    console.log(chalk.dim('  Workshop State existiert nicht'));
  }

  // 2. Reset package code if requested (EXCLUDES workshop-cli!)
  if (resetCode) {
    try {
      console.log(chalk.cyan('\n📦 Lambda-Packages werden zurückgesetzt...'));
      // Reset lambda packages AND CDK stack to their initial state
      // IMPORTANT: Exclude workshop-cli to preserve CLI development changes
      const packagesToReset = [
        'packages/contracts',
        'packages/database-adapter-postgres',
        'packages/get-table-list-lambda',
        'packages/lts-executor-lambda',
        'packages/marking-starter-lambda',
        'packages/queue-adapter-sqs',
        'packages/status-poller-lambda',
        'cdk/lib/workshop-stack.ts', // CDK stack mit TODO Blöcken
      ];
      await execAsync(`git checkout -- ${packagesToReset.join(' ')}`, { cwd: rootDir });
      console.log(chalk.green('✓ Lambda-Packages + CDK Stack auf Startzustand zurückgesetzt'));
      console.log(chalk.dim('  (workshop-cli wurde nicht zurückgesetzt)'));
    } catch (error) {
      console.log(chalk.yellow('⚠ Git reset fehlgeschlagen'));
      console.log(chalk.dim(`  ${error.message}`));
    }
  }

  // 3. Tear down Docker stack + volumes (Setup-Wizard will bring it back up)
  try {
    console.log(chalk.cyan('\n🐳 Docker Stack + Volumes werden gelöscht...'));
    await execAsync('docker compose -f local/docker-compose.yml down -v', { cwd: rootDir });
    console.log(chalk.green('✓ Docker Stack + Volumes gelöscht'));
  } catch (error) {
    console.log(chalk.yellow('⚠ Docker compose down fehlgeschlagen'));
    console.log(chalk.dim(`  ${error.message}`));
  }

  // 4. Clean up orphaned Lambda containers from LocalStack
  // These are named like: workshop-localstack-lambda-gettablelistlambda-aa2f4516fcefac4ad40997506cffeaae
  try {
    console.log(chalk.cyan('\n🧹 Entferne verwaiste Lambda-Container...'));
    const { stdout } = await execAsync('docker ps -a --filter "name=workshop-localstack-lambda" --format "{{.ID}}"');
    const containerIds = stdout.trim().split('\n').filter(Boolean);

    if (containerIds.length > 0) {
      await execAsync(`docker rm -f ${containerIds.join(' ')}`);
      console.log(chalk.green(`✓ ${containerIds.length} Lambda-Container entfernt`));
    } else {
      console.log(chalk.dim('  Keine verwaisten Lambda-Container gefunden'));
    }
  } catch (error) {
    // Not critical - container cleanup is best-effort
    if (!error.message.includes('No such container')) {
      console.log(chalk.dim(`  Lambda-Container Cleanup: ${error.message}`));
    }
  }

  console.log(chalk.green('\n✨ Workshop zurückgesetzt!\n'));
  console.log(chalk.cyan('Starte mit: pnpm workshop'));
  console.log(chalk.dim('(Der Setup-Wizard deployed den CDK Stack automatisch)\n'));
}

reset().catch((error) => {
  console.error(chalk.red('\n❌ Fehler beim Zurücksetzen:'), error.message);
  process.exit(1);
});
