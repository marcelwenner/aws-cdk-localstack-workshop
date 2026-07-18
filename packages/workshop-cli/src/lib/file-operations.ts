/**
 * File Operations Utility
 *
 * Provides functions for reading and applying solution files
 * with backup/restore capability.
 *
 * Now also handles CDK stack changes (uncommenting Lambda definitions).
 */

import { readdir, stat, readFile, copyFile, mkdir, rm } from 'fs/promises';
import { join, dirname, relative } from 'path';
import { getProjectRoot, getBackupDir as getBackupDirBase, getSolutionsDir } from './paths.js';
import {
  applyCdkChanges,
  getCdkStatus,
  PHASE_LAMBDAS,
  type CdkError,
} from './cdk-operations.js';
import { PHASE_CONFIG } from '../shared/constants.js';

// Backup directory for original files before solution is applied
const getBackupDir = (phase: number) => join(getBackupDirBase(), `phase${phase}`);

// Special backup directory for break-it challenge
const getBreakItBackupDir = (phase: number) => join(getBackupDirBase(), `breakit-phase${phase}`);

export interface SolutionFile {
  path: string;        // Relative path (e.g., "interfaces/lambda-handler.ts")
  size: number;        // File size in bytes
  fullPath: string;    // Absolute path for reading
}

/**
 * List all files in a solution directory recursively
 */
export async function listSolutionFiles(phase: number): Promise<SolutionFile[]> {
  const solutionDir = join(getProjectRoot(), 'solutions', `phase${phase}`);
  const files: SolutionFile[] = [];

  // Check if solution directory exists
  try {
    await stat(solutionDir);
  } catch {
    throw new Error(`Solution directory not found: solutions/phase${phase}/`);
  }

  // Recursive walk function
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        // Only include TypeScript files
        const stats = await stat(fullPath);
        const relativePath = relative(solutionDir, fullPath);

        files.push({
          path: relativePath,
          size: stats.size,
          fullPath,
        });
      }
    }
  }

  await walk(solutionDir);
  return files;
}

/**
 * Read a solution file's content
 */
export async function readSolutionFile(phase: number, relativePath: string): Promise<string> {
  const solutionDir = join(getProjectRoot(), 'solutions', `phase${phase}`);
  const filePath = join(solutionDir, relativePath);

  try {
    const content = await readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    throw new Error(`Failed to read solution file: ${relativePath}`);
  }
}

export interface SolutionResult {
  lambdaFiles: string[];
  cdkChanged: boolean;
  cdkMessage?: string;
  cdkErrors: CdkError[];
}

/**
 * Apply solution files to the target package
 *
 * Creates a backup first, then:
 * 1. Copies all Lambda code files from solutions/phaseX/
 * 2. Applies CDK changes (uncomments Lambda definition)
 *
 * Returns a result object with details about what was changed.
 */
export async function applySolution(phase: number): Promise<SolutionResult> {
  const result: SolutionResult = {
    lambdaFiles: [],
    cdkChanged: false,
    cdkErrors: [],
  };

  const targetDir = getTargetPackageDir(phase);

  // List all solution files
  const files = await listSolutionFiles(phase);

  if (files.length === 0) {
    throw new Error(`No solution files found for Phase ${phase}`);
  }

  // Create backup of original files BEFORE overwriting
  await backupTargetFiles(phase);

  // Copy each file to target directory
  for (const file of files) {
    const sourcePath = file.fullPath;
    const targetPath = join(targetDir, file.path);

    // Ensure target directory exists
    await mkdir(dirname(targetPath), { recursive: true });

    // Copy file (overwrites if exists)
    await copyFile(sourcePath, targetPath);
    result.lambdaFiles.push(file.path);
  }

  // Apply CDK changes if needed for this phase
  if (PHASE_LAMBDAS[phase]) {
    const cdkStatus = await getCdkStatus(phase);

    if (cdkStatus.status === 'commented') {
      // Lambda is commented out - uncomment it
      const cdkResult = await applyCdkChanges(phase);
      result.cdkChanged = cdkResult.success;
      result.cdkMessage = cdkResult.message;
    } else if (cdkStatus.status === 'active') {
      // Lambda already active - check for errors
      result.cdkChanged = false;
      result.cdkMessage = `${cdkStatus.lambdaName} ist bereits im CDK Stack aktiv`;
    }

    // Get any CDK errors (missing grants, etc.)
    result.cdkErrors = cdkStatus.errors;
  }

  return result;
}

/**
 * Check if CDK changes are needed for a phase
 */
export async function needsCdkChanges(phase: number): Promise<{
  needed: boolean;
  lambdaName?: string;
  reason?: string;
}> {
  if (!PHASE_LAMBDAS[phase]) {
    return { needed: false };
  }

  const status = await getCdkStatus(phase);

  if (status.status === 'commented') {
    return {
      needed: true,
      lambdaName: status.lambdaName,
      reason: `${status.lambdaName} ist im CDK Stack auskommentiert`,
    };
  }

  if (status.status === 'missing') {
    return {
      needed: true,
      lambdaName: status.lambdaName,
      reason: `${status.lambdaName} fehlt im CDK Stack`,
    };
  }

  return { needed: false };
}

