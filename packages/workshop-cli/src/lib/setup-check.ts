/**
 * Setup Check - Runs Setup Wizard before Ink starts
 *
 * This MUST run before Ink because both use stdin control.
 * Running the wizard inside Ink components causes input glitches.
 *
 * NOTE: We only check if LocalStack is running, NOT if CDK is deployed!
 * The user deploys CDK themselves in the Tutorial (Phase 0).
 */

import chalk from 'chalk';
import { createInterface } from 'readline';
import { SetupWizard } from '../core/wizards/setup-wizard.js';

/**
 * Check if LocalStack is running (NOT if CDK is deployed!)
 * User deploys CDK themselves in Tutorial.
 */
async function isLocalStackRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:4566/_localstack/health', {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    // Connection refused or timeout - LocalStack not running
    return false;
  }
}

/**
 * Wait for Enter key press (simple readline-based, no raw mode needed)
 */
async function waitForEnter(message: string): Promise<void> {
  return new Promise((resolve) => {
    console.log('');
    console.log(chalk.green('❯ ') + chalk.cyan.bold(message) + chalk.dim(' (Enter)'));
    console.log('');

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Check if setup is needed and run wizard if so
 * Returns true if setup complete (or was already done)
 * Returns false if user aborted
 */
export async function checkAndRunSetup(): Promise<boolean> {
  // Quick check if LocalStack is running (NOT CDK deployed!)
  const running = await isLocalStackRunning();

  if (running) {
    // LocalStack running - no setup needed
    // User will deploy CDK themselves in Tutorial
    return true;
  }

  // LocalStack not running - show info and run wizard
  console.clear();
  console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║  Setup - Basis-Infrastruktur wird vorbereitet         ║'));
  console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════════════╝\n'));

  console.log(chalk.cyan.bold('🔧 Setup startet die Basis-Infrastruktur:'));
  console.log('');
  console.log(chalk.dim('  • Docker Container (LocalStack, Postgres)'));
  console.log(chalk.dim('  • Datenbank Schema'));
  console.log('');
  console.log(chalk.yellow('📚 Danach: CDK-Tutorial'));
  console.log(chalk.dim('  Du lernst CDK Bootstrap + Deploy selbst durchzuführen!'));

  // Wait for Enter
  await waitForEnter('Enter drücken zum Starten');

  // Run the wizard
  const wizard = new SetupWizard();
  const success = await wizard.run();

  if (!success) {
    // Wizard failed - let user try again or abort
    console.log('');
    console.log(chalk.red('Setup konnte nicht abgeschlossen werden.'));
    console.log(chalk.dim('Starte den Workshop erneut um es nochmal zu versuchen.'));
    console.log('');
    return false;
  }

  // Wait for user acknowledgment before starting Ink
  await waitForEnter('Enter drücken um fortzufahren');

  return true;
}
