/**
 * Setup Queue - Resilient task queue for workshop setup
 *
 * Tasks that fail get re-queued to retry later.
 * This allows the setup to handle timing issues (e.g., Postgres not ready yet)
 * by continuing with other tasks and retrying failed ones.
 */

import { execa } from 'execa';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { Lambda } from '@aws-sdk/client-lambda';
import path from 'path';
import { createInterface } from 'readline';
import { workshopConfig } from '../config/workshop.config.js';

export type TaskResult = 'success' | 'retry' | 'fail';

export interface SetupTask {
  id: string;
  name: string;
  activeText: string;
  run: () => Promise<TaskResult>;
  retryCount: number;
  maxRetries: number;
  /** How many times this task has been pushed back after exhausting retries */
  roundCount: number;
  /** Max number of rounds before showing interactive guide */
  maxRounds: number;
  /** If true, this task blocks until complete (no other tasks run in parallel) */
  blocking?: boolean;
}

export class SetupQueue {
  private queue: SetupTask[] = [];
  private completed: string[] = [];
  private failed: string[] = [];
  private spinner: Ora | null = null;
  private lambda: Lambda;
  private cdkDir: string;
  private rootDir: string;

  constructor() {
    this.lambda = new Lambda({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });

    this.rootDir = path.resolve(process.cwd(), '..', '..');
    this.cdkDir = path.resolve(this.rootDir, 'cdk');
  }

  /**
   * Initialize the queue with all setup tasks
   */
  initializeTasks(): void {
    this.queue = [
      {
        id: 'docker-check',
        name: 'Docker Daemon',
        activeText: 'Prüfe Docker...',
        run: () => this.checkDocker(),
        retryCount: 0,
        maxRetries: 0,
        roundCount: 0,
        maxRounds: 1,
        blocking: true, // Docker must be running - no retry, just fail
      },
      {
        id: 'start-containers',
        name: 'Container starten',
        activeText: 'Starte Container...',
        run: () => this.startContainers(),
        retryCount: 0,
        maxRetries: 2,
        roundCount: 0,
        maxRounds: 2,
        blocking: true,
      },
      {
        id: 'localstack-ready',
        name: 'LocalStack',
        activeText: 'Warte auf LocalStack...',
        run: () => this.waitForLocalStack(),
        retryCount: 0,
        maxRetries: 5,
        roundCount: 0,
        maxRounds: 3, // Try 3 full rounds
      },
      {
        id: 'postgres-ready',
        name: 'PostgreSQL',
        activeText: 'Warte auf PostgreSQL...',
        run: () => this.waitForPostgres(),
        retryCount: 0,
        maxRetries: 5,
        roundCount: 0,
        maxRounds: 3,
      },
      {
        id: 'db-schema',
        name: 'Datenbank Schema',
        activeText: 'Initialisiere Schema...',
        run: () => this.initDatabaseSchema(),
        retryCount: 0,
        maxRetries: 3,
        roundCount: 0,
        maxRounds: 2,
        blocking: true,
      },
      // CDK Bootstrap, Deploy und Smoke Test wurden entfernt!
      // Der User führt cdklocal deploy SELBST aus in Phase 0 (CDK-Tutorial)
      // Das ist pädagogisch wichtig - User soll verstehen was passiert
    ];
  }

