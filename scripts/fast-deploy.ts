#!/usr/bin/env tsx
/**
 * Fast Deploy Script
 *
 * Hot swap Lambda code without going through CloudFormation
 * 10x faster iteration (~5s vs ~60s)
 *
 * Usage: pnpm run fast-deploy <LambdaName>
 * Example: pnpm run fast-deploy LtsExecutorLambda
 */

import { Lambda } from '@aws-sdk/client-lambda';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import archiver from 'archiver';
import { createWriteStream } from 'fs';

interface FastDeployOptions {
  lambdaName: string;
  sourceDir: string;
  region?: string;
  endpoint?: string; // LocalStack endpoint
}

const PACKAGE_MAP: Record<string, string> = {
  'LtsExecutorLambda': 'packages/lts-executor-lambda',
  'MarkingStarterLambda': 'packages/marking-starter-lambda',
  'StatusPollerLambda': 'packages/status-poller-lambda',
  'GetTableListLambda': 'packages/get-table-list-lambda',
  'DeletionStarterLambda': 'packages/deletion-starter-lambda',
};

async function fastDeploy(options: FastDeployOptions): Promise<void> {
  const { lambdaName, sourceDir, region = 'eu-central-1', endpoint } = options;

  console.log(`🚀 Fast deploying ${lambdaName}...`);

  console.log('📦 Building TypeScript...');
  try {
    execSync('pnpm run build', { cwd: sourceDir, stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Build failed');
    process.exit(1);
  }

  const eligible = await isHotSwapEligible(sourceDir);
  if (!eligible) {
    console.log('⚠️  Infrastructure changes detected, falling back to CDK deploy');
    console.log('🔄 Running: pnpm run cdk:deploy');
    try {
      execSync('pnpm run cdk:deploy', { stdio: 'inherit', cwd: process.cwd() });
    } catch (error) {
      console.error('❌ CDK deploy failed');
      process.exit(1);
    }
    return;
  }

  console.log('📦 Zipping Lambda code...');
  const zipPath = await zipLambdaCode(sourceDir);

  console.log('🔄 Updating Lambda function...');
  const lambda = new Lambda({
    region,
    endpoint,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
    },
  });

  try {
    const zipBuffer = await readFile(zipPath);

    await lambda.updateFunctionCode({
      FunctionName: lambdaName,
      ZipFile: zipBuffer,
    });

    console.log('✅ Lambda updated successfully!');
    console.log(`⏱️  Deployment took ~5 seconds (vs ~60s for CDK)`);
  } catch (error) {
    console.error('❌ Failed to update Lambda:', error);
    process.exit(1);
  }
}

/**
 * Check if changes are eligible for hot swap
 * Returns false if any CDK infrastructure files changed
 */
async function isHotSwapEligible(sourceDir: string): Promise<boolean> {
  try {
    // Check git diff for infrastructure files
    const diff = execSync('git diff HEAD --name-only', {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    const changedFiles = diff.split('\n').filter(Boolean);

    // If any CDK files changed, not eligible
    const infraFiles = changedFiles.filter(f => f.includes('cdk/'));

    if (infraFiles.length > 0) {
      console.log('📋 Infrastructure files changed:');
      infraFiles.forEach(f => console.log(`  - ${f}`));
      return false;
    }

    return true;
  } catch {
    // If git diff fails, assume not eligible (safe default)
    console.log('⚠️  Could not check git diff, falling back to CDK deploy');
    return false;
  }
}

/**
 * Zip Lambda code from dist directory
 */
async function zipLambdaCode(sourceDir: string): Promise<string> {
  const distDir = join(sourceDir, 'dist');
  const zipPath = join(sourceDir, 'lambda.zip');

  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`📦 Created zip: ${archive.pointer()} bytes`);
      resolve(zipPath);
    });

    archive.on('error', reject);
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('⚠️  Warning:', err.message);
      } else {
        reject(err);
      }
    });

    archive.pipe(output);
    archive.directory(distDir, false);
    archive.finalize();
  });
}

async function main() {
  const lambdaName = process.argv[2];

  if (!lambdaName) {
    console.error('❌ Usage: pnpm run fast-deploy <lambda-name>');
    console.error('\nAvailable Lambda functions:');
    Object.keys(PACKAGE_MAP).forEach(name => {
      console.error(`  - ${name}`);
    });
    process.exit(1);
  }

  const sourceDir = PACKAGE_MAP[lambdaName];
  if (!sourceDir) {
    console.error(`❌ Unknown Lambda: ${lambdaName}`);
    console.error('\nAvailable Lambda functions:');
    Object.keys(PACKAGE_MAP).forEach(name => {
      console.error(`  - ${name}`);
    });
    process.exit(1);
  }

  await fastDeploy({
    lambdaName,
    sourceDir,
    endpoint: process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566',
  });
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Fast deploy failed:', error);
    process.exit(1);
  });
}
