/**
 * useReactiveLoop - HMR für Serverless
 *
 * Automatischer Build → Deploy → Test bei File-Änderungen
 * "Magic" ohne Tastendruck
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { appendFileSync } from 'fs';
import { tmpdir } from 'os';
import { join as joinPath } from 'path';
import chokidar from 'chokidar';
import debounce from 'lodash.debounce';
import {
  runPipeline,
  getLambdaFromPath,
  extractPackageFromPath,
  getProjectRoot,
  runCdkDeploy,
  isCdkPath,
} from '../lib/fast-deploy.js';
import { getValidator } from '../core/validators/index.js';
import { workshopConfig } from '../core/config/workshop.config.js';

/**
 * Pipeline step status
 */
export type StepStatus = 'pending' | 'running' | 'success' | 'error';

export interface PipelineStep {
  id: 'build' | 'zip' | 'deploy' | 'test';
  label: string;
  status: StepStatus;
  duration?: number;
  error?: string;
  progress?: number; // 0-100 for animated progress bar
}

/**
 * Error type determines the color
 */
export type ErrorType = 'infra' | 'build' | 'test' | null;

/**
 * Reactive loop state
 */
export interface ReactiveLoopState {
  status: 'idle' | 'detected' | 'running' | 'success' | 'error';
  steps: PipelineStep[];
  lambdaName: string | null;
  packageName: string | null;
  changedFile: string | null;  // Which file triggered the deploy
  error: string | null;
  errorType: ErrorType;
  errorDetails: string | null;
  totalDuration: number | null;
  minimized: boolean;
  pendingRestart: boolean;
}

export interface UseReactiveLoopOptions {
  watchPaths: readonly string[];
  phase: number;
  enabled?: boolean;
  debounceMs?: number;
}

export interface UseReactiveLoopReturn extends ReactiveLoopState {
  watching: boolean;
  reset: () => void;
  dismiss: () => void;
  /** Get progress for a specific step (0-100) */
  getStepProgress: (stepId: PipelineStep['id']) => number;
}

const initialSteps: PipelineStep[] = [
  { id: 'build', label: 'Build', status: 'pending' },
  { id: 'zip', label: 'Zip', status: 'pending' },
  { id: 'deploy', label: 'Deploy', status: 'pending' },
  { id: 'test', label: 'Test', status: 'pending' },
];

// Retry configuration for infrastructure errors
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

/**
 * Check if an error is a retryable infrastructure error
 */
