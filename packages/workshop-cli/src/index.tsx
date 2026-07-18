#!/usr/bin/env node
import React from 'react';
import { withFullScreen } from 'fullscreen-ink';
import { WorkshopApp } from './App.js';
import { checkAndFixPorts } from './lib/port-utils.js';
import { checkAndRunSetup } from './lib/setup-check.js';

/**
 * Main entry point for Workshop CLI
 *
 * Flow:
 * 1. Check if ports 4566/5432 are in use (before Ink)
 * 2. Run Setup Wizard if CDK not deployed (first-time users)
 * 3. Start fullscreen Ink app
 * 4. System check (Docker/LocalStack/Postgres) happens IN the Ink app
 *
 * Port check and Setup MUST happen before withFullScreen() because:
 * - inquirer/prompts need stdin control
 * - Ink also wants stdin control
 * - Running both causes input glitches
 *
 * System check is now done in Ink UI (SystemCheckScreen) for a cleaner UX.
 */
async function main() {
  // Check and optionally fix blocked ports before starting Ink
  const portsOk = await checkAndFixPorts();
  if (!portsOk) {
    process.exit(1);
  }

  // Run Setup Wizard if CDK not deployed (MUST be before Ink)
  const setupOk = await checkAndRunSetup();
  if (!setupOk) {
    process.exit(1);
  }

  // Start fullscreen Ink app
  // System check now happens inside the app (SystemCheckScreen)
  withFullScreen(<WorkshopApp />, {
    exitOnCtrlC: false, // We handle Ctrl+C manually for "Press again to exit"
  }).start();
}

main().catch((error) => {
  // Handle graceful exits (Ctrl+C during prompts)
  if (error instanceof Error && error.name === 'ExitPromptError') {
    process.exit(0);
  }
  console.error('Failed to start workshop:', error);
  process.exit(1);
});