  /**
   * Process the queue until empty or fatal failure
   */
  async run(): Promise<boolean> {
    try {
      console.clear();
      this.showHeader();

      this.initializeTasks();

      while (this.queue.length > 0) {
      const task = this.queue.shift()!;

      this.showProgress(task);
      this.spinner = ora(task.activeText).start();

      try {
        const result = await task.run();

        if (result === 'success') {
          this.spinner.succeed(`${task.name} ✓`);
          this.completed.push(task.id);
        } else if (result === 'retry') {
          task.retryCount++;

          if (task.retryCount > task.maxRetries) {
            this.spinner.fail(`${task.name} - wird später erneut versucht`);

            // For blocking tasks, we must stop and show guide
            if (task.blocking) {
              const shouldContinue = await this.showInteractiveGuide(task);
              if (shouldContinue) {
                task.retryCount = 0;
                this.queue.unshift(task);
              } else {
                this.failed.push(task.id);
                return false;
              }
            } else {
              // Non-blocking: push to end for another round
              task.roundCount++;
              if (task.roundCount > task.maxRounds) {
                // Max rounds exceeded - try ONE more time, then show guide
                this.spinner.text = `${task.name} - letzter Versuch...`;
                await this.delay(2000);
                const lastTry = await task.run();
                if (lastTry === 'success') {
                  this.spinner.succeed(`${task.name} ✓`);
                  this.completed.push(task.id);
                } else {
                  // Final failure - show guide
                  this.spinner.fail(`${task.name} - Hilfe benötigt`);
                  const shouldContinue = await this.showInteractiveGuide(task);
                  if (shouldContinue) {
                    task.retryCount = 0;
                    task.roundCount = 0;
                    this.queue.unshift(task);
                  } else {
                    this.failed.push(task.id);
                    return false;
                  }
                }
              } else {
                task.retryCount = 0; // Reset for next round
                // If this is the only task left, wait before retrying
                if (this.queue.length === 0) {
                  console.log(chalk.dim(`\n   Warte 10s vor nächster Runde...`));
                  await this.delay(10000);
                }
                this.queue.push(task); // Push to end
              }
            }
          } else {
            this.spinner.warn(`${task.name} - Retry ${task.retryCount}/${task.maxRetries}`);
            this.queue.push(task);
          }
        } else {
          // Explicit fail - only blocking tasks stop immediately
          this.spinner.fail(`${task.name} - fehlgeschlagen`);

          if (task.blocking) {
            const shouldContinue = await this.showInteractiveGuide(task);
            if (shouldContinue) {
              task.retryCount = 0;
              this.queue.unshift(task);
            } else {
              this.failed.push(task.id);
              return false;
            }
          } else {
            this.failed.push(task.id);
          }
        }
      } catch (error) {
        this.spinner.fail(`${task.name} - Fehler`);
        if (error instanceof Error) {
          console.log(chalk.red(`   ${error.message}`));
        }

        task.retryCount++;
        if (task.retryCount <= task.maxRetries && !task.blocking) {
          this.queue.push(task);
        } else {
          this.failed.push(task.id);
          if (task.blocking) {
            this.showFailure(task);
            return false;
          }
        }
      }

      // Small delay between tasks
      await this.delay(200);
    }

    // Check if all critical tasks completed
    // Note: cdk-bootstrap, cdk-deploy, smoke-test removed - user does ALL CDK in Tutorial!
    const criticalTasks = ['docker-check', 'localstack-ready', 'db-schema'];
    const allCriticalDone = criticalTasks.every(id => this.completed.includes(id));

    if (allCriticalDone) {
      this.showSuccess();
      return true;
    } else {
      console.log(chalk.yellow('\n⚠️  Setup teilweise abgeschlossen'));
      console.log(chalk.dim('   Einige nicht-kritische Tasks sind fehlgeschlagen.'));
      return true; // Still allow continuing
    }
    } catch (error) {
      // Ensure spinner is stopped
      this.spinner?.stop();

      // Log error for debugging
      console.log(chalk.red('\n\n❌ Setup Wizard Fehler:'));
      if (error instanceof Error) {
        console.log(chalk.dim(`   ${error.message}`));
      }
      console.log(chalk.yellow('\n   Tipp: Versuche pnpm workshop:reset'));

      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Task Implementations
  // ─────────────────────────────────────────────────────────────────────────────

  private async checkDocker(): Promise<TaskResult> {
    try {
      await execa('docker', ['info'], { timeout: 5000 });
      return 'success';
    } catch {
      console.log('');
      console.log(chalk.red.bold('\n   Docker Desktop ist nicht gestartet!'));
      console.log('');
      console.log(chalk.white('   So startest du Docker:'));
      console.log(chalk.cyan('   1. Öffne Docker Desktop (Spotlight: ⌘+Space, "Docker")'));
      console.log(chalk.cyan('   2. Warte bis das Docker-Icon oben rechts grün wird'));
      console.log(chalk.cyan('   3. Starte den Workshop erneut'));
      console.log('');
      return 'fail';
    }
  }

  private async startContainers(): Promise<TaskResult> {
    // Check if already running
    try {
      const response = await fetch('http://localhost:4566/_localstack/health', {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        if (this.spinner) this.spinner.text = 'Container laufen bereits';
        return 'success';
      }
    } catch {
      // Not running, need to start
    }

    try {
      // First pull images (this can take a while on first run)
      if (this.spinner) this.spinner.text = 'Lade Docker Images...';

      const pullStart = Date.now();
      const pullingImages = new Set<string>();
      const pulledImages = new Set<string>();

      const pullProc = execa('docker', ['compose', '-f', 'local/docker-compose.yml', 'pull'], {
        cwd: this.rootDir,
        timeout: 600000, // 10 min for pulling images
      });

      // Show progress from pull output
      const updateSpinner = () => {
        if (!this.spinner) return;
        const elapsed = Math.floor((Date.now() - pullStart) / 1000);
        const pulling = [...pullingImages].filter(img => !pulledImages.has(img));
        if (pulling.length > 0) {
          this.spinner.text = `Lade ${pulling.join(', ')}... (${elapsed}s)`;
        } else if (pulledImages.size > 0) {
          this.spinner.text = `Images geladen (${elapsed}s)`;
        }
      };

      pullProc.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          // Format: " localstack Pulling" or " postgres Pulled"
          const pullMatch = line.match(/^\s*(\w+)\s+Pulling/);
          const pulledMatch = line.match(/^\s*(\w+)\s+Pulled/);
          if (pullMatch) {
            pullingImages.add(pullMatch[1]);
            updateSpinner();
          }
          if (pulledMatch) {
            pulledImages.add(pulledMatch[1]);
            updateSpinner();
          }
        }
      });

      await pullProc;

      // Now start containers and wait for them to be healthy
      if (this.spinner) this.spinner.text = 'Starte Container...';

      await execa('docker', ['compose', '-f', 'local/docker-compose.yml', 'up', '-d', '--wait'], {
        cwd: this.rootDir,
        timeout: 180000, // 3 min for startup + health checks
      });

      return 'success';
    } catch (error) {
      if (error instanceof Error && error.message.includes('port')) {
        console.log(chalk.yellow('\n   Port-Konflikt erkannt. Versuche Bereinigung...'));
        // Port conflict - the port-utils should handle this
        return 'retry';
      }
      return 'retry';
    }
  }