function isInfraError(error?: string): boolean {
  if (!error) return false;
  const infraPatterns = [
    'ECONNREFUSED',
    'Service Unavailable',
    'ETIMEDOUT',
    'ENOTFOUND',
    'socket hang up',
    'Connection refused',
    'LocalStack',
    'unable to connect',
  ];
  return infraPatterns.some(pattern =>
    error.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Hook für automatisches Build → Deploy → Test bei File-Änderungen
 */
export function useReactiveLoop({
  watchPaths,
  phase,
  enabled = true,
  debounceMs = 800,
}: UseReactiveLoopOptions): UseReactiveLoopReturn {
  const [watching, setWatching] = useState(false);
  const [state, setState] = useState<ReactiveLoopState>({
    status: 'idle',
    steps: initialSteps,
    lambdaName: null,
    packageName: null,
    changedFile: null,
    error: null,
    errorType: null,
    errorDetails: null,
    totalDuration: null,
    minimized: false,
    pendingRestart: false,
  });

  const isRunningRef = useRef(false);
  const minimizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const handleFileChangeRef = useRef<(path: string) => void>(() => {});

  /**
   * Clear all progress animation intervals
   */
  const clearProgressIntervals = useCallback(() => {
    progressIntervalsRef.current.forEach(interval => clearInterval(interval));
    progressIntervalsRef.current.clear();
  }, []);

  /**
   * Start pseudo-progress animation for a step
   * Progress approaches 80% asymptotically, then jumps to 100% when completed
   */
  const startStepProgress = useCallback((stepId: PipelineStep['id']) => {
    // Clear any existing interval for this step
    const existingInterval = progressIntervalsRef.current.get(stepId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    let progress = 0;
    const maxProgress = 80;
    const speed = 0.1;

    const interval = setInterval(() => {
      // Asymptotic approach: fast at start, slow near end
      const remaining = maxProgress - progress;
      const increment = Math.max(0.5, remaining * speed);
      progress = Math.min(maxProgress, progress + increment);

      setState(prev => ({
        ...prev,
        steps: prev.steps.map(s =>
          s.id === stepId ? { ...s, progress: Math.round(progress) } : s
        ),
      }));
    }, 100);

    progressIntervalsRef.current.set(stepId, interval);
  }, []);

  /**
   * Complete progress for a step (jump to 100%)
   */
  const completeStepProgress = useCallback((stepId: PipelineStep['id']) => {
    const interval = progressIntervalsRef.current.get(stepId);
    if (interval) {
      clearInterval(interval);
      progressIntervalsRef.current.delete(stepId);
    }

    setState(prev => ({
      ...prev,
      steps: prev.steps.map(s =>
        s.id === stepId ? { ...s, progress: 100 } : s
      ),
    }));
  }, []);

  /**
   * Reset to idle state
   */
  const reset = useCallback(() => {
    if (minimizeTimeoutRef.current) {
      clearTimeout(minimizeTimeoutRef.current);
      minimizeTimeoutRef.current = null;
    }
    clearProgressIntervals();
    setState({
      status: 'idle',
      steps: initialSteps.map(s => ({ ...s, status: 'pending', duration: undefined, error: undefined, progress: 0 })),
      lambdaName: null,
      packageName: null,
      changedFile: null,
      error: null,
      errorType: null,
      errorDetails: null,
      totalDuration: null,
      minimized: false,
      pendingRestart: false,
    });
  }, [clearProgressIntervals]);

  /**
   * Dismiss (minimize) the pipeline card
   */
  const dismiss = useCallback(() => {
    setState(prev => ({ ...prev, minimized: true }));
  }, []);

  /**
   * Update a specific step's status
   * Automatically starts/stops progress animation based on status
   */
  const updateStep = useCallback((
    stepId: PipelineStep['id'],
    update: Partial<PipelineStep>
  ) => {
    // Start progress animation when step starts running
    if (update.status === 'running') {
      startStepProgress(stepId);
    }
    // Complete progress when step finishes (success or error)
    else if (update.status === 'success' || update.status === 'error') {
      completeStepProgress(stepId);
    }

    setState(prev => ({
      ...prev,
      steps: prev.steps.map(s =>
        s.id === stepId ? { ...s, ...update } : s
      ),
    }));
  }, [startStepProgress, completeStepProgress]);

  // Track pending changes during pipeline run (must be before pipeline functions)
  const pendingChangesRef = useRef<{ cdk: boolean; lambda: string | null }>({ cdk: false, lambda: null });

  /**
   * Run the full pipeline with retry support for infrastructure errors
   */
  const runFullPipeline = useCallback(async (packageName: string, retryCount = 0) => {
    const lambdaName = getLambdaFromPath(`packages/${packageName}/`) || packageName;
    const startTime = Date.now();

    isRunningRef.current = true;

    // Reset and start (show retry count if retrying)
    setState(prev => ({
      ...prev,
      status: 'running',
      steps: initialSteps.map(s => ({ ...s, status: 'pending', duration: undefined, error: undefined })),
      lambdaName,
      packageName,
      error: retryCount > 0 ? `Retry ${retryCount}/${MAX_RETRIES}...` : null,
      errorType: null,
      errorDetails: null,
      totalDuration: null,
      minimized: false,
    }));

    try {
      // Steps 1-3: Build → Zip → Deploy
      // Note: runPipeline handles step status updates via callback, including sequential animation
      const pipelineResult = await runPipeline(packageName, (step, status) => {
        updateStep(step, { status });
      });

      // Only update durations after pipeline completes (status already set by callback)
      if (pipelineResult.steps.build?.duration) {
        updateStep('build', { duration: pipelineResult.steps.build.duration });
      }
      if (pipelineResult.steps.zip?.duration) {
        updateStep('zip', { duration: pipelineResult.steps.zip.duration });
      }
      if (pipelineResult.steps.deploy?.duration) {
        updateStep('deploy', { duration: pipelineResult.steps.deploy.duration });
      }

      // Check if deploy failed
      if (!pipelineResult.success) {
        const failedStep = !pipelineResult.steps.build?.success ? 'build' :
          !pipelineResult.steps.zip?.success ? 'zip' : 'deploy';
        const failedStepResult = pipelineResult.steps[failedStep as keyof typeof pipelineResult.steps];

        // Check if it's a retryable infrastructure error
        const errorMsg = failedStepResult?.error || '';
        if (isInfraError(errorMsg) && retryCount < MAX_RETRIES) {
          // Show retry message
          setState(prev => ({
            ...prev,
            status: 'running',
            error: `Infra-Fehler, Retry ${retryCount + 1}/${MAX_RETRIES}...`,
          }));

          // Wait and retry
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          return runFullPipeline(packageName, retryCount + 1);
        }

        setState(prev => ({
          ...prev,
          status: 'error',
          error: failedStepResult?.error || 'Pipeline failed',
          errorType: failedStep === 'build' ? 'build' : 'infra',
          errorDetails: failedStepResult?.details || null,
          totalDuration: Date.now() - startTime,
        }));

        isRunningRef.current = false;
        return;
      }

      // Step 4: Test (run validator)
      updateStep('test', { status: 'running' });

      const validator = getValidator(phase);
      if (validator) {
        const testStart = Date.now();
        const validationResult = await validator.validate();

        updateStep('test', {
          status: validationResult.passed ? 'success' : 'error',
          duration: Date.now() - testStart,
          error: validationResult.hints?.[0],
        });

        if (!validationResult.passed) {
          setState(prev => ({
            ...prev,
            status: 'error',
            error: validationResult.hints?.[0] || 'Test failed',
            errorType: 'test',
            errorDetails: validationResult.hints?.slice(1).join('\n') || null,
            totalDuration: Date.now() - startTime,
          }));

          isRunningRef.current = false;
          return;
        }
      } else {
        // No validator - skip test step
        updateStep('test', { status: 'success', duration: 0 });
      }

      // Success!
      const totalDuration = Date.now() - startTime;
      setState(prev => ({
        ...prev,
        status: 'success',
        totalDuration,
      }));

      // Auto-minimize after 3 seconds
      minimizeTimeoutRef.current = setTimeout(() => {
        setState(prev => ({ ...prev, minimized: true }));
      }, 3000);

    } catch (error) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: 'infra',
        errorDetails: null,
        totalDuration: Date.now() - startTime,
      }));
    } finally {
      isRunningRef.current = false;

      // Check for pending changes - CDK first, then Lambda
      setState(prev => {
        if (prev.pendingRestart) {
          setTimeout(() => {
            // Priority: CDK changes first
            if (pendingChangesRef.current.cdk) {
              pendingChangesRef.current.cdk = false;
              runCdkDeployPipeline();
            } else if (pendingChangesRef.current.lambda) {
              const pkg = pendingChangesRef.current.lambda;
              pendingChangesRef.current.lambda = null;
              runFullPipeline(pkg);
            }
          }, 100);
          return { ...prev, pendingRestart: false };
        }
        return prev;
      });
    }
  }, [phase, updateStep]);

  /**
   * Run CDK deploy pipeline (for infrastructure changes)
   */
  const runCdkDeployPipeline = useCallback(async () => {
    const startTime = Date.now();

    isRunningRef.current = true;

    // Reset and start with CDK-specific steps
    setState(prev => ({
      ...prev,
      status: 'running',
      steps: [
        { id: 'build', label: 'CDK Synth', status: 'pending' },
        { id: 'zip', label: 'CDK Deploy', status: 'pending' },
        { id: 'deploy', label: 'Waiting', status: 'pending' },
        { id: 'test', label: 'Test', status: 'pending' },
      ],
      lambdaName: 'CDK Stack',
      packageName: 'cdk',
      error: null,
      errorType: null,
      errorDetails: null,
      totalDuration: null,
      minimized: false,
    }));

    try {
      // Step 1-2: CDK Deploy (synth + deploy combined)
      updateStep('build', { status: 'running' });
      updateStep('zip', { status: 'running' });

      const cdkResult = await runCdkDeploy();

      if (cdkResult.success) {
        updateStep('build', { status: 'success', duration: cdkResult.duration / 2 });
        updateStep('zip', { status: 'success', duration: cdkResult.duration / 2 });
        updateStep('deploy', { status: 'success', duration: 0 });
      } else {
        updateStep('build', { status: 'error', error: cdkResult.error });
        setState(prev => ({
          ...prev,
          status: 'error',
          error: cdkResult.error || 'CDK Deploy failed',
          errorType: 'infra',
          errorDetails: cdkResult.details || null,
          totalDuration: Date.now() - startTime,
        }));
        isRunningRef.current = false;
        return;
      }

      // Step 3: Test (run validator)
      updateStep('test', { status: 'running' });

      const validator = getValidator(phase);
      if (validator) {
        const testStart = Date.now();
        const validationResult = await validator.validate();

        updateStep('test', {
          status: validationResult.passed ? 'success' : 'error',
          duration: Date.now() - testStart,
          error: validationResult.hints?.[0],
        });

        if (!validationResult.passed) {
          setState(prev => ({
            ...prev,
            status: 'error',
            error: validationResult.hints?.[0] || 'Test failed',
            errorType: 'test',
            errorDetails: validationResult.hints?.slice(1).join('\n') || null,
            totalDuration: Date.now() - startTime,
          }));
          isRunningRef.current = false;
          return;
        }
      } else {
        updateStep('test', { status: 'success', duration: 0 });
      }

      // Success!
      const totalDuration = Date.now() - startTime;
      setState(prev => ({
        ...prev,
        status: 'success',
        totalDuration,
      }));

      // Auto-minimize after 3 seconds
      minimizeTimeoutRef.current = setTimeout(() => {
        setState(prev => ({ ...prev, minimized: true }));
      }, 3000);

    } catch (error) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: 'infra',
        errorDetails: null,
        totalDuration: Date.now() - startTime,
      }));
    } finally {
      isRunningRef.current = false;

      // After CDK deploy: check if Lambda hot-reload is pending
      setState(prev => {
        if (prev.pendingRestart && pendingChangesRef.current.lambda) {
          const pkg = pendingChangesRef.current.lambda;
          pendingChangesRef.current.lambda = null;
          setTimeout(() => {
            runFullPipeline(pkg);
          }, 100);
          return { ...prev, pendingRestart: false };
        }
        return prev;
      });
    }
  }, [phase, updateStep]);

  /**
   * Handle file change - show immediate "detected" feedback
   */
  const handleFileChange = useCallback((filePath: string) => {
    const isCdk = isCdkPath(filePath);
    const packageName = !isCdk ? extractPackageFromPath(filePath) : null;
    const fileName = filePath.split('/').pop() || filePath;

    // Race condition handling: Track pending changes
    if (isRunningRef.current) {
      if (isCdk) {
        pendingChangesRef.current.cdk = true;
      } else if (packageName) {
        pendingChangesRef.current.lambda = packageName;
      }
      setState(prev => ({ ...prev, pendingRestart: true, changedFile: fileName }));
      return;
    }

    // Show immediate "detected" feedback
    setState(prev => ({
      ...prev,
      status: 'detected',
      changedFile: fileName,
      lambdaName: isCdk ? 'CDK Stack' : (getLambdaFromPath(`packages/${packageName}/`) || packageName),
      minimized: false,
    }));

    // CDK change - always run CDK deploy first
    if (isCdk) {
      pendingChangesRef.current.cdk = false;
      // Small delay so user sees "detected" state
      setTimeout(() => runCdkDeployPipeline(), 200);
      return;
    }

    // Lambda change - run hot reload
    if (packageName) {
      pendingChangesRef.current.lambda = null;
      // Small delay so user sees "detected" state
      setTimeout(() => runFullPipeline(packageName), 200);
    }
  }, [runFullPipeline, runCdkDeployPipeline]);

  // Keep ref updated with latest handler
  useEffect(() => {
    handleFileChangeRef.current = handleFileChange;
  }, [handleFileChange]);

  // Serialize watchPaths for stable effect dependency (prevents watcher recreation)
  const watchPathsKey = watchPaths.join('|');

  // File watcher effect
  // NOTE: Chokidar v4+ no longer supports globs, so we watch directories and filter manually
  useEffect(() => {
    if (!enabled || watchPaths.length === 0) {
      setWatching(false);
      return;
    }

    const projectRoot = getProjectRoot();

    // Combine Lambda watch paths with CDK watch paths
    const allWatchPaths = [...watchPaths, ...workshopConfig.cdkWatchPaths];

    // Extract directories from glob patterns (e.g., "./packages/foo/src/**/*.ts" -> "packages/foo/src")
    // Chokidar v5 doesn't support globs anymore, so we watch the directories
    const watchDirs = allWatchPaths.map(p => {
      const cleanPath = p.startsWith('./') ? p.slice(2) : p;
      // Remove glob parts: everything from first * or **
      const dirPart = cleanPath.split(/[*]/).shift() || cleanPath;
      // Remove trailing slash
      const dir = dirPart.replace(/\/$/, '');
      return `${projectRoot}/${dir}`;
    });

    // Dedupe directories
    const uniqueDirs = [...new Set(watchDirs)];

    // Debug logging - nur mit WORKSHOP_WATCHER_DEBUG=1, ins OS-Tempdir und
    // crash-sicher. ('/tmp/...' hart kodiert = C:\tmp auf Windows = ENOENT
    // im Mount-Effect = die ganze CLI stirbt im Ink-Error-Overlay!)
    const debugEnabled = process.env.WORKSHOP_WATCHER_DEBUG === '1';
    const debugLogPath = joinPath(tmpdir(), 'workshop-watcher-debug.log');
    const log = (msg: string) => {
      if (!debugEnabled) return;
      try {
        appendFileSync(debugLogPath, `${new Date().toISOString()} ${msg}\n`);
      } catch {
        // Debug-Log darf niemals die CLI crashen
      }
    };
    log(`INIT: watching dirs ${uniqueDirs.join(', ')}`);

    const watcher = chokidar.watch(uniqueDirs, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
      // macOS needs usePolling for some editors (VS Code atomic saves)
      usePolling: process.platform === 'darwin',
      interval: 300,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    watcher.on('ready', () => {
      log('READY');
      setWatching(true);
    });

    watcher.on('change', (path) => {
      // Only react to .ts source files (not .d.ts declaration files or .js)
      if (!path.endsWith('.ts') || path.endsWith('.d.ts')) {
        log(`SKIP: ${path}`);
        return;
      }
      log(`CHANGE: ${path}`);
      handleFileChangeRef.current(path);
    });

    watcher.on('add', (path) => {
      // Only react to .ts source files (not .d.ts declaration files or .js)
      if (!path.endsWith('.ts') || path.endsWith('.d.ts')) return;
      log(`ADD: ${path}`);
      handleFileChangeRef.current(path);
    });

    watcher.on('error', (err) => {
      log(`ERROR: ${err}`);
      setWatching(false);
    });

    return () => {
      log('CLOSE');
      watcher.close();
      setWatching(false);
      clearProgressIntervals();
      if (minimizeTimeoutRef.current) {
        clearTimeout(minimizeTimeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchPathsKey, enabled, clearProgressIntervals]); // Use serialized key instead of array reference

  /**
   * Get progress for a specific step
   */
  const getStepProgress = useCallback((stepId: PipelineStep['id']): number => {
    const step = state.steps.find(s => s.id === stepId);
    if (!step) return 0;
    if (step.status === 'success') return 100;
    if (step.status === 'error') return step.progress ?? 100;
    if (step.status === 'pending') return 0;
    return step.progress ?? 0;
  }, [state.steps]);

  return {
    ...state,
    watching,
    reset,
    dismiss,
    getStepProgress,
  };
}
