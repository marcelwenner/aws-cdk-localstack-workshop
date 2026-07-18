/**
 * Shared Constants
 *
 * Single source of truth for Lambda and Queue names.
 * Used by: CDK Stack, workshop.config.ts, Validators
 *
 * TypeScript will error if these names are misspelled anywhere!
 */

// =============================================================================
// Lambda Names
// =============================================================================

export const LAMBDA_NAMES = {
  GetTableList: 'GetTableListLambda',
  MarkingStarter: 'MarkingStarterLambda',
  LtsExecutor: 'LtsExecutorLambda',
  StatusPoller: 'StatusPollerLambda',
  DeletionStarter: 'DeletionStarterLambda',
  BackupExecutor: 'BackupExecutorLambda',
} as const;

/** Union type of all Lambda function names */
export type LambdaName = (typeof LAMBDA_NAMES)[keyof typeof LAMBDA_NAMES];

/** Keys for Lambda lookup (e.g., 'GetTableList', 'MarkingStarter') */
export type LambdaKey = keyof typeof LAMBDA_NAMES;

// =============================================================================
// Queue Names
// =============================================================================

export const QUEUE_NAMES = {
  ltsWorker: 'lts-worker-queue',
  statusCheck: 'status-check-queue',
  completion: 'completion-queue',
  ltsWorkerDLQ: 'lts-worker-queue-dlq',
  statusCheckDLQ: 'status-check-queue-dlq',
} as const;

/** Union type of all queue names */
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Keys for Queue lookup (e.g., 'ltsWorker', 'statusCheck') */
export type QueueKey = keyof typeof QUEUE_NAMES;

// =============================================================================
// Phase IDs
// =============================================================================

export const PHASE_IDS = {
  getTableList: 'get-table-list',
  markingStarter: 'marking-starter',
  ltsExecutor: 'lts-executor',
  statusPoller: 'status-poller',
} as const;

/** Strict Phase ID type */
export type PhaseId = (typeof PHASE_IDS)[keyof typeof PHASE_IDS];

// =============================================================================
// Mapping: PhaseId -> LambdaName
// =============================================================================

export const PHASE_TO_LAMBDA: Record<PhaseId, LambdaName> = {
  [PHASE_IDS.getTableList]: LAMBDA_NAMES.GetTableList,
  [PHASE_IDS.markingStarter]: LAMBDA_NAMES.MarkingStarter,
  [PHASE_IDS.ltsExecutor]: LAMBDA_NAMES.LtsExecutor,
  [PHASE_IDS.statusPoller]: LAMBDA_NAMES.StatusPoller,
};

// =============================================================================
// CENTRAL Phase Configuration
// Single source of truth for all phase-related mappings!
// =============================================================================

export interface PhaseConfig {
  /** Lambda that gets implemented in this phase */
  implementsLambda: LambdaName | null;
  /** Lambda for live logs in this phase */
  logLambda: LambdaName;
  /** Package directory (relative to project root) */
  packageDir: string | null;
  /** Solution directory exists for this phase */
  hasSolution: boolean;
  /** Lambdas required BEFORE entering this phase (prerequisites) */
  requiredLambdas: LambdaName[];
}

/**
 * CENTRAL PHASE CONFIGURATION
 *
 * This is THE source of truth for:
 * - Which Lambda is implemented in which phase
 * - Which Lambdas are required before starting a phase
 * - Which package directory to watch/deploy
 * - Which Lambda logs to show
 *
 * DO NOT duplicate this information elsewhere!
 */
export const PHASE_CONFIG: Record<number, PhaseConfig> = {
  0: {
    implementsLambda: null, // Intro - no Lambda
    logLambda: LAMBDA_NAMES.GetTableList,
    packageDir: null,
    hasSolution: false,
    requiredLambdas: [],
  },
  1: {
    implementsLambda: null, // Understanding existing Lambda
    logLambda: LAMBDA_NAMES.GetTableList,
    packageDir: 'packages/get-table-list-lambda/src',
    hasSolution: false,
    requiredLambdas: [LAMBDA_NAMES.GetTableList], // Pre-built, must exist
  },
  2: {
    implementsLambda: LAMBDA_NAMES.MarkingStarter,
    logLambda: LAMBDA_NAMES.MarkingStarter,
    packageDir: 'packages/marking-starter-lambda/src',
    hasSolution: true,
    requiredLambdas: [LAMBDA_NAMES.GetTableList], // Only need Phase 1 Lambda
  },
  3: {
    implementsLambda: LAMBDA_NAMES.LtsExecutor,
    logLambda: LAMBDA_NAMES.LtsExecutor,
    packageDir: 'packages/lts-executor-lambda/src',
    hasSolution: true,
    requiredLambdas: [LAMBDA_NAMES.GetTableList, LAMBDA_NAMES.MarkingStarter],
  },
  4: {
    implementsLambda: LAMBDA_NAMES.StatusPoller,
    logLambda: LAMBDA_NAMES.StatusPoller,
    packageDir: 'packages/status-poller-lambda/src',
    hasSolution: true,
    requiredLambdas: [LAMBDA_NAMES.GetTableList, LAMBDA_NAMES.MarkingStarter, LAMBDA_NAMES.LtsExecutor],
  },
  5: {
    implementsLambda: null, // E2E - no new Lambda
    logLambda: LAMBDA_NAMES.LtsExecutor,
    packageDir: null,
    hasSolution: false,
    requiredLambdas: [LAMBDA_NAMES.GetTableList, LAMBDA_NAMES.MarkingStarter, LAMBDA_NAMES.LtsExecutor, LAMBDA_NAMES.StatusPoller],
  },
  6: {
    implementsLambda: LAMBDA_NAMES.DeletionStarter,
    logLambda: LAMBDA_NAMES.GetTableList,
    packageDir: 'packages/deletion-starter-lambda/src',
    hasSolution: true,
    requiredLambdas: [LAMBDA_NAMES.GetTableList, LAMBDA_NAMES.MarkingStarter, LAMBDA_NAMES.LtsExecutor, LAMBDA_NAMES.StatusPoller],
  },
};

/**
 * Get the phase number that implements a specific Lambda
 * Returns null if Lambda is pre-built (GetTableList) or not found
 */
export function getPhaseForLambda(lambdaName: LambdaName): number | null {
  for (const [phase, config] of Object.entries(PHASE_CONFIG)) {
    if (config.implementsLambda === lambdaName) {
      return parseInt(phase);
    }
  }
  return null;
}

/**
 * Get all phases that have solutions available
 */
export function getPhasesWithSolutions(): number[] {
  return Object.entries(PHASE_CONFIG)
    .filter(([_, config]) => config.hasSolution)
    .map(([phase, _]) => parseInt(phase));
}
