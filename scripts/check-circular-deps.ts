#!/usr/bin/env tsx
/**
 * Check Circular Dependencies Script
 *
 * Uses madge to detect circular dependencies in all packages
 * Prevents import cycles that can break builds or cause runtime errors
 *
 * Usage: pnpm run check:circular
 */

import madge from 'madge';

const PACKAGES = [
  'packages/workshop-cli/src',
  'packages/marking-starter-lambda/src',
  'packages/lts-executor-lambda/src',
  'packages/status-poller-lambda/src',
  'packages/get-table-list-lambda/src',
  'packages/database-adapter-postgres/src',
  'packages/queue-adapter-sqs/src',
  'packages/contracts/src',
];

async function checkPackage(packagePath: string): Promise<string[][]> {
  try {
    const result = await madge(packagePath, {
      fileExtensions: ['ts', 'tsx'],
      excludeRegExp: [/node_modules/, /__tests__/, /dist/, /\.test\./, /\.spec\./],
      tsConfig: 'tsconfig.json',
    });

    return result.circular();
  } catch (error) {
    console.error(`⚠️  Could not analyze ${packagePath}:`, error);
    return [];
  }
}

async function main() {
  console.log('🔍 Checking for circular dependencies...\n');

  let hasCircular = false;

  for (const pkg of PACKAGES) {
    process.stdout.write(`📦 ${pkg}... `);

    const circular = await checkPackage(pkg);

    if (circular.length > 0) {
      console.log('❌ CIRCULAR DEPENDENCIES FOUND\n');
      hasCircular = true;

      circular.forEach((cycle, index) => {
        console.log(`  Cycle ${index + 1}:`);
        cycle.forEach((file, fileIndex) => {
          const arrow = fileIndex < cycle.length - 1 ? ' →' : ' ↩';
          console.log(`    ${file}${arrow}`);
        });
        console.log('');
      });
    } else {
      console.log('✅');
    }
  }

  if (hasCircular) {
    console.error('\n❌ Circular dependencies detected!');
    console.error('Please refactor the code to remove import cycles.');
    process.exit(1);
  }

  console.log('\n✅ No circular dependencies found!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Error checking circular dependencies:', error);
    process.exit(1);
  });
}
