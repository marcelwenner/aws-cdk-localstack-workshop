/**
 * Validator Registry
 *
 * Static registry of all validators to avoid dynamic import issues with bundlers
 * Bundlers like tsup/esbuild can't handle dynamic imports with variables
 */

import Phase0Validator from './phase0.validator.js';
import Phase1Validator from './phase1.validator.js';
import Phase2Validator from './phase2.validator.js';
import Phase3Validator from './phase3.validator.js';
import Phase4Validator from './phase4.validator.js';
import Phase6Validator from './phase6.validator.js';
import { IInfrastructure } from '../infrastructure/infrastructure.interface.js';

export interface Validator {
  validate(): Promise<{ passed: boolean; hints?: string[] }>;
}

/**
 * Map of all validators
 * Explicitly registered so bundlers include them in the output
 */
const validatorMap: Record<number, new (infrastructure?: IInfrastructure) => Validator> = {
  0: Phase0Validator,
  1: Phase1Validator,
  2: Phase2Validator,
  3: Phase3Validator,
  4: Phase4Validator,
  6: Phase6Validator, // Die Abschlussprüfung (streng!)
};

/**
 * Get validator instance for a phase
 * Returns null if no validator exists (e.g., Phase 5/6 stretch goals)
 *
 * @param phase - Phase number
 * @param infrastructure - Optional infrastructure implementation (for testing)
 */
export function getValidator(phase: number, infrastructure?: IInfrastructure): Validator | null {
  const ValidatorClass = validatorMap[phase];

  if (!ValidatorClass) {
    return null;
  }

  return new ValidatorClass(infrastructure);
}

/**
 * Validate a phase
 * Convenience function that handles the full validation flow
 *
 * @param phase - Phase number
 * @param infrastructure - Optional infrastructure implementation (for testing)
 */
export async function validatePhase(
  phase: number,
  infrastructure?: IInfrastructure
): Promise<{ passed: boolean; hints?: string[] }> {
  const validator = getValidator(phase, infrastructure);

  if (!validator) {
    console.warn(`⚠️  No validator found for Phase ${phase} (might be a stretch goal)`);
    return { passed: true, hints: [] };
  }

  return validator.validate();
}
