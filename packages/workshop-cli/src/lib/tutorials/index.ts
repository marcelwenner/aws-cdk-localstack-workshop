import { phase0Tutorial } from './phase0.tutorial.js';
import { phase1Tutorial } from './phase1.tutorial.js';
import { phase2Tutorial } from './phase2.tutorial.js';
import { phase3Tutorial } from './phase3.tutorial.js';
import { phase4Tutorial } from './phase4.tutorial.js';
import { phase5Tutorial } from './phase5.tutorial.js';
import { PhaseTutorial } from './tutorial.types.js';

export const tutorials: Record<number, PhaseTutorial> = {
  0: phase0Tutorial,
  1: phase1Tutorial,
  2: phase2Tutorial,
  3: phase3Tutorial,
  4: phase4Tutorial,
  5: phase5Tutorial,
};

export function getTutorial(phase: number): PhaseTutorial | undefined {
  return tutorials[phase];
}

export * from './tutorial.types.js';
