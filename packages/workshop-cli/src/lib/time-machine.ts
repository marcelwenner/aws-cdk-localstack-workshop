/**
 * TimeMachine - File System Snapshots for Phase Reset
 *
 * Provides "Safety Net" backups for workshop phases:
 * - Automatically creates checkpoint when entering a phase (immutable)
 * - Saves "abandoned" code before hard reset
 * - Restores phase to clean starting state
 */

import archiver from 'archiver';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, rm, access } from 'fs/promises';
import unzipper from 'unzipper';
import { join } from 'path';
import { getProjectRoot, getSnapshotsDir, getPackagesDir } from './paths.js';

const SNAPSHOTS_REL_PATH = '.workshop-state/snapshots';

export class TimeMachine {
  private getSnapshotPath(phase: number, suffix = 'start'): string {
    return join(getSnapshotsDir(), `phase-${phase}-${suffix}.zip`);
  }

  /**
   * Ensure checkpoint exists for a phase (idempotent)
   * Called when entering PhaseScreen - Fire & Forget
   *
   * @returns true if new checkpoint was created, false if already existed
   */
  async ensureCheckpoint(phase: number): Promise<boolean> {
    const snapshotPath = this.getSnapshotPath(phase);

    // Already exists? Don't overwrite! (Immutable checkpoint)
    if (await this.exists(snapshotPath)) {
      return false;
    }

    await this.createSnapshot(snapshotPath);
    return true;
  }

  /**
   * Restore phase to clean state (Safety Net Pattern)
   *
   * 1. Save current "mess" as abandoned-TIMESTAMP.zip
   * 2. Hard reset: rm -rf packages/
   * 3. Restore from clean checkpoint
   *
   * @returns path to abandoned code zip
   */
  async restoreCheckpoint(phase: number): Promise<string> {
    const startSnapshot = this.getSnapshotPath(phase);
    const abandonedPath = this.getSnapshotPath(phase, `abandoned-${Date.now()}`);
    const packagesDir = getPackagesDir();

    // 1. Safety backup of current "mess"
    await this.createSnapshot(abandonedPath);

    // 2. Hard reset
    await rm(packagesDir, { recursive: true, force: true });

    // 3. Restore from clean snapshot
    await this.extractSnapshot(startSnapshot, getProjectRoot());

    return abandonedPath;
  }

  /**
   * Check if checkpoint exists for phase
   */
  async hasCheckpoint(phase: number): Promise<boolean> {
    return this.exists(this.getSnapshotPath(phase));
  }

  /**
   * Get relative path to snapshot for display
   */
  getRelativeSnapshotPath(phase: number, suffix = 'start'): string {
    return `${SNAPSHOTS_REL_PATH}/phase-${phase}-${suffix}.zip`;
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async createSnapshot(destPath: string): Promise<void> {
    // Ensure snapshots directory exists
    await mkdir(getSnapshotsDir(), { recursive: true });

    const packagesDir = getPackagesDir();

    return new Promise((resolve, reject) => {
      const output = createWriteStream(destPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', () => resolve());
      archive.on('error', reject);

      archive.pipe(output);
      archive.glob('**/*', {
        cwd: packagesDir,
        ignore: ['**/node_modules/**', '**/dist/**', '**/*.zip'],
      });
      archive.finalize();
    });
  }

  private async extractSnapshot(zipPath: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: join(destDir, 'packages') }))
        .on('close', () => resolve())
        .on('error', reject);
    });
  }
}