  private async waitForLocalStack(): Promise<TaskResult> {
    // Try 3 times with short intervals
    for (let i = 0; i < 3; i++) {
      try {
        const response = await fetch('http://localhost:4566/_localstack/health', {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          return 'success';
        }
      } catch {
        // Not ready
      }
      await this.delay(1000);
      this.spinner!.text = `Warte auf LocalStack... (${i + 1}/3)`;
    }
    return 'retry'; // Will be re-queued
  }

  private async waitForPostgres(): Promise<TaskResult> {
    const containerNames = ['workshop-postgres', 'local-postgres-1', 'postgres'];

    for (const name of containerNames) {
      try {
        await execa('docker', ['exec', name, 'pg_isready', '-U', 'postgres'], {
          timeout: 3000,
        });
        return 'success';
      } catch {
        // Try next name
      }
    }
    return 'retry'; // Will be re-queued
  }

  private async initDatabaseSchema(): Promise<TaskResult> {
    const sqlDir = path.resolve(this.rootDir, 'local', 'sql');

    try {
      // Check if schema already exists by trying to query a known table
      const checkResult = await execa('docker', [
        'exec', 'workshop-postgres',
        'psql', '-U', 'postgres', '-d', 'longtermstorage',
        '-c', "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'lts'",
        '-t', '-A'
      ], { timeout: 5000 });

      const schemaExists = checkResult.stdout.trim() === '1';

      if (schemaExists) {
        // Check if tables exist
        const tableCheck = await execa('docker', [
          'exec', 'workshop-postgres',
          'psql', '-U', 'postgres', '-d', 'longtermstorage',
          '-c', "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'lts'",
          '-t', '-A'
        ], { timeout: 5000 });

        const tableCount = parseInt(tableCheck.stdout.trim(), 10);
        if (tableCount >= 4) {
          // Schema and tables exist - check functions
          const funcCheck = await execa('docker', [
            'exec', 'workshop-postgres',
            'psql', '-U', 'postgres', '-d', 'longtermstorage',
            '-c', "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'lts'",
            '-t', '-A'
          ], { timeout: 5000 });

          const funcCount = parseInt(funcCheck.stdout.trim(), 10);
          if (funcCount >= 1) {
            if (this.spinner) {
              this.spinner.text = 'Schema bereits vorhanden';
            }
            return 'success';
          }
        }
      }

      // Need to initialize - run SQL scripts
      if (this.spinner) {
        this.spinner.text = 'Erstelle Schema...';
      }

      // Run init.sql
      await execa('docker', [
        'exec', '-i', 'workshop-postgres',
        'psql', '-U', 'postgres', '-d', 'longtermstorage',
        '-f', '/docker-entrypoint-initdb.d/01-init.sql'
      ], { timeout: 10000 });

      // Run table scripts
      if (this.spinner) {
        this.spinner.text = 'Erstelle Tabellen...';
      }
      const tableFiles = ['01_configure_tables.sql', '02_marking_tasks.sql', '03_deletion_tasks.sql', '04_audit_log.sql'];
      for (const file of tableFiles) {
        await execa('docker', [
          'exec', '-i', 'workshop-postgres',
          'psql', '-U', 'postgres', '-d', 'longtermstorage',
          '-f', `/docker-entrypoint-initdb.d/02-tables/${file}`
        ], { timeout: 10000 });
      }

      // Run function scripts
      if (this.spinner) {
        this.spinner.text = 'Erstelle Funktionen...';
      }
      const funcFiles = [
        '01_get_tables_to_process.sql',
        '02_start_table_marking.sql',
        '03_execute_next_marking_task.sql',
        '04_check_marking_progress.sql',
        '05_start_table_deletion.sql',
        '06_execute_next_deletion_task.sql'
      ];
      for (const file of funcFiles) {
        await execa('docker', [
          'exec', '-i', 'workshop-postgres',
          'psql', '-U', 'postgres', '-d', 'longtermstorage',
          '-f', `/docker-entrypoint-initdb.d/03-functions/${file}`
        ], { timeout: 10000 });
      }

      return 'success';
    } catch (error) {
      if (error instanceof Error) {
        console.log(chalk.dim(`\n   DB Schema: ${error.message.substring(0, 80)}`));
      }
      return 'retry';
    }
  }

  private async cdkBootstrap(): Promise<TaskResult> {
    try {
      await execa('npx', ['cdklocal', 'bootstrap'], {
        cwd: this.cdkDir,
        timeout: 120000,
        env: {
          ...process.env,
          CDK_DISABLE_LEGACY_EXPORT_WARNING: '1',
        },
      });
      return 'success';
    } catch (error) {
      if (error instanceof Error) {
        // Check for common issues
        if (error.message.includes('ECONNREFUSED')) {
          console.log(chalk.yellow('\n   LocalStack nicht erreichbar - warte...'));
          return 'retry';
        }
      }
      return 'retry';
    }
  }

  // cdkDeploy() und smokeTest() wurden entfernt!
  // Der User führt cdklocal deploy SELBST aus in Phase 0 (CDK-Tutorial)
  // Smoke Test passiert nach Phase 0 wenn User deployed hat

  // ─────────────────────────────────────────────────────────────────────────────
  // UI Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private showHeader(): void {
    console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║  Setup Wizard - Deine Cloud wird gebaut...            ║'));
    console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════════════╝\n'));
  }

