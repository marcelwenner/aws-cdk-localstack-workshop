/**
 * Centralized path utilities for the workshop CLI.
 */

import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Get the project root directory.
 *
 * Walks up from the current module until it finds the workspace marker
 * (pnpm-workspace.yaml). This works for the bundle (dist/index.js),
 * for tsx dev mode (src/lib/paths.ts) and for scripts alike, regardless
 * of the directory the CLI was started from (unlike process.cwd()).
 */
export function getProjectRoot(): string {
  // In ESM, we need to derive __dirname from import.meta.url
  const __dirname = dirname(fileURLToPath(import.meta.url));

  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Fallback: bundled layout dist -> workshop-cli -> packages -> project-root
  return join(__dirname, '..', '..', '..');
}

export function getPackagesDir(): string {
  return join(getProjectRoot(), 'packages');
}

export function getPackageDir(packageName: string): string {
  return join(getPackagesDir(), packageName);
}

export function getSolutionsDir(): string {
  return join(getProjectRoot(), 'solutions');
}

export function getWorkshopStateDir(): string {
  return join(getProjectRoot(), '.workshop-state');
}

export function getSnapshotsDir(): string {
  return join(getWorkshopStateDir(), 'snapshots');
}

export function getBackupDir(): string {
  return join(getProjectRoot(), '.workshop-backup');
}
