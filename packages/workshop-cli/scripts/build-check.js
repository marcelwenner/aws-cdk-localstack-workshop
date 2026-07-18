#!/usr/bin/env node
import { existsSync } from 'fs';
import { stat, readdir } from 'fs/promises';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '../dist/index.js');
const srcPath = join(__dirname, '../src');

/**
 * Recursively find the newest file mtime in a directory
 */
async function getNewestMtime(dir) {
  let newest = new Date(0);

  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      const subNewest = await getNewestMtime(fullPath);
      if (subNewest > newest) newest = subNewest;
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      const fileStat = await stat(fullPath);
      if (fileStat.mtime > newest) newest = fileStat.mtime;
    }
  }

  return newest;
}

async function needsBuild() {
  // If dist doesn't exist, we need to build
  if (!existsSync(distPath)) {
    return true;
  }

  try {
    const distStat = await stat(distPath);
    const newestSrcMtime = await getNewestMtime(srcPath);

    // If any src file is newer than dist, we need to rebuild
    return newestSrcMtime > distStat.mtime;
  } catch (error) {
    // If we can't stat, assume we need to build
    return true;
  }
}

async function main() {
  if (await needsBuild()) {
    console.log('🔧 Building workshop-cli...');
    try {
      execSync('pnpm run build', {
        stdio: 'inherit',
        cwd: join(__dirname, '..')
      });
      console.log('✅ Build complete!\n');
    } catch (error) {
      console.error('❌ Build failed!');
      process.exit(1);
    }
  }
}

main();