  private showProgress(currentTask: SetupTask): void {
    const total = this.completed.length + this.queue.length + 1;
    const current = this.completed.length + 1;

    console.log(chalk.dim(`\n[${current}/${total}] ${currentTask.name}`));
  }

  private showSuccess(): void {
    console.log('');
    console.log(chalk.green.bold('╔═══════════════════════════════════════════════════════╗'));
    console.log(chalk.green.bold('║  ✅ Basis-Infrastruktur bereit!                       ║'));
    console.log(chalk.green.bold('╚═══════════════════════════════════════════════════════╝'));
    console.log('');
    console.log(chalk.white('   Docker:      ') + chalk.green('Running ✓'));
    console.log(chalk.white('   LocalStack:  ') + chalk.green('Running ✓'));
    console.log(chalk.white('   PostgreSQL:  ') + chalk.green('Ready ✓'));
    console.log('');
    console.log(chalk.cyan.bold('   📍 Nächster Schritt: CDK-Tutorial'));
    console.log(chalk.dim('      Du lernst CDK Bootstrap + Deploy selbst durchzuführen'));
    console.log('');
  }

  private showFailure(task: SetupTask): void {
    console.log('');
    console.log(chalk.red.bold('╔═══════════════════════════════════════════════════════╗'));
    console.log(chalk.red.bold('║  ❌ Setup konnte nicht abgeschlossen werden           ║'));
    console.log(chalk.red.bold('╚═══════════════════════════════════════════════════════╝'));
    console.log('');
    console.log(chalk.red(`   Fehlgeschlagen bei: ${task.name}`));
    console.log('');

    // Task-specific help
    this.showTaskHelp(task.id);

    console.log('');
    console.log(chalk.cyan('   Der Workshop wird das Setup beim nächsten Start erneut versuchen.'));
    console.log('');
    console.log(chalk.dim('   Drücke eine Taste um fortzufahren...'));
  }

