/**
 * Deploy Utility
 *
 * Handles Lambda deployment via CDK.
 * Always uses full CDK deploy for correct dependency bundling.
 */

import { join } from 'path';
import { execa, ExecaError } from 'execa';

/**
 * Result of a pipeline step
 */
export interface StepResult {
  success: boolean;
  duration: number;
  error?: string;
  details?: string;
}

// Import and re-export getProjectRoot from central paths module
import { getProjectRoot } from './paths.js';
export { getProjectRoot };

/**
 * Map Lambda function names to their package directories
 */
const LAMBDA_TO_PACKAGE: Record<string, string> = {
  'LtsExecutorLambda': 'lts-executor-lambda',
  'MarkingStarterLambda': 'marking-starter-lambda',
  'StatusPollerLambda': 'status-poller-lambda',
  'GetTableListLambda': 'get-table-list-lambda',
  'DeletionStarterLambda': 'deletion-starter-lambda',
};

/**
 * Map package directories to Lambda function names
 */
const PACKAGE_TO_LAMBDA: Record<string, string> = {
  'lts-executor-lambda': 'LtsExecutorLambda',
  'marking-starter-lambda': 'MarkingStarterLambda',
  'status-poller-lambda': 'StatusPollerLambda',
  'get-table-list-lambda': 'GetTableListLambda',
  'deletion-starter-lambda': 'DeletionStarterLambda',
};

/**
 * Extract package name from file path
 * @example 'packages/marking-starter-lambda/src/handler.ts' -> 'marking-starter-lambda'
 */
export function extractPackageFromPath(filePath: string): string | null {
  const match = filePath.match(/packages\/([^/]+)/);
  return match?.[1] ?? null;
}

/**
 * Get Lambda name from file path
 */
export function getLambdaFromPath(filePath: string): string | null {
  const packageName = extractPackageFromPath(filePath);
  if (!packageName) return null;
  return PACKAGE_TO_LAMBDA[packageName] ?? null;
}

// NOTE: Hot-swap deploy was removed because CDK NodejsFunction bundles dependencies
// differently than our tsup build. Always use runCdkDeploy() for consistency.

/**
 * Run full CDK deploy (creates all infrastructure)
 * First builds all lambdas, then runs cdklocal deploy
 */
export async function runCdkDeploy(): Promise<StepResult> {
  const start = Date.now();
  const projectRoot = getProjectRoot();
  const cdkDir = join(projectRoot, 'cdk');

  try {
    // Step 1: Build all lambda packages first
    await execa('pnpm', ['run', 'build'], {
      cwd: projectRoot,
      timeout: 60000, // 1 minute for builds
    });

    // Step 2: Run cdklocal deploy
    await execa('npx', ['cdklocal', 'deploy', '--require-approval', 'never'], {
      cwd: cdkDir,
      timeout: 120000, // 2 minutes for CDK deploy
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: 'test',
        AWS_SECRET_ACCESS_KEY: 'test',
        AWS_DEFAULT_REGION: 'us-east-1',
      },
    });

    return {
      success: true,
      duration: Date.now() - start,
    };
  } catch (error) {
    const execaError = error as ExecaError;
    const stderr = typeof execaError.stderr === 'string' ? execaError.stderr : '';
    return {
      success: false,
      duration: Date.now() - start,
      error: 'CDK Deploy failed',
      details: stderr || execaError.message,
    };
  }
}

/**
 * Check if a path is a CDK file
 */
export function isCdkPath(filePath: string): boolean {
  return filePath.includes('/cdk/') && filePath.endsWith('.ts');
}

/**
 * Full pipeline: Build -> Zip -> Deploy
 * Returns step-by-step results
 */
export interface PipelineResult {
  success: boolean;
  totalDuration: number;
  steps: {
    build: StepResult;
    zip?: StepResult;
    deploy?: StepResult;
  };
  lambdaName: string;
}

export async function runPipeline(
  packageName: string,
  onStep?: (step: 'build' | 'zip' | 'deploy', status: 'running' | 'success' | 'error') => void
): Promise<PipelineResult> {
  const start = Date.now();
  const lambdaName = PACKAGE_TO_LAMBDA[packageName];

  if (!lambdaName) {
    return {
      success: false,
      totalDuration: 0,
      steps: {
        build: {
          success: false,
          duration: 0,
          error: `Unknown package: ${packageName}`,
        },
      },
      lambdaName: packageName,
    };
  }

  // Use CDK deploy for correct bundling (includes all dependencies)
  // CDK NodejsFunction handles TypeScript compilation and dependency bundling
  // We animate the steps sequentially for better UX, even though CDK does it all at once

  // Step 1: Build (show as running while CDK works)
  onStep?.('build', 'running');

  const cdkResult = await runCdkDeploy();

  if (cdkResult.success) {
    // Animate through steps on success
    onStep?.('build', 'success');
    onStep?.('zip', 'running');
    await new Promise(resolve => setTimeout(resolve, 150)); // Brief pause for animation
    onStep?.('zip', 'success');
    onStep?.('deploy', 'running');
    await new Promise(resolve => setTimeout(resolve, 150));
    onStep?.('deploy', 'success');
  } else {
    // On error, mark all as error
    onStep?.('build', 'error');
    onStep?.('zip', 'error');
    onStep?.('deploy', 'error');
  }

  return {
    success: cdkResult.success,
    totalDuration: Date.now() - start,
    steps: {
      build: cdkResult,
      zip: cdkResult,
      deploy: cdkResult,
    },
    lambdaName,
  };
}
