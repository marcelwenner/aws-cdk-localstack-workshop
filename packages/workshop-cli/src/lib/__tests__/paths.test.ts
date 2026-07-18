import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join, isAbsolute } from 'path';

// Note: paths.ts uses import.meta.url which is resolved at module load time.
// We test the public API behavior rather than mocking the internals.

describe('paths', () => {
  // Dynamic import to avoid hoisting issues
  let paths: typeof import('../paths.js');

  beforeEach(async () => {
    paths = await import('../paths.js');
  });

  describe('getProjectRoot', () => {
    it('should return a string path', () => {
      const root = paths.getProjectRoot();
      expect(typeof root).toBe('string');
      expect(root.length).toBeGreaterThan(0);
    });

    it('should return an absolute path', () => {
      const root = paths.getProjectRoot();
      // Platform-agnostic: '/' on Unix, 'C:\' on Windows
      expect(isAbsolute(root)).toBe(true);
    });
  });

  describe('getPackagesDir', () => {
    it('should return path ending with packages', () => {
      const packagesDir = paths.getPackagesDir();
      expect(packagesDir.endsWith('packages')).toBe(true);
    });

    it('should be a child of project root', () => {
      const root = paths.getProjectRoot();
      const packagesDir = paths.getPackagesDir();
      expect(packagesDir).toBe(join(root, 'packages'));
    });
  });

  describe('getPackageDir', () => {
    it('should return correct path for workshop-cli', () => {
      const dir = paths.getPackageDir('workshop-cli');
      // join() uses the platform separator ('/' or '\')
      expect(dir.endsWith(join('packages', 'workshop-cli'))).toBe(true);
    });

    it('should return correct path for any package name', () => {
      const dir = paths.getPackageDir('some-package');
      expect(dir.endsWith(join('packages', 'some-package'))).toBe(true);
    });
  });

  describe('getSolutionsDir', () => {
    it('should return path ending with solutions', () => {
      const dir = paths.getSolutionsDir();
      expect(dir.endsWith('solutions')).toBe(true);
    });

    it('should be a child of project root', () => {
      const root = paths.getProjectRoot();
      const dir = paths.getSolutionsDir();
      expect(dir).toBe(join(root, 'solutions'));
    });
  });

  describe('getWorkshopStateDir', () => {
    it('should return path ending with .workshop-state', () => {
      const dir = paths.getWorkshopStateDir();
      expect(dir.endsWith('.workshop-state')).toBe(true);
    });

    it('should be a child of project root', () => {
      const root = paths.getProjectRoot();
      const dir = paths.getWorkshopStateDir();
      expect(dir).toBe(join(root, '.workshop-state'));
    });
  });

  describe('getSnapshotsDir', () => {
    it('should return path ending with snapshots', () => {
      const dir = paths.getSnapshotsDir();
      expect(dir.endsWith('snapshots')).toBe(true);
    });

    it('should be a child of workshop state dir', () => {
      const stateDir = paths.getWorkshopStateDir();
      const snapshotsDir = paths.getSnapshotsDir();
      expect(snapshotsDir).toBe(join(stateDir, 'snapshots'));
    });
  });

  describe('getBackupDir', () => {
    it('should return path ending with .workshop-backup', () => {
      const dir = paths.getBackupDir();
      expect(dir.endsWith('.workshop-backup')).toBe(true);
    });

    it('should be a child of project root', () => {
      const root = paths.getProjectRoot();
      const dir = paths.getBackupDir();
      expect(dir).toBe(join(root, '.workshop-backup'));
    });
  });

  describe('path consistency', () => {
    it('should return consistent paths on multiple calls', () => {
      const root1 = paths.getProjectRoot();
      const root2 = paths.getProjectRoot();
      expect(root1).toBe(root2);
    });

    it('should have valid path hierarchy', () => {
      const root = paths.getProjectRoot();
      const packages = paths.getPackagesDir();
      const state = paths.getWorkshopStateDir();
      const solutions = paths.getSolutionsDir();

      // All should start with root
      expect(packages.startsWith(root)).toBe(true);
      expect(state.startsWith(root)).toBe(true);
      expect(solutions.startsWith(root)).toBe(true);
    });
  });
});