/**
 * Get target package directory for a phase
 * Uses central PHASE_CONFIG from shared/constants.ts
 */
export function getTargetPackageDir(phase: number): string {
  const config = PHASE_CONFIG[phase];
  if (!config?.packageDir) {
    throw new Error(`No package mapping for Phase ${phase}`);
  }

  return join(getProjectRoot(), config.packageDir);
}

/**
 * Check if solution exists for a phase
 */
export async function hasSolution(phase: number): Promise<boolean> {
  const solutionDir = join(getProjectRoot(), 'solutions', `phase${phase}`);

  try {
    await stat(solutionDir);
    const files = await listSolutionFiles(phase);
    return files.length > 0;
  } catch {
    return false;
  }
}

/**
 * Safely read target file content (returns empty string if not exists)
 * Used for diff comparison
 */
export async function readTargetFile(phase: number, relativePath: string): Promise<string> {
  const targetDir = getTargetPackageDir(phase);
  const filePath = join(targetDir, relativePath);

  try {
    const content = await readFile(filePath, 'utf-8');
    return content;
  } catch {
    // File doesn't exist yet (new file) - return empty string
    return '';
  }
}

/**
 * Backup target files before applying solution
 * Only backs up files that will be overwritten
 */
async function backupTargetFiles(phase: number): Promise<void> {
  const targetDir = getTargetPackageDir(phase);
  const backupDir = getBackupDir(phase);
  const solutionFiles = await listSolutionFiles(phase);

  // Create backup directory
  await mkdir(backupDir, { recursive: true });

  // Copy each target file that exists to backup
  for (const file of solutionFiles) {
    const targetPath = join(targetDir, file.path);
    const backupPath = join(backupDir, file.path);

    try {
      await stat(targetPath);
      // File exists, back it up
      await mkdir(dirname(backupPath), { recursive: true });
      await copyFile(targetPath, backupPath);
    } catch {
      // File doesn't exist yet - nothing to backup
    }
  }
}

/**
 * Restore original files from backup
 */
export async function restoreFromBackup(phase: number): Promise<void> {
  const targetDir = getTargetPackageDir(phase);
  const backupDir = getBackupDir(phase);

  // Check if backup exists
  try {
    await stat(backupDir);
  } catch {
    throw new Error(`Kein Backup für Phase ${phase} gefunden`);
  }

  // Get all backed up files
  const backupFiles: string[] = [];

  async function walkBackup(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkBackup(fullPath);
      } else if (entry.isFile()) {
        backupFiles.push(relative(backupDir, fullPath));
      }
    }
  }

  await walkBackup(backupDir);

  if (backupFiles.length === 0) {
    throw new Error(`Backup für Phase ${phase} ist leer`);
  }

  // Restore each file
  for (const relativePath of backupFiles) {
    const backupPath = join(backupDir, relativePath);
    const targetPath = join(targetDir, relativePath);

    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(backupPath, targetPath);
  }

  // Remove backup after successful restore
  await rm(backupDir, { recursive: true });
}

/**
 * Check if backup exists for a phase
 */
export async function hasBackup(phase: number): Promise<boolean> {
  const backupDir = getBackupDir(phase);

  try {
    const stats = await stat(backupDir);
    if (!stats.isDirectory()) return false;

    // Check if there are any files
    const entries = await readdir(backupDir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

/**
 * Create a backup before break-it challenge
 * Backs up the entire src directory of the target package
 */
export async function createBreakItBackup(phase: number): Promise<void> {
  // getTargetPackageDir already returns the src directory (e.g., packages/get-table-list-lambda/src)
  const srcDir = getTargetPackageDir(phase);
  const backupDir = getBreakItBackupDir(phase);

  // Remove old backup if exists
  try {
    await rm(backupDir, { recursive: true });
  } catch {
    // Ignore if doesn't exist
  }

  // Create backup directory
  await mkdir(backupDir, { recursive: true });

  // Recursively copy all files from src
  async function copyDir(src: string, dest: string) {
    const entries = await readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      if (entry.isDirectory()) {
        await mkdir(destPath, { recursive: true });
        await copyDir(srcPath, destPath);
      } else if (entry.isFile()) {
        await copyFile(srcPath, destPath);
      }
    }
  }

  await copyDir(srcDir, backupDir);
}

/**
 * Restore from break-it backup
 */
export async function restoreBreakItBackup(phase: number): Promise<void> {
  // getTargetPackageDir already returns the src directory (e.g., packages/get-table-list-lambda/src)
  const srcDir = getTargetPackageDir(phase);
  const backupDir = getBreakItBackupDir(phase);

  // Check if backup exists
  try {
    await stat(backupDir);
  } catch {
    throw new Error(`Kein Break-it Backup für Phase ${phase} gefunden`);
  }

  // Recursively copy all files from backup to src
  async function copyDir(src: string, dest: string) {
    const entries = await readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      if (entry.isDirectory()) {
        await mkdir(destPath, { recursive: true });
        await copyDir(srcPath, destPath);
      } else if (entry.isFile()) {
        await copyFile(srcPath, destPath);
      }
    }
  }

  await copyDir(backupDir, srcDir);

  // Remove backup after successful restore
  await rm(backupDir, { recursive: true });
}
