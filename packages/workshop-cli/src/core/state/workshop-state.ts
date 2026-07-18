import { readFile, writeFile, mkdir, rename, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import lockfile from 'proper-lockfile';

export interface QuizAnswer {
  questionId: string;
  selectedAnswer: number;
  correct: boolean;
  timeSpent: number;  // seconds on this question
}

// =============================================================================
// Error Tracking Types
// =============================================================================

export interface ErrorEntry {
  count: number;
  lastSeen: string; // ISO timestamp
  phase: number;
}

export interface ErrorTracker {
  // Key: "phase-2:return-format" or "phase-3:timeout"
  [errorKey: string]: ErrorEntry;
}

// =============================================================================
// Phase Time Tracking Types
// =============================================================================

export interface PhaseTime {
  startedAt: string;      // ISO timestamp
  completedAt?: string;   // ISO timestamp when finished
  duration?: number;      // Seconds
}

export interface QuizResult {
  phase: number;
  score: number;         // Percentage (0-100)
  totalQuestions: number;
  correctAnswers: number;
  timeSpent: number;     // seconds
  completedAt: string;   // ISO timestamp
  answers: QuizAnswer[]; // For review
}

export interface WorkshopState {
  currentPhase: number;
  completedPhases: number[];
  completedQuizzes: number[];
  quizResults: QuizResult[];
  hintProgress: Record<number, number>;     // { phase: currentHintIndex }
  phasesWithAllHintsSeen: number[];         // Phases where all hints have been seen
  tourCompleted?: Record<number, boolean>;  // { phase: completed } - Interactive Code Tour
  startTime: string;
  lastCommand: string;
  activeAdapter?: 'postgres';
  // New: Error tracking for progressive hints
  errorHistory?: ErrorTracker;
  // New: Phase time tracking
  phaseTimes?: Record<number, PhaseTime>;
  // Break-it Challenge (Phase 1): Session-Nonce, die als RELEASE_ID in die
  // Lambda deployt wird - der Freischalt-Code steht NUR in den Logs
  breakItNonce?: string;
}

export class StateManager {
  private statePath = '.workshop-state/state.json';
  private runtimePath = '.workshop-state/runtime.json';
  private initialized = false;

  constructor() {
    // Clean up orphaned temp files on initialization
    this.cleanupTempFiles().catch(() => {
      // Ignore cleanup errors
    });
  }

  /**
   * Ensure the state directory and file exist
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    await mkdir(dirname(this.statePath), { recursive: true });

    if (!existsSync(this.statePath)) {
      await writeFile(this.statePath, JSON.stringify(this.getDefaultState(), null, 2), 'utf-8');
    }

    this.initialized = true;
  }

  /**
   * Atomic write using temp file + rename pattern
   * Prevents corruption from crashes or race conditions
   */
  private async atomicWriteJson(filePath: string, data: unknown): Promise<void> {
    const tempFile = `${filePath}.tmp.${Date.now()}.${process.pid}`;

    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });

    // Write to temp file
    await writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');

    // Atomic rename (POSIX guarantees atomicity)
    await rename(tempFile, filePath);
  }

  /**
   * Clean up orphaned temp files from crashed writes
   */
  private async cleanupTempFiles(): Promise<void> {
    try {
      const stateDir = dirname(this.statePath);

      if (!existsSync(stateDir)) {
        return;
      }

      const files = await readdir(stateDir);
      const tempFiles = files.filter(f => f.endsWith('.tmp') || f.includes('.tmp.'));

      for (const tempFile of tempFiles) {
        const fullPath = join(stateDir, tempFile);
        try {
          await unlink(fullPath);
        } catch {
          // Ignore errors (file might be in use)
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Atomic state update with file locking
   * Prevents race conditions from concurrent reads/writes
   */
  async updateState(updater: (prev: WorkshopState) => WorkshopState): Promise<void> {
    // Ensure state file exists before locking (proper-lockfile requires existing file)
    await this.ensureInitialized();

    const release = await lockfile.lock(this.statePath, {
      stale: 10000, // Consider lock stale after 10s
      retries: {
        retries: 5,
        minTimeout: 50,
        maxTimeout: 500,
      },
    });

    try {
      const current = await this.loadState();
      const next = updater(current);
      await this.saveState(next);
    } finally {
      await release();
    }
  }

  async getCurrentPhase(): Promise<number> {
    const state = await this.loadState();
    return state.currentPhase;
  }

  async markPhaseComplete(phase: number): Promise<void> {
    await this.updateState(state => {
      if (!state.completedPhases.includes(phase)) {
        state.completedPhases.push(phase);
      }
      state.currentPhase = phase + 1; // Auto-advance
      return state;
    });
  }

  async updateLastCommand(command: string): Promise<void> {
    await this.updateState(state => ({
      ...state,
      lastCommand: command,
    }));
  }

  async loadState(): Promise<WorkshopState> {
    try {
      await this.ensureInitialized();
      const content = await readFile(this.statePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return this.getDefaultState();
    }
  }

  async saveState(state: WorkshopState): Promise<void> {
    await this.atomicWriteJson(this.statePath, state);
  }

  async writeRuntimeState(state: { activeAdapter?: 'postgres' }): Promise<void> {
    await this.atomicWriteJson(this.runtimePath, state);
  }

  async loadRuntimeState(): Promise<{ activeAdapter?: 'postgres' }> {
    try {
      if (!existsSync(this.runtimePath)) {
        return {};
      }
      const content = await readFile(this.runtimePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private getDefaultState(): WorkshopState {
    return {
      currentPhase: 0, // Start with Phase 0: CDK Intro
      completedPhases: [],
      completedQuizzes: [],
      quizResults: [],
      hintProgress: {},
      phasesWithAllHintsSeen: [],
      startTime: new Date().toISOString(),
      lastCommand: '',
    };
  }

  async isQuizCompleted(phase: number): Promise<boolean> {
    const state = await this.loadState();
    return state.completedQuizzes?.includes(phase) ?? false;
  }

  async markQuizComplete(phase: number, result: QuizResult): Promise<void> {
    await this.updateState(state => {
      // Ensure arrays exist (for backward compatibility)
      if (!state.completedQuizzes) state.completedQuizzes = [];
      if (!state.quizResults) state.quizResults = [];

      // Remove old result for this phase if exists
      state.quizResults = state.quizResults.filter(r => r.phase !== phase);

      // Add new result
      state.quizResults.push(result);

      // Mark as completed
      if (!state.completedQuizzes.includes(phase)) {
        state.completedQuizzes.push(phase);
      }

      return state;
    });
  }

  async getQuizResult(phase: number): Promise<QuizResult | undefined> {
    const state = await this.loadState();
    return state.quizResults?.find(r => r.phase === phase);
  }

  // =====================
  // Hint Progress Methods
  // =====================

  /**
   * Save the current hint index for a phase
   */
  async saveHintProgress(phase: number, hintIndex: number): Promise<void> {
    await this.updateState(state => {
      if (!state.hintProgress) state.hintProgress = {};
      state.hintProgress[phase] = hintIndex;
      return state;
    });
  }

  /**
   * Get the current hint index for a phase (0 if not set)
   */
  async getHintProgress(phase: number): Promise<number> {
    const state = await this.loadState();
    return state.hintProgress?.[phase] ?? 0;
  }

  /**
   * Mark that all hints have been seen for a phase
   */
  async markAllHintsSeen(phase: number): Promise<void> {
    await this.updateState(state => {
      if (!state.phasesWithAllHintsSeen) state.phasesWithAllHintsSeen = [];
      if (!state.phasesWithAllHintsSeen.includes(phase)) {
        state.phasesWithAllHintsSeen.push(phase);
      }
      return state;
    });
  }

  /**
   * Check if all hints have been seen for a phase
   */
  async hasSeenAllHints(phase: number): Promise<boolean> {
    const state = await this.loadState();
    return state.phasesWithAllHintsSeen?.includes(phase) ?? false;
  }

  // =====================
  // Error Tracking Methods (Progressive Hints)
  // =====================

  /**
   * Generate error key for tracking
   */
  private getErrorKey(phase: number, errorType: string): string {
    return `phase-${phase}:${errorType}`;
  }

  /**
   * Increment error count and return the new count
   */
  async incrementError(phase: number, errorType: string): Promise<number> {
    const key = this.getErrorKey(phase, errorType);
    let newCount = 1;

    await this.updateState(state => {
      if (!state.errorHistory) state.errorHistory = {};

      const existing = state.errorHistory[key];
      if (existing) {
        existing.count++;
        existing.lastSeen = new Date().toISOString();
        newCount = existing.count;
      } else {
        state.errorHistory[key] = {
          count: 1,
          lastSeen: new Date().toISOString(),
          phase,
        };
      }
      return state;
    });

    return newCount;
  }

  /**
   * Get current error count
   */
  async getErrorCount(phase: number, errorType: string): Promise<number> {
    const state = await this.loadState();
    const key = this.getErrorKey(phase, errorType);
    return state.errorHistory?.[key]?.count ?? 0;
  }

  /**
   * Reset all errors for a specific phase
   */
  async resetErrorsForPhase(phase: number): Promise<void> {
    await this.updateState(state => {
      if (!state.errorHistory) return state;

      // Remove all keys that belong to this phase
      const prefix = `phase-${phase}:`;
      for (const key of Object.keys(state.errorHistory)) {
        if (key.startsWith(prefix)) {
          delete state.errorHistory[key];
        }
      }
      return state;
    });
  }

  // =====================
  // Phase Time Tracking Methods
  // =====================

  /**
   * Start timer for a phase
   */
  async startPhaseTimer(phase: number): Promise<void> {
    await this.updateState(state => {
      if (!state.phaseTimes) state.phaseTimes = {};

      // Only start if not already started
      if (!state.phaseTimes[phase]) {
        state.phaseTimes[phase] = {
          startedAt: new Date().toISOString(),
        };
      }
      return state;
    });
  }

  /**
   * Complete timer for a phase and calculate duration
   */
  async completePhaseTimer(phase: number): Promise<void> {
    await this.updateState(state => {
      if (!state.phaseTimes) state.phaseTimes = {};

      const phaseTime = state.phaseTimes[phase];
      if (phaseTime && !phaseTime.completedAt) {
        const now = new Date();
        const started = new Date(phaseTime.startedAt);
        phaseTime.completedAt = now.toISOString();
        phaseTime.duration = Math.floor((now.getTime() - started.getTime()) / 1000);
      }
      return state;
    });
  }

  /**
   * Get duration in seconds for a phase (null if not completed)
   */
  async getPhaseDuration(phase: number): Promise<number | null> {
    const state = await this.loadState();
    return state.phaseTimes?.[phase]?.duration ?? null;
  }

  /**
   * Get all phase times
   */
  async getAllPhaseTimes(): Promise<Record<number, PhaseTime>> {
    const state = await this.loadState();
    return state.phaseTimes ?? {};
  }

  /**
   * Get elapsed time for current phase (live calculation)
   */
  async getPhaseElapsedSeconds(phase: number): Promise<number> {
    const state = await this.loadState();
    const phaseTime = state.phaseTimes?.[phase];

    if (!phaseTime) return 0;
    if (phaseTime.duration !== undefined) return phaseTime.duration;

    // Calculate live elapsed time
    const started = new Date(phaseTime.startedAt);
    return Math.floor((Date.now() - started.getTime()) / 1000);
  }
}
