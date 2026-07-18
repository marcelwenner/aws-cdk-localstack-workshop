/**
 * Setup Wizard
 *
 * Automates the infrastructure setup using a resilient task queue:
 * 1. Check Docker daemon
 * 2. Start containers (LocalStack, Postgres) if not running
 * 3. Wait for services to be ready
 * 4. Initialize database schema
 *
 * NOTE: CDK Bootstrap + Deploy are intentionally NOT included!
 * The user learns to run these commands themselves in the Phase 0 Tutorial.
 * This is pedagogically important - users should understand what CDK does.
 *
 * Failed tasks are re-queued and retried.
 * Users get interactive guides when manual intervention is needed.
 */

import { SetupQueue } from './setup-queue.js';

export class SetupWizard {
  private queue: SetupQueue;

  constructor() {
    this.queue = new SetupQueue();
  }

  /**
   * Run the setup wizard
   * @returns true if setup completed successfully
   */
  async run(): Promise<boolean> {
    return this.queue.run();
  }
}
