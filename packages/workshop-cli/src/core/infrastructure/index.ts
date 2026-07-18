/**
 * Infrastructure Module Exports
 *
 * Provides easy access to infrastructure operations for the workshop CLI.
 */

import { AwsInfrastructurePort } from './aws-infrastructure.port.js';
import type { LambdaName } from '../../shared/constants.js';

// Singleton instance for simple usage
let infrastructureInstance: AwsInfrastructurePort | null = null;

function getInfrastructure(): AwsInfrastructurePort {
  if (!infrastructureInstance) {
    infrastructureInstance = new AwsInfrastructurePort();
  }
  return infrastructureInstance;
}

/**
 * Check if a Lambda function exists in LocalStack
 */
export async function checkLambdaExists(name: string): Promise<boolean> {
  const infra = getInfrastructure();
  return infra.lambdaExists(name as LambdaName);
}

/**
 * Get Lambda environment variables
 */
export async function getLambdaEnv(name: string): Promise<Record<string, string>> {
  const infra = getInfrastructure();
  return infra.getLambdaEnv(name as LambdaName);
}

// Re-export types and classes
export { AwsInfrastructurePort } from './aws-infrastructure.port.js';
export { MockInfrastructurePort } from './mock-infrastructure.port.js';
export type { InfrastructurePort, LambdaInvocationResult, LambdaErrorType } from './infrastructure.port.js';