  /**
   * Show interactive guide and wait for user to confirm they completed the fix
   * Returns true if user wants to retry, false if they want to abort
   */
  private async showInteractiveGuide(task: SetupTask): Promise<boolean> {
    console.log('');
    console.log(chalk.yellow.bold('┌─────────────────────────────────────────────────────────┐'));
    console.log(chalk.yellow.bold('│  📋 Anleitung zur Behebung                              │'));
    console.log(chalk.yellow.bold('└─────────────────────────────────────────────────────────┘'));
    console.log('');

    // Show task-specific guide
    this.showTaskGuide(task.id);

    console.log('');
    console.log(chalk.cyan('─────────────────────────────────────────────────────────────'));
    console.log('');
    console.log(chalk.white.bold('   Hast du die Schritte oben ausgeführt?'));
    console.log('');
    console.log(chalk.green('   [Enter]') + chalk.white(' Ja, erneut versuchen'));
    console.log(chalk.red('   [Q]    ') + chalk.white(' Abbrechen und Workshop beenden'));
    console.log('');

    return new Promise((resolve) => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      // Handle keypress
      process.stdin.setRawMode?.(true);
      process.stdin.resume();

      const onKeypress = (key: Buffer) => {
        const char = key.toString().toLowerCase();

        if (char === '\r' || char === '\n' || char === ' ') {
          // Enter/Space = retry
          cleanup();
          console.log(chalk.green('   ↻ Versuche erneut...\n'));
          resolve(true);
        } else if (char === 'q') {
          // Q = abort
          cleanup();
          console.log(chalk.red('   ✗ Abgebrochen\n'));
          resolve(false);
        } else if (char === '\x03') {
          // Ctrl+C = exit gracefully
          cleanup();
          console.log(chalk.gray('\n\nAbgebrochen.'));
          process.exit(0);
        }
        // Ignore other keys
      };

      const cleanup = () => {
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener('data', onKeypress);
        rl.close();
      };

      process.stdin.on('data', onKeypress);
    });
  }

  /**
   * Show task-specific guide with concrete steps
   */
  private showTaskGuide(taskId: string): void {
    switch (taskId) {
      case 'docker-check':
        console.log(chalk.white.bold('   Docker Desktop starten:'));
        console.log('');
        console.log(chalk.cyan('   1.') + chalk.white(' Öffne Docker Desktop'));
        console.log(chalk.dim('      → macOS: Spotlight (⌘+Space) → "Docker"'));
        console.log(chalk.dim('      → Windows: Start → "Docker Desktop"'));
        console.log('');
        console.log(chalk.cyan('   2.') + chalk.white(' Warte bis Docker bereit ist'));
        console.log(chalk.dim('      → Das Icon in der Menüleiste wird grün/stabil'));
        console.log(chalk.dim('      → "Docker Desktop is running" Meldung'));
        console.log('');
        console.log(chalk.cyan('   3.') + chalk.white(' Komm hierher zurück und drücke Enter'));
        break;

      case 'start-containers':
        console.log(chalk.white.bold('   Container können nicht gestartet werden:'));
        console.log('');
        console.log(chalk.cyan('   Mögliche Ursache:') + chalk.white(' Port bereits belegt'));
        console.log('');
        console.log(chalk.cyan('   Lösung 1:') + chalk.white(' Beende blockierende Prozesse'));
        console.log(chalk.dim('      → Der Workshop versucht das automatisch'));
        console.log(chalk.dim('      → Falls nicht: lsof -i :4566 und kill <PID>'));
        console.log('');
        console.log(chalk.cyan('   Lösung 2:') + chalk.white(' Alte Container entfernen'));
        console.log(chalk.dim('      → docker compose -f local/docker-compose.yml down -v'));
        console.log(chalk.dim('      → Dann Enter drücken'));
        break;

      case 'localstack-ready':
        console.log(chalk.white.bold('   LocalStack startet nicht:'));
        console.log('');
        console.log(chalk.cyan('   Prüfe Docker:'));
        console.log(chalk.dim('      → Ist Docker Desktop gestartet und grün?'));
        console.log('');
        console.log(chalk.cyan('   Prüfe Container:'));
        console.log(chalk.dim('      → docker ps (sollte localstack zeigen)'));
        console.log(chalk.dim('      → docker logs local-localstack-1'));
        console.log('');
        console.log(chalk.cyan('   Neustart versuchen:'));
        console.log(chalk.dim('      → docker compose -f local/docker-compose.yml restart localstack'));
        break;

      case 'postgres-ready':
        console.log(chalk.white.bold('   PostgreSQL ist nicht erreichbar:'));
        console.log('');
        console.log(chalk.cyan('   Prüfe Container:'));
        console.log(chalk.dim('      → docker ps (sollte postgres zeigen)'));
        console.log(chalk.dim('      → docker logs local-postgres-1'));
        console.log('');
        console.log(chalk.cyan('   Port-Konflikt prüfen:'));
        console.log(chalk.dim('      → lsof -i :5432'));
        console.log(chalk.dim('      → Falls belegt: anderen Postgres beenden'));
        console.log('');
        console.log(chalk.cyan('   Neustart:'));
        console.log(chalk.dim('      → docker compose -f local/docker-compose.yml restart postgres'));
        break;

      case 'db-schema':
        console.log(chalk.white.bold('   Datenbank-Schema fehlgeschlagen:'));
        console.log('');
        console.log(chalk.cyan('   Prüfe PostgreSQL:'));
        console.log(chalk.dim('      → docker exec workshop-postgres pg_isready -U postgres'));
        console.log(chalk.dim('      → Sollte "accepting connections" zeigen'));
        console.log('');
        console.log(chalk.cyan('   Schema manuell prüfen:'));
        console.log(chalk.dim('      → docker exec workshop-postgres psql -U postgres -d longtermstorage -c "\\dn"'));
        console.log(chalk.dim('      → Sollte "lts" Schema zeigen'));
        console.log('');
        console.log(chalk.cyan('   Kompletter Reset:'));
        console.log(chalk.dim('      → pnpm workshop:reset'));
        break;

      case 'cdk-bootstrap':
      case 'cdk-deploy':
        console.log(chalk.white.bold('   CDK Deployment fehlgeschlagen:'));
        console.log('');
        console.log(chalk.cyan('   Prüfe LocalStack:'));
        console.log(chalk.dim('      → curl http://localhost:4566/_localstack/health'));
        console.log(chalk.dim('      → Sollte {"services": ...} zurückgeben'));
        console.log('');
        console.log(chalk.cyan('   Falls LocalStack nicht läuft:'));
        console.log(chalk.dim('      → docker compose -f local/docker-compose.yml up -d'));
        console.log(chalk.dim('      → Warte 10 Sekunden'));
        console.log('');
        console.log(chalk.cyan('   Kompletter Reset:'));
        console.log(chalk.dim('      → pnpm workshop:reset'));
        break;

      case 'smoke-test':
        console.log(chalk.white.bold('   Lambda-Test fehlgeschlagen:'));
        console.log('');
        console.log(chalk.cyan('   Das bedeutet:'));
        console.log(chalk.dim('      → Der Stack wurde deployed'));
        console.log(chalk.dim('      → Aber die Lambda antwortet nicht korrekt'));
        console.log('');
        console.log(chalk.cyan('   Mögliche Lösung:'));
        console.log(chalk.dim('      → Warte 5 Sekunden und versuche erneut'));
        console.log(chalk.dim('      → LocalStack braucht manchmal einen Moment'));
        console.log('');
        console.log(chalk.cyan('   Falls es weiterhin fehlschlägt:'));
        console.log(chalk.dim('      → pnpm workshop:reset'));
        break;

      default:
        console.log(chalk.white.bold('   Allgemeine Tipps:'));
        console.log('');
        console.log(chalk.cyan('   1.') + chalk.white(' Stelle sicher dass Docker läuft'));
        console.log(chalk.cyan('   2.') + chalk.white(' Prüfe ob Ports 4566/5432 frei sind'));
        console.log(chalk.cyan('   3.') + chalk.white(' Führe pnpm workshop:reset aus'));
    }
  }

  private showTaskHelp(taskId: string): void {
    switch (taskId) {
      case 'docker-check':
        console.log(chalk.yellow('   💡 Docker Desktop muss laufen:'));
        console.log(chalk.white('      • Öffne Docker Desktop'));
        console.log(chalk.white('      • Warte bis das Icon grün ist'));
        console.log(chalk.white('      • Starte den Workshop erneut'));
        break;

      case 'start-containers':
      case 'localstack-ready':
        console.log(chalk.yellow('   💡 Container-Problem:'));
        console.log(chalk.white('      • Prüfe ob Port 4566 frei ist'));
        console.log(chalk.white('      • Führe aus: docker compose -f local/docker-compose.yml logs'));
        console.log(chalk.white('      • Oder: pnpm workshop:reset für Neustart'));
        break;

      case 'postgres-ready':
        console.log(chalk.yellow('   💡 PostgreSQL-Problem:'));
        console.log(chalk.white('      • Prüfe ob Port 5432 frei ist'));
        console.log(chalk.white('      • Führe aus: docker logs workshop-postgres'));
        console.log(chalk.white('      • Oder: pnpm workshop:reset für Neustart'));
        break;

      case 'db-schema':
        console.log(chalk.yellow('   💡 Datenbank-Schema Problem:'));
        console.log(chalk.white('      • Schema "lts" oder Tabellen fehlen'));
        console.log(chalk.white('      • SQL-Dateien in local/sql/ prüfen'));
        console.log(chalk.white('      • pnpm workshop:reset setzt alles zurück'));
        break;

      case 'cdk-bootstrap':
      case 'cdk-deploy':
        console.log(chalk.yellow('   💡 CDK-Problem:'));
        console.log(chalk.white('      • Stelle sicher dass LocalStack läuft'));
        console.log(chalk.white('      • Prüfe: curl http://localhost:4566/_localstack/health'));
        console.log(chalk.white('      • Oder: pnpm workshop:reset für Neustart'));
        break;

      case 'smoke-test':
        console.log(chalk.yellow('   💡 Lambda-Test fehlgeschlagen:'));
        console.log(chalk.white('      • Der Stack wurde deployed aber Lambda antwortet nicht'));
        console.log(chalk.white('      • Prüfe Lambda-Logs in LocalStack'));
        console.log(chalk.white('      • Oder: pnpm workshop:reset für Neustart'));
        break;

      default:
        console.log(chalk.yellow('   💡 Tipps:'));
        console.log(chalk.white('      • Stelle sicher dass Docker läuft'));
        console.log(chalk.white('      • Prüfe Ports 4566 und 5432'));
        console.log(chalk.white('      • Oder: pnpm workshop:reset für Neustart'));
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Simple keypress wait (for error screens)
   */
  private async waitForKeypress(): Promise<void> {
    return new Promise((resolve) => {
      console.log(chalk.dim('\n   Drücke eine Taste um fortzufahren...'));

      const cleanup = () => {
        try {
          process.stdin.setRawMode?.(false);
          process.stdin.removeListener('data', onData);
          process.stdin.pause();
        } catch {
          // Ignore cleanup errors
        }
        resolve();
      };

      const onData = () => cleanup();

      try {
        process.stdin.setRawMode?.(true);
        process.stdin.resume();
        process.stdin.once('data', onData);

        // Timeout after 30 seconds
        setTimeout(cleanup, 30000);
      } catch {
        resolve();
      }
    });
  }
}
